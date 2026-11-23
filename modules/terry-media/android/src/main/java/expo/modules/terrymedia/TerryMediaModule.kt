package expo.modules.terrymedia

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.audio.AudioProcessor
import androidx.media3.common.audio.ChannelMixingAudioProcessor
import androidx.media3.common.audio.ChannelMixingMatrix
import androidx.media3.common.Effect
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Crop
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.EditedMediaItemSequence
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.ProgressHolder
import androidx.media3.transformer.Transformer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteOrder
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

// Módulo nativo do TERRY (Android).
// - getVideoInfo: duração e tamanho orientado
// - analyzeVideo: diferenças entre quadros, envelope de áudio e quadros-chave em JPEG
// - exportComposition: Media3 Transformer — cortes secos, recorte 9:16, volumes, narração, MP4 H.264/AAC

@UnstableApi
class TerryMediaModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var transformer: Transformer? = null
  private var progressRunnable: Runnable? = null

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("Sem contexto do app")

  override fun definition() = ModuleDefinition {
    Name("TerryMedia")

    Events("onExportProgress")

    AsyncFunction("getVideoInfo") { uri: String, promise: Promise ->
      Thread {
        try {
          promise.resolve(videoInfo(uri))
        } catch (e: Exception) {
          promise.reject("ERR_INFO", "Não consegui ler o vídeo: ${e.message}", e)
        }
      }.start()
    }

    AsyncFunction("analyzeVideo") { uri: String, options: Map<String, Any?>, promise: Promise ->
      Thread {
        try {
          promise.resolve(analyze(uri, options))
        } catch (e: Exception) {
          promise.reject("ERR_ANALYZE", "Falha ao analisar o vídeo: ${e.message}", e)
        }
      }.start()
    }

    AsyncFunction("exportComposition") { spec: Map<String, Any?>, promise: Promise ->
      mainHandler.post {
        try {
          startExport(spec, promise)
        } catch (e: Exception) {
          stopProgress()
          promise.reject("ERR_EXPORT", e.message ?: "Falha na exportação", e)
        }
      }
    }

    Function("cancelExport") {
      mainHandler.post {
        transformer?.cancel()
        transformer = null
        stopProgress()
      }
    }
  }

  // ---------- utilidades ----------

  private fun toUri(uri: String): Uri =
    if (uri.startsWith("file://") || uri.startsWith("content://")) Uri.parse(uri) else Uri.fromFile(File(uri))

  private fun toPath(uri: String): String = if (uri.startsWith("file://")) Uri.parse(uri).path!! else uri

  private fun retriever(uri: String): MediaMetadataRetriever {
    val r = MediaMetadataRetriever()
    r.setDataSource(context, toUri(uri))
    return r
  }

  private fun num(v: Any?, def: Double): Double = (v as? Number)?.toDouble() ?: def

  private fun videoInfo(uri: String): Map<String, Any> {
    val r = retriever(uri)
    try {
      val durationMs = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
      val w = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
      val h = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
      val rot = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
      val hasAudio = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO) == "yes"
      val swap = rot % 180 != 0
      return mapOf(
        "duration" to durationMs / 1000.0,
        "width" to (if (swap) h else w).toDouble(),
        "height" to (if (swap) w else h).toDouble(),
        "hasAudio" to hasAudio,
        "rotation" to rot,
      )
    } finally {
      r.release()
    }
  }

  // ---------- análise ----------

  private fun orient(bitmap: Bitmap, rotation: Int, orientedW: Double, orientedH: Double): Bitmap {
    if (rotation % 360 == 0) return bitmap
    val bitmapPortrait = bitmap.height >= bitmap.width
    val wantPortrait = orientedH >= orientedW
    if (bitmapPortrait == wantPortrait) return bitmap
    val m = Matrix().apply { postRotate(rotation.toFloat()) }
    return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, m, true)
  }

  private fun pixels(bitmap: Bitmap): IntArray {
    val small = Bitmap.createScaledBitmap(bitmap, 16, 16, true)
    val px = IntArray(256)
    small.getPixels(px, 0, 16, 0, 0, 16, 16)
    if (small != bitmap) small.recycle()
    return px
  }

  private fun diff(a: IntArray, b: IntArray): Double {
    var sum = 0L
    for (i in a.indices) {
      val x = a[i]
      val y = b[i]
      sum += abs(((x shr 16) and 0xff) - ((y shr 16) and 0xff)) +
        abs(((x shr 8) and 0xff) - ((y shr 8) and 0xff)) +
        abs((x and 0xff) - (y and 0xff))
    }
    return sum.toDouble() / (a.size * 3) / 255.0
  }

  private fun analyze(uri: String, options: Map<String, Any?>): Map<String, Any> {
    val sampleFps = num(options["sampleFps"], 4.0)
    val frameCount = num(options["frameCount"], 8.0).toInt().coerceIn(1, 16)
    val frameMaxSize = num(options["frameMaxSize"], 512.0).toInt()
    val audioWindow = num(options["audioWindow"], 0.1)
    val outDir = File(toPath((options["outputDir"] as? String) ?: context.cacheDir.absolutePath))
    outDir.mkdirs()

    val info = videoInfo(uri)
    val duration = info["duration"] as Double
    val ow = info["width"] as Double
    val oh = info["height"] as Double
    val rotation = info["rotation"] as Int
    val r = retriever(uri)

    val diffs = ArrayList<Double>()
    val interval = max(1.0 / sampleFps, duration / 240.0)
    try {
      var prev: IntArray? = null
      var t = 0.0
      while (t < duration) {
        val bmp = r.getScaledFrameAtTime((t * 1_000_000).toLong(), MediaMetadataRetriever.OPTION_CLOSEST, 48, 48)
        if (bmp != null) {
          val px = pixels(bmp)
          bmp.recycle()
          prev?.let { diffs.add(diff(it, px)) }
          prev = px
        } else if (prev != null) {
          diffs.add(0.0)
        }
        t += interval
      }

      val frames = ArrayList<Map<String, Any>>()
      val times = ArrayList<Double>()
      times.add(min(0.3, duration / 4))
      for (i in 1 until frameCount) times.add(duration * (i + 0.5) / frameCount)
      val scale = frameMaxSize.toDouble() / max(ow, oh).coerceAtLeast(1.0)
      // getScaledFrameAtTime trabalha no tamanho codificado (antes da rotação)
      val swap = rotation % 180 != 0
      val dw = ((if (swap) oh else ow) * min(1.0, scale)).toInt().coerceAtLeast(16)
      val dh = ((if (swap) ow else oh) * min(1.0, scale)).toInt().coerceAtLeast(16)
      times.forEachIndexed { i, ft ->
        val raw = r.getScaledFrameAtTime((ft * 1_000_000).toLong(), MediaMetadataRetriever.OPTION_CLOSEST_SYNC, dw, dh)
          ?: return@forEachIndexed
        val bmp = orient(raw, rotation, ow, oh)
        val file = File(outDir, "frame_$i.jpg")
        FileOutputStream(file).use { bmp.compress(Bitmap.CompressFormat.JPEG, 70, it) }
        if (bmp != raw) bmp.recycle()
        raw.recycle()
        frames.add(mapOf("t" to ft, "uri" to Uri.fromFile(file).toString()))
      }

      val hasAudio = info["hasAudio"] as Boolean
      val (rms, zcr) = if (hasAudio) audioEnvelope(uri, audioWindow) else Pair(emptyList<Double>(), emptyList<Double>())

      return mapOf(
        "duration" to duration,
        "width" to ow,
        "height" to oh,
        "hasAudio" to hasAudio,
        "diffs" to diffs,
        "diffInterval" to interval,
        "rmsDb" to rms,
        "zcr" to zcr,
        "audioWindow" to audioWindow,
        "frames" to frames,
      )
    } finally {
      r.release()
    }
  }

  /** Decodifica o áudio para PCM 16 bits, mistura em mono e mede RMS (dBFS) e ZCR por janela. */
  private fun audioEnvelope(uri: String, window: Double): Pair<List<Double>, List<Double>> {
    val extractor = MediaExtractor()
    extractor.setDataSource(context, toUri(uri), null)
    var trackIndex = -1
    var format: MediaFormat? = null
    for (i in 0 until extractor.trackCount) {
      val f = extractor.getTrackFormat(i)
      if (f.getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true) {
        trackIndex = i
        format = f
        break
      }
    }
    if (trackIndex < 0 || format == null) {
      extractor.release()
      return Pair(emptyList(), emptyList())
    }
    extractor.selectTrack(trackIndex)
    val codec = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
    codec.configure(format, null, null, 0)
    codec.start()

    var sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
    var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
    var windowSize = max(1, (sampleRate * window).toInt())
    val rms = ArrayList<Double>()
    val zcr = ArrayList<Double>()
    var acc = 0.0
    var crossings = 0
    var count = 0
    var last = 0
    val info = MediaCodec.BufferInfo()
    var inputDone = false
    var outputDone = false
    try {
      while (!outputDone) {
        if (!inputDone) {
          val inIndex = codec.dequeueInputBuffer(10_000)
          if (inIndex >= 0) {
            val buf = codec.getInputBuffer(inIndex)!!
            val size = extractor.readSampleData(buf, 0)
            if (size < 0) {
              codec.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              codec.queueInputBuffer(inIndex, 0, size, extractor.sampleTime, 0)
              extractor.advance()
            }
          }
        }
        val outIndex = codec.dequeueOutputBuffer(info, 10_000)
        if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
          val of = codec.outputFormat
          sampleRate = of.getInteger(MediaFormat.KEY_SAMPLE_RATE)
          channels = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
          windowSize = max(1, (sampleRate * window).toInt())
        } else if (outIndex >= 0) {
          val out = codec.getOutputBuffer(outIndex)!!
          out.position(info.offset)
          out.limit(info.offset + info.size)
          val shorts = out.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
          val frameCount = shorts.remaining() / max(1, channels)
          for (f in 0 until frameCount) {
            var s = 0
            for (c in 0 until channels) s += shorts.get(f * channels + c).toInt()
            s /= max(1, channels)
            val v = s / 32768.0
            acc += v * v
            if ((s >= 0) != (last >= 0)) crossings++
            last = s
            count++
            if (count == windowSize) {
              val rv = sqrt(acc / count)
              rms.add(max(-90.0, 20 * log10(max(rv, 1e-9))))
              zcr.add(crossings.toDouble() / count)
              acc = 0.0; crossings = 0; count = 0
            }
          }
          codec.releaseOutputBuffer(outIndex, false)
          if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
        }
      }
    } finally {
      codec.stop()
      codec.release()
      extractor.release()
    }
    return Pair(rms, zcr)
  }

  // ---------- exportação ----------

  private fun volumeProcessor(volume: Float): AudioProcessor {
    val p = ChannelMixingAudioProcessor()
    for (ch in 1..2) p.putChannelMixingMatrix(ChannelMixingMatrix.create(ch, ch).scaleBy(volume))
    return p
  }

  @Suppress("UNCHECKED_CAST")
  private fun startExport(spec: Map<String, Any?>, promise: Promise) {
    val outputPath = toPath(spec["outputPath"] as String)
    val width = num(spec["width"], 1080.0).toInt()
    val height = num(spec["height"], 1920.0).toInt()
    val segments = (spec["segments"] as? List<Map<String, Any?>>).orEmpty()
    if (segments.isEmpty()) throw IllegalArgumentException("Nenhum clipe para montar")

    var totalMs = 0L
    val items = segments.map { s ->
      val startMs = (num(s["start"], 0.0) * 1000).toLong()
      val endMs = (num(s["end"], 0.0) * 1000).toLong()
      totalMs += (endMs - startMs)
      val crop = (s["crop"] as? Map<String, Any?>).orEmpty()
      val left = num(crop["left"], 0.0).toFloat()
      val top = num(crop["top"], 0.0).toFloat()
      val cw = num(crop["width"], 1.0).toFloat()
      val ch = num(crop["height"], 1.0).toFloat()
      // Crop usa coordenadas normalizadas de -1..1, com y para cima.
      val videoEffects = listOf<Effect>(
        Crop(left * 2 - 1, (left + cw) * 2 - 1, 1 - (top + ch) * 2, 1 - top * 2),
        Presentation.createForWidthAndHeight(width, height, Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP),
      )
      val volume = num(s["volume"], 1.0).toFloat()
      val mediaItem = MediaItem.Builder()
        .setUri(toUri(s["uri"] as String))
        .setClippingConfiguration(
          MediaItem.ClippingConfiguration.Builder().setStartPositionMs(startMs).setEndPositionMs(endMs).build(),
        )
        .build()
      EditedMediaItem.Builder(mediaItem)
        .setEffects(Effects(listOf(volumeProcessor(volume)), videoEffects))
        .build()
    }

    val sequences = mutableListOf(EditedMediaItemSequence.withAudioAndVideoFrom(items))

    (spec["narration"] as? Map<String, Any?>)?.let { n ->
      val uri = n["uri"] as? String ?: return@let
      val durMs = min((num(n["duration"], 0.0) * 1000).toLong(), totalMs)
      if (durMs <= 0) return@let
      val item = MediaItem.Builder()
        .setUri(toUri(uri))
        .setClippingConfiguration(MediaItem.ClippingConfiguration.Builder().setEndPositionMs(durMs).build())
        .build()
      val edited = EditedMediaItem.Builder(item)
        .setRemoveVideo(true)
        .setEffects(Effects(listOf(volumeProcessor(num(n["volume"], 1.0).toFloat())), emptyList()))
        .build()
      sequences.add(EditedMediaItemSequence.withAudioFrom(listOf(edited)))
    }

    val composition = Composition.Builder(sequences).build()
    File(outputPath).parentFile?.mkdirs()
    File(outputPath).delete()

    val t = Transformer.Builder(context)
      .setVideoMimeType(MimeTypes.VIDEO_H264)
      .setAudioMimeType(MimeTypes.AUDIO_AAC)
      .setLooper(Looper.getMainLooper())
      .addListener(object : Transformer.Listener {
        override fun onCompleted(composition: Composition, exportResult: ExportResult) {
          stopProgress()
          transformer = null
          sendEvent("onExportProgress", mapOf("progress" to 1.0))
          promise.resolve(
            mapOf(
              "uri" to Uri.fromFile(File(outputPath)).toString(),
              "duration" to exportResult.durationMs / 1000.0,
            ),
          )
        }

        override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
          stopProgress()
          transformer = null
          promise.reject("ERR_EXPORT", exportException.message ?: "Falha na exportação", exportException)
        }
      })
      .build()
    transformer = t
    t.start(composition, outputPath)
    startProgress(t)
  }

  private fun startProgress(t: Transformer) {
    stopProgress()
    val holder = ProgressHolder()
    val runnable = object : Runnable {
      override fun run() {
        if (transformer !== t) return
        if (t.getProgress(holder) == Transformer.PROGRESS_STATE_AVAILABLE) {
          sendEvent("onExportProgress", mapOf("progress" to holder.progress / 100.0))
        }
        mainHandler.postDelayed(this, 250)
      }
    }
    progressRunnable = runnable
    mainHandler.post(runnable)
  }

  private fun stopProgress() {
    progressRunnable?.let { mainHandler.removeCallbacks(it) }
    progressRunnable = null
  }
}
