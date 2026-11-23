package expo.modules.terrymedia

import android.graphics.Matrix
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.MatrixTransformation

/**
 * Zoom automático de um take: escala do quadro (em coordenadas -1..1, centro em 0)
 * indo de `from` até `to` ao longo do trecho. O tempo conta a partir do primeiro quadro do take.
 */
@androidx.annotation.OptIn(markerClass = [UnstableApi::class])
class ZoomRamp(private val from: Float, private val to: Float, private val durationUs: Long) : MatrixTransformation {
  private var firstUs = -1L

  override fun getMatrix(presentationTimeUs: Long): Matrix {
    if (firstUs < 0 || presentationTimeUs < firstUs) firstUs = presentationTimeUs
    val t = if (durationUs <= 0) 1f else ((presentationTimeUs - firstUs).toFloat() / durationUs).coerceIn(0f, 1f)
    val z = from + (to - from) * t
    return Matrix().apply { postScale(z, z) }
  }
}
