import AVFoundation
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
        volume: Float((s["volume"] as? Double) ?? 1)
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
      layer.setTransform(TerryMediaModule.cropTransform(natural: natural, preferred: preferred, crop: seg.crop, render: render), at: cursor)
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
