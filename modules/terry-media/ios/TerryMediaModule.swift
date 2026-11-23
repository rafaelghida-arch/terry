import AVFoundation
import Speech
import CoreGraphics
import ExpoModulesCore
import UIKit

// Módulo nativo do TERRY (iOS).
// - getVideoInfo: duração e tamanho orientado
// - analyzeVideo: diferenças entre quadros (para achar cortes), envelope de áudio e quadros-chave em JPEG
// - exportComposition: monta os clipes em 9:16 com cortes secos, recorte, volumes e narração e exporta MP4

public class TerryMediaModule: Module {
  private var exportSession: AVAssetExportSession?
  private var progressTimer: DispatchSourceTimer?

  public func definition() -> ModuleDefinition {
    Name("TerryMedia")

    Events("onExportProgress")

    AsyncFunction("getVideoInfo") { (uri: String, promise: Promise) in
      Task {
        do {
          let info = try await TerryMediaModule.videoInfo(url: TerryMediaModule.url(from: uri))
          promise.resolve(info)
        } catch {
          promise.reject("ERR_INFO", "Não consegui ler o vídeo: \(error.localizedDescription)")
        }
      }
    }

    AsyncFunction("analyzeVideo") { (uri: String, options: [String: Any], promise: Promise) in
      Task.detached(priority: .userInitiated) {
        do {
          let result = try await TerryMediaModule.analyze(url: TerryMediaModule.url(from: uri), options: options)
          promise.resolve(result)
        } catch {
          promise.reject("ERR_ANALYZE", "Falha ao analisar o vídeo: \(error.localizedDescription)")
        }
      }
    }

    AsyncFunction("exportComposition") { (spec: [String: Any], promise: Promise) in
      Task {
        do {
          let result = try await self.export(spec: spec)
          promise.resolve(result)
        } catch {
          self.stopProgress()
          promise.reject("ERR_EXPORT", error.localizedDescription)
        }
      }
    }

    // Pixels de alguns quadros reduzidos (0xRRGGBB), para achar as cores do vídeo.
    AsyncFunction("framePixels") { (uri: String, count: Int, size: Int, promise: Promise) in
      Task {
        do {
          let px = try await TerryMediaModule.framePixels(url: TerryMediaModule.url(from: uri), count: count, size: size)
          promise.resolve(["size": size, "pixels": px])
        } catch {
          promise.reject("ERR_PIXELS", "Não consegui ler as cores do vídeo: \(error.localizedDescription)")
        }
      }
    }

    // Transcreve a fala de um clipe no aparelho (pt-BR). Devolve palavras com tempo.
    AsyncFunction("transcribe") { (uri: String, language: String, promise: Promise) in
      TerryMediaModule.transcribe(url: TerryMediaModule.url(from: uri), language: language) { result in
        promise.resolve(result)
      }
    }

    Function("cancelExport") {
      self.exportSession?.cancelExport()
    }
  }

  // MARK: - Utilidades

  static func url(from uri: String) -> URL {
    if uri.hasPrefix("file://"), let u = URL(string: uri) { return u }
    return URL(fileURLWithPath: uri)
  }

  static func orientedSize(natural: CGSize, transform: CGAffineTransform) -> CGSize {
    let r = CGRect(origin: .zero, size: natural).applying(transform)
    return CGSize(width: abs(r.width), height: abs(r.height))
  }

  static func videoInfo(url: URL) async throws -> [String: Any] {
    let asset = AVURLAsset(url: url, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
    let duration = try await asset.load(.duration)
    let videoTracks = try await asset.loadTracks(withMediaType: .video)
    let audioTracks = try await asset.loadTracks(withMediaType: .audio)
    guard let vt = videoTracks.first else {
      throw NSError(domain: "TerryMedia", code: 1, userInfo: [NSLocalizedDescriptionKey: "Arquivo sem trilha de vídeo"])
    }
    let (natural, transform) = try await vt.load(.naturalSize, .preferredTransform)
    let size = orientedSize(natural: natural, transform: transform)
    return [
      "duration": CMTimeGetSeconds(duration),
      "width": Double(size.width),
      "height": Double(size.height),
      "hasAudio": !audioTracks.isEmpty,
    ]
  }

  // MARK: - Cores

  static func framePixels(url: URL, count: Int, size: Int) async throws -> [Int] {
    let asset = AVURLAsset(url: url)
    let duration = CMTimeGetSeconds(try await asset.load(.duration))
    let gen = AVAssetImageGenerator(asset: asset)
    gen.appliesPreferredTrackTransform = true
    gen.maximumSize = CGSize(width: size * 4, height: size * 4)
    var out: [Int] = []
    let n = max(1, min(count, 12))
    for i in 0..<n {
      let t = duration * (Double(i) + 0.5) / Double(n)
      guard let image = try? await gen.image(at: CMTime(seconds: t, preferredTimescale: 600)).image else { continue }
      var data = [UInt8](repeating: 0, count: size * size * 4)
      data.withUnsafeMutableBytes { ptr in
        if let ctx = CGContext(data: ptr.baseAddress, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4,
                               space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) {
          ctx.draw(image, in: CGRect(x: 0, y: 0, width: size, height: size))
        }
      }
      for p in stride(from: 0, to: data.count, by: 4) {
        out.append((Int(data[p]) << 16) | (Int(data[p + 1]) << 8) | Int(data[p + 2]))
      }
    }
    return out
  }

  // MARK: - Transcrição

  static func transcribe(url: URL, language: String, done: @escaping ([String: Any]) -> Void) {
    var finished = false
    let finish: ([String: Any]) -> Void = { r in
      if finished { return }
      finished = true
      done(r)
    }
    SFSpeechRecognizer.requestAuthorization { status in
      guard status == .authorized else {
        finish(["available": false, "reason": "permissao"])
        return
      }
      guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language)), recognizer.isAvailable else {
        finish(["available": false, "reason": "indisponivel"])
        return
      }
      let request = SFSpeechURLRecognitionRequest(url: url)
      request.shouldReportPartialResults = false
      if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
      if #available(iOS 16, *) { request.addsPunctuation = true }
      var task: SFSpeechRecognitionTask?
      task = recognizer.recognitionTask(with: request) { result, error in
        if let result = result, result.isFinal {
          let words: [[String: Any]] = result.bestTranscription.segments.map {
            ["text": $0.substring, "start": $0.timestamp, "end": $0.timestamp + $0.duration]
          }
          finish(["available": true, "timed": true, "words": words])
          task = nil
        } else if let error = error {
          // Sem fala no arquivo também chega como erro: devolve vazio, não falha.
          finish(["available": true, "timed": true, "words": [], "reason": error.localizedDescription])
          task = nil
        }
      }
      DispatchQueue.main.asyncAfter(deadline: .now() + 90) {
        task?.cancel()
        finish(["available": false, "reason": "tempo"])
      }
    }
  }

  // MARK: - Análise

  static func analyze(url: URL, options: [String: Any]) async throws -> [String: Any] {
    let sampleFps = (options["sampleFps"] as? Double) ?? 4
    let frameCount = (options["frameCount"] as? Int) ?? Int((options["frameCount"] as? Double) ?? 8)
    let frameMaxSize = (options["frameMaxSize"] as? Double) ?? 512
    let audioWindow = (options["audioWindow"] as? Double) ?? 0.1
    let outputDir = TerryMediaModule.url(from: (options["outputDir"] as? String) ?? NSTemporaryDirectory())
    try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)

    let asset = AVURLAsset(url: url, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
    let info = try await videoInfo(url: url)
    let duration = (info["duration"] as? Double) ?? 0

    // 1) Diferenças entre quadros pequenos (16x16 RGB) para detectar cortes.
    let small = AVAssetImageGenerator(asset: asset)
    small.appliesPreferredTrackTransform = true
    small.maximumSize = CGSize(width: 48, height: 48)
    let tol = CMTime(seconds: 0.04, preferredTimescale: 600)
    small.requestedTimeToleranceBefore = tol
    small.requestedTimeToleranceAfter = tol
    let maxSamples = 360.0
    let interval = max(1.0 / sampleFps, duration / maxSamples)
    var diffs: [Double] = []
    var previous: [UInt8]? = nil
    var t = 0.0
    while t < duration {
      let time = CMTime(seconds: t, preferredTimescale: 600)
      if let image = try? await small.image(at: time).image {
        let px = thumbnailPixels(image)
        if let p = previous { diffs.append(meanAbsDiff(p, px)) }
        previous = px
      } else if previous != nil {
        diffs.append(0)
      }
      t += interval
    }

    // 2) Quadros-chave em JPEG para a análise visual.
    let big = AVAssetImageGenerator(asset: asset)
    big.appliesPreferredTrackTransform = true
    big.maximumSize = CGSize(width: frameMaxSize, height: frameMaxSize)
    var frames: [[String: Any]] = []
    let count = max(1, frameCount)
    var times: [Double] = [min(0.3, duration / 4)]
    for i in 1..<count { times.append(duration * (Double(i) + 0.5) / Double(count)) }
    for (i, ft) in times.enumerated() {
      guard let cg = try? await big.image(at: CMTime(seconds: ft, preferredTimescale: 600)).image else { continue }
      let file = outputDir.appendingPathComponent("frame_\(i).jpg")
      if let data = UIImage(cgImage: cg).jpegData(compressionQuality: 0.7) {
        try? data.write(to: file)
        frames.append(["t": ft, "uri": file.absoluteString])
      }
    }

    // 3) Envelope de áudio (dBFS) e taxa de cruzamentos por zero.
    var rms: [Double] = []
    var zcr: [Double] = []
    let hasAudio = (info["hasAudio"] as? Bool) ?? false
    if hasAudio {
      (rms, zcr) = try await audioEnvelope(asset: asset, window: audioWindow)
    }

    return [
      "duration": duration,
      "width": info["width"] ?? 0,
      "height": info["height"] ?? 0,
      "hasAudio": hasAudio,
      "diffs": diffs,
      "diffInterval": interval,
      "rmsDb": rms,
      "zcr": zcr,
      "audioWindow": audioWindow,
      "frames": frames,
    ]
  }

  static func thumbnailPixels(_ image: CGImage) -> [UInt8] {
    let w = 16, h = 16
    var data = [UInt8](repeating: 0, count: w * h * 4)
    let space = CGColorSpaceCreateDeviceRGB()
    data.withUnsafeMutableBytes { ptr in
      if let ctx = CGContext(data: ptr.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                             space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) {
        ctx.interpolationQuality = .low
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
      }
    }
    return data
  }

  static func meanAbsDiff(_ a: [UInt8], _ b: [UInt8]) -> Double {
    guard a.count == b.count, !a.isEmpty else { return 0 }
    var sum = 0
    var n = 0
    for i in stride(from: 0, to: a.count, by: 4) {
      sum += abs(Int(a[i]) - Int(b[i])) + abs(Int(a[i + 1]) - Int(b[i + 1])) + abs(Int(a[i + 2]) - Int(b[i + 2]))
      n += 3
    }
    return Double(sum) / Double(n) / 255.0
  }

  static func audioEnvelope(asset: AVAsset, window: Double) async throws -> ([Double], [Double]) {
    guard let track = try await asset.loadTracks(withMediaType: .audio).first else { return ([], []) }
    let reader = try AVAssetReader(asset: asset)
    let sampleRate = 16000.0
    let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
      AVSampleRateKey: sampleRate,
      AVNumberOfChannelsKey: 1,
    ])
    output.alwaysCopiesSampleData = false
    reader.add(output)
    guard reader.startReading() else { return ([], []) }
    let windowSize = max(1, Int(sampleRate * window))
    var rms: [Double] = []
    var zcr: [Double] = []
    var acc = 0.0
    var crossings = 0
    var count = 0
    var last: Int16 = 0
    while let buffer = output.copyNextSampleBuffer() {
      guard let block = CMSampleBufferGetDataBuffer(buffer) else { continue }
      let length = CMBlockBufferGetDataLength(block)
      var samples = [Int16](repeating: 0, count: length / 2)
      samples.withUnsafeMutableBytes { ptr in
        _ = CMBlockBufferCopyDataBytes(block, atOffset: 0, dataLength: length, destination: ptr.baseAddress!)
      }
      for s in samples {
        let v = Double(s) / 32768.0
        acc += v * v
        if (s >= 0) != (last >= 0) { crossings += 1 }
        last = s
        count += 1
        if count == windowSize {
          let r = sqrt(acc / Double(count))
          rms.append(max(-90, 20 * log10(max(r, 1e-9))))
          zcr.append(Double(crossings) / Double(count))
          acc = 0; crossings = 0; count = 0
        }
      }
    }
    return (rms, zcr)
  }

  // MARK: - Exportação

  struct SegmentSpec {
    let url: URL
    let start: Double
    let end: Double
    let crop: CGRect
    let volume: Float
    let zoomFrom: CGFloat
    let zoomTo: CGFloat
  }

  /// Recorte reduzido em torno do próprio centro: zoom `z` sobre o enquadramento escolhido.
  static func zoomed(_ crop: CGRect, _ z: CGFloat) -> CGRect {
    guard z > 1.0001 else { return crop }
    let w = crop.width / z
    let h = crop.height / z
    return CGRect(x: crop.midX - w / 2, y: crop.midY - h / 2, width: w, height: h)
  }

  static func cropTransform(natural: CGSize, preferred: CGAffineTransform, crop: CGRect, render: CGSize) -> CGAffineTransform {
    let rect = CGRect(origin: .zero, size: natural).applying(preferred)
    let orient = preferred.concatenating(CGAffineTransform(translationX: -rect.minX, y: -rect.minY))
    let ow = abs(rect.width)
    let oh = abs(rect.height)
    let cw = max(1, crop.width * ow)
    let ch = max(1, crop.height * oh)
    let scale = max(render.width / cw, render.height / ch)
    return orient
      .concatenating(CGAffineTransform(translationX: -crop.minX * ow, y: -crop.minY * oh))
      .concatenating(CGAffineTransform(scaleX: scale, y: scale))
  }

  private func export(spec: [String: Any]) async throws -> [String: Any] {
    guard let outputPath = spec["outputPath"] as? String,
          let rawSegments = spec["segments"] as? [[String: Any]], !rawSegments.isEmpty else {
      throw NSError(domain: "TerryMedia", code: 2, userInfo: [NSLocalizedDescriptionKey: "Nenhum clipe para montar"])
    }
    let render = CGSize(width: (spec["width"] as? Double) ?? 1080, height: (spec["height"] as? Double) ?? 1920)
    let fps = Int32((spec["fps"] as? Double) ?? 30)

    let segments: [SegmentSpec] = rawSegments.compactMap { s in
      guard let uri = s["uri"] as? String else { return nil }
      let c = (s["crop"] as? [String: Any]) ?? [:]
      return SegmentSpec(
        url: TerryMediaModule.url(from: uri),
        start: (s["start"] as? Double) ?? 0,
        end: (s["end"] as? Double) ?? 0,
        crop: CGRect(x: (c["left"] as? Double) ?? 0, y: (c["top"] as? Double) ?? 0,
                     width: (c["width"] as? Double) ?? 1, height: (c["height"] as? Double) ?? 1),
        volume: Float((s["volume"] as? Double) ?? 1),
        zoomFrom: CGFloat(((s["zoom"] as? [String: Any])?["from"] as? Double) ?? 1),
        zoomTo: CGFloat(((s["zoom"] as? [String: Any])?["to"] as? Double) ?? 1)
      )
    }

    let composition = AVMutableComposition()
    guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid),
          let audioTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) else {
      throw NSError(domain: "TerryMedia", code: 3, userInfo: [NSLocalizedDescriptionKey: "Não consegui criar a composição"])
    }

    var instructions: [AVMutableVideoCompositionInstruction] = []
    let audioParams = AVMutableAudioMixInputParameters(track: audioTrack)
    var cursor = CMTime.zero
    let timescale: CMTimeScale = 600

    for seg in segments {
      let asset = AVURLAsset(url: seg.url, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
      let assetDuration = try await asset.load(.duration)
      guard let srcVideo = try await asset.loadTracks(withMediaType: .video).first else { continue }
      let srcAudio = try await asset.loadTracks(withMediaType: .audio).first
      let (natural, preferred) = try await srcVideo.load(.naturalSize, .preferredTransform)

      let start = CMTime(seconds: max(0, seg.start), preferredTimescale: timescale)
      var end = CMTime(seconds: seg.end, preferredTimescale: timescale)
      if CMTimeCompare(end, assetDuration) > 0 || seg.end <= 0 { end = assetDuration }
      let range = CMTimeRange(start: start, end: end)
      if CMTimeGetSeconds(range.duration) < 0.05 { continue }

      try videoTrack.insertTimeRange(range, of: srcVideo, at: cursor)
      if let srcAudio = srcAudio {
        let srcAudioRange = try await srcAudio.load(.timeRange)
        let audioRange = CMTimeRangeGetIntersection(range, otherRange: srcAudioRange)
        if CMTimeGetSeconds(audioRange.duration) > 0.01 {
          try audioTrack.insertTimeRange(audioRange, of: srcAudio, at: CMTimeAdd(cursor, CMTimeSubtract(audioRange.start, range.start)))
        }
      }

      let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
      let startT = TerryMediaModule.cropTransform(natural: natural, preferred: preferred, crop: TerryMediaModule.zoomed(seg.crop, seg.zoomFrom), render: render)
      if seg.zoomFrom != seg.zoomTo {
        // Zoom automático: a transformação vai do enquadramento inicial ao final ao longo do take.
        let endT = TerryMediaModule.cropTransform(natural: natural, preferred: preferred, crop: TerryMediaModule.zoomed(seg.crop, seg.zoomTo), render: render)
        layer.setTransformRamp(fromStart: startT, toEnd: endT, timeRange: CMTimeRange(start: cursor, duration: range.duration))
      } else {
        layer.setTransform(startT, at: cursor)
      }
      let instruction = AVMutableVideoCompositionInstruction()
      instruction.timeRange = CMTimeRange(start: cursor, duration: range.duration)
      instruction.layerInstructions = [layer]
      instruction.backgroundColor = UIColor.black.cgColor
      instructions.append(instruction)

      audioParams.setVolume(seg.volume, at: cursor)
      cursor = CMTimeAdd(cursor, range.duration)
    }

    guard !instructions.isEmpty else {
      throw NSError(domain: "TerryMedia", code: 4, userInfo: [NSLocalizedDescriptionKey: "Os clipes estão vazios"])
    }

    // Todos os clipes sem som: tira a trilha vazia para a exportação não falhar.
    var mixParams: [AVMutableAudioMixInputParameters] = []
    if audioTrack.segments.isEmpty {
      composition.removeTrack(audioTrack)
    } else {
      mixParams.append(audioParams)
    }

    // Trilha em loop por baixo, com saída suave no último segundo.
    if let music = spec["music"] as? [String: Any], let mUri = music["uri"] as? String {
      let mAsset = AVURLAsset(url: TerryMediaModule.url(from: mUri))
      if let mSrc = try await mAsset.loadTracks(withMediaType: .audio).first,
         let mTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
        let mDuration = try await mAsset.load(.duration)
        var at = CMTime.zero
        while CMTimeCompare(at, cursor) < 0 && CMTimeGetSeconds(mDuration) > 0.5 {
          let length = CMTimeMinimum(mDuration, CMTimeSubtract(cursor, at))
          try mTrack.insertTimeRange(CMTimeRange(start: .zero, duration: length), of: mSrc, at: at)
          at = CMTimeAdd(at, length)
        }
        let vol = Float((music["volume"] as? Double) ?? 0.3)
        let p = AVMutableAudioMixInputParameters(track: mTrack)
        p.setVolume(vol, at: .zero)
        let fade = CMTime(seconds: min(1.0, CMTimeGetSeconds(cursor) / 4), preferredTimescale: 600)
        p.setVolumeRamp(fromStartVolume: vol, toEndVolume: 0, timeRange: CMTimeRange(start: CMTimeSubtract(cursor, fade), duration: fade))
        mixParams.append(p)
      }
    }

    // Narração gravada por cima da prévia.
    if let narration = spec["narration"] as? [String: Any], let nUri = narration["uri"] as? String {
      let nAsset = AVURLAsset(url: TerryMediaModule.url(from: nUri))
      if let nSrc = try await nAsset.loadTracks(withMediaType: .audio).first,
         let nTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) {
        let nDuration = try await nAsset.load(.duration)
        let length = CMTimeMinimum(nDuration, cursor)
        try nTrack.insertTimeRange(CMTimeRange(start: .zero, duration: length), of: nSrc, at: .zero)
        let p = AVMutableAudioMixInputParameters(track: nTrack)
        p.setVolume(Float((narration["volume"] as? Double) ?? 1), at: .zero)
        mixParams.append(p)
      }
    }

    let videoComposition = AVMutableVideoComposition()
    videoComposition.renderSize = render
    videoComposition.frameDuration = CMTime(value: 1, timescale: fps)
    videoComposition.instructions = instructions

    // Legendas (opcionais): camadas de texto que aparecem só no intervalo de cada fala.
    if let cap = spec["captions"] as? [String: Any], let cues = cap["cues"] as? [[String: Any]], !cues.isEmpty {
      let parent = CALayer()
      parent.frame = CGRect(origin: .zero, size: render)
      let videoLayer = CALayer()
      videoLayer.frame = parent.frame
      parent.addSublayer(videoLayer)
      let style = (cap["style"] as? String) ?? "faixa"
      let position = (cap["position"] as? String) ?? "baixo"
      let color = TerryMediaModule.color(hex: (cap["color"] as? String) ?? "#FFFFFF")
      for cue in cues {
        guard let text = cue["text"] as? String, !text.isEmpty,
              let start = cue["start"] as? Double, let end = cue["end"] as? Double, end > start else { continue }
        let layer = TerryMediaModule.captionLayer(text: text, style: style, position: position, color: color, render: render)
        layer.opacity = 0
        let show = CABasicAnimation(keyPath: "opacity")
        show.fromValue = 1
        show.toValue = 1
        show.beginTime = AVCoreAnimationBeginTimeAtZero + start
        show.duration = end - start
        show.isRemovedOnCompletion = true
        show.fillMode = .removed
        layer.add(show, forKey: "show")
        parent.addSublayer(layer)
      }
      videoComposition.animationTool = AVVideoCompositionCoreAnimationTool(postProcessingAsVideoLayer: videoLayer, in: parent)
    }

    let audioMix = AVMutableAudioMix()
    audioMix.inputParameters = mixParams

    let outURL = TerryMediaModule.url(from: outputPath)
    try? FileManager.default.removeItem(at: outURL)
    try FileManager.default.createDirectory(at: outURL.deletingLastPathComponent(), withIntermediateDirectories: true)

    guard let session = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality) else {
      throw NSError(domain: "TerryMedia", code: 5, userInfo: [NSLocalizedDescriptionKey: "Exportação indisponível neste aparelho"])
    }
    session.outputURL = outURL
    session.outputFileType = .mp4
    session.videoComposition = videoComposition
    session.audioMix = audioMix
    session.shouldOptimizeForNetworkUse = true
    exportSession = session
    startProgress(session)

    await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
      session.exportAsynchronously { cont.resume() }
    }
    stopProgress()
    exportSession = nil

    switch session.status {
    case .completed:
      sendEvent("onExportProgress", ["progress": 1.0])
      return ["uri": outURL.absoluteString, "duration": CMTimeGetSeconds(cursor)]
    case .cancelled:
      throw NSError(domain: "TerryMedia", code: 6, userInfo: [NSLocalizedDescriptionKey: "Exportação cancelada"])
    default:
      throw session.error ?? NSError(domain: "TerryMedia", code: 7, userInfo: [NSLocalizedDescriptionKey: "Falha na exportação"])
    }
  }

  /// Uma legenda: texto branco pesado, centralizado, com faixa escura ou contorno.
  /// Coordenadas do AVVideoCompositionCoreAnimationTool: origem embaixo à esquerda.
  static func color(hex: String) -> UIColor {
    let v = Int(hex.replacingOccurrences(of: "#", with: ""), radix: 16) ?? 0xFFFFFF
    return UIColor(red: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255, blue: CGFloat(v & 255) / 255, alpha: 1)
  }

  static func captionLayer(text: String, style: String, position: String, color: UIColor, render: CGSize) -> CALayer {
    let fontSize = render.width * 0.054
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    paragraph.lineBreakMode = .byWordWrapping
    var attrs: [NSAttributedString.Key: Any] = [
      .font: UIFont.systemFont(ofSize: fontSize, weight: .heavy),
      .foregroundColor: color,
      .paragraphStyle: paragraph,
    ]
    if style == "contorno" {
      attrs[.strokeColor] = UIColor.black
      attrs[.strokeWidth] = -7.0
    }
    let attributed = NSAttributedString(string: text, attributes: attrs)
    let maxWidth = render.width * 0.82
    let bounds = attributed.boundingRect(with: CGSize(width: maxWidth, height: .greatestFiniteMagnitude),
                                         options: [.usesLineFragmentOrigin, .usesFontLeading], context: nil)
    let padH = fontSize * 0.55
    let padV = fontSize * 0.3
    let w = ceil(bounds.width) + padH * 2
    let h = ceil(bounds.height) + padV * 2
    let y = position == "meio" ? (render.height - h) / 2 : render.height * 0.15
    let box = CALayer()
    box.frame = CGRect(x: (render.width - w) / 2, y: y, width: w, height: h)
    if style == "faixa" {
      box.backgroundColor = UIColor(white: 0, alpha: 0.62).cgColor
      box.cornerRadius = fontSize * 0.35
    }
    let textLayer = CATextLayer()
    textLayer.string = attributed
    textLayer.isWrapped = true
    textLayer.alignmentMode = .center
    textLayer.contentsScale = 1
    textLayer.frame = CGRect(x: padH, y: padV, width: ceil(bounds.width), height: ceil(bounds.height))
    box.addSublayer(textLayer)
    return box
  }

  private func startProgress(_ session: AVAssetExportSession) {
    stopProgress()
    let timer = DispatchSource.makeTimerSource(queue: .main)
    timer.schedule(deadline: .now(), repeating: .milliseconds(250))
    timer.setEventHandler { [weak self, weak session] in
      guard let session = session else { return }
      self?.sendEvent("onExportProgress", ["progress": Double(session.progress)])
    }
    timer.resume()
    progressTimer = timer
  }

  private func stopProgress() {
    progressTimer?.cancel()
    progressTimer = nil
  }
}
