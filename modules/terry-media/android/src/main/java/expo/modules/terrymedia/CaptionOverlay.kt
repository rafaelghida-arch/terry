package expo.modules.terrymedia

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.media3.common.OverlaySettings
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.BitmapOverlay
import androidx.media3.effect.StaticOverlaySettings
import kotlin.math.ceil
import kotlin.math.max

/** Uma fala da legenda, no tempo do vídeo montado (microssegundos). */
data class CaptionCue(val startUs: Long, val endUs: Long, val text: String)

/**
 * Legendas desenhadas pelo próprio TERRY: texto branco pesado, quebra de linha,
 * faixa escura ou contorno, embaixo ou no meio. Cada fala vira um bitmap guardado em cache;
 * entre as falas, um pixel transparente.
 */
@androidx.annotation.OptIn(markerClass = [UnstableApi::class])
class CaptionOverlay(
  private val cues: List<CaptionCue>,
  private val style: String,
  private val position: String,
  private val frameWidth: Int,
) : BitmapOverlay() {
  private val empty: Bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888)
  private val cache = HashMap<Int, Bitmap>()

  private val settings: OverlaySettings =
    if (position == "meio") {
      StaticOverlaySettings.Builder().build()
    } else {
      // Base da legenda a 15% da altura, a partir de baixo (coordenadas -1..1).
      StaticOverlaySettings.Builder()
        .setOverlayFrameAnchor(0f, -1f)
        .setBackgroundFrameAnchor(0f, -0.7f)
        .build()
    }

  override fun getBitmap(presentationTimeUs: Long): Bitmap {
    val index = cues.indexOfFirst { presentationTimeUs >= it.startUs && presentationTimeUs < it.endUs }
    if (index < 0) return empty
    return cache.getOrPut(index) { draw(cues[index].text) }
  }

  override fun getOverlaySettings(presentationTimeUs: Long): OverlaySettings = settings

  private fun draw(text: String): Bitmap {
    val fontSize = frameWidth * 0.054f
    val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.WHITE
      textSize = fontSize
      typeface = Typeface.create(Typeface.DEFAULT, 900, false)
    }
    val maxWidth = (frameWidth * 0.82f).toInt()
    val layout = StaticLayout.Builder.obtain(text, 0, text.length, paint, maxWidth)
      .setAlignment(Layout.Alignment.ALIGN_CENTER)
      .setIncludePad(false)
      .build()
    var textWidth = 0f
    for (i in 0 until layout.lineCount) textWidth = max(textWidth, layout.getLineWidth(i))
    val padH = fontSize * 0.55f
    val padV = fontSize * 0.3f
    val boxW = ceil(textWidth + padH * 2).toInt()
    val boxH = ceil(layout.height + padV * 2).toInt()
    val bitmap = Bitmap.createBitmap(max(1, boxW), max(1, boxH), Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    if (style == "faixa") {
      val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.argb(158, 0, 0, 0) }
      canvas.drawRoundRect(RectF(0f, 0f, boxW.toFloat(), boxH.toFloat()), fontSize * 0.35f, fontSize * 0.35f, bg)
    }
    // O layout ocupa maxWidth; desloca para centralizar dentro da caixa.
    canvas.translate(padH - (maxWidth - textWidth) / 2f, padV)
    if (style == "contorno") {
      val stroke = TextPaint(paint).apply {
        this.style = Paint.Style.STROKE
        strokeWidth = fontSize * 0.14f
        strokeJoin = Paint.Join.ROUND
        color = Color.BLACK
      }
      StaticLayout.Builder.obtain(text, 0, text.length, stroke, maxWidth)
        .setAlignment(Layout.Alignment.ALIGN_CENTER)
        .setIncludePad(false)
        .build()
        .draw(canvas)
    }
    layout.draw(canvas)
    return bitmap
  }
}
