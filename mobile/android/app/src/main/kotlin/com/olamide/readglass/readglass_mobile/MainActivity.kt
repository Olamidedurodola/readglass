package com.olamide.readglass.readglass_mobile

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.Looper
import android.util.DisplayMetrics
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileOutputStream

class MainActivity : FlutterActivity() {
    private val channelName = "com.olamide.readglass/capture"
    private val requestCode = 4242

    private var pendingResult: MethodChannel.Result? = null
    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "captureScreen" -> startCapture(result)
                    else -> result.notImplemented()
                }
            }
    }

    private fun startCapture(result: MethodChannel.Result) {
        if (pendingResult != null) {
            result.error("BUSY", "Capture already in progress", null)
            return
        }
        pendingResult = result
        val mgr = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(mgr.createScreenCaptureIntent(), requestCode)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != this.requestCode) return
        val result = pendingResult
        pendingResult = null
        if (result == null) return

        if (resultCode != Activity.RESULT_OK || data == null) {
            result.error("CANCELLED", "Screen capture permission denied", null)
            return
        }

        try {
            val path = captureOnce(resultCode, data)
            if (path == null) {
                result.error("FAILED", "Could not capture screen", null)
            } else {
                result.success(path)
            }
        } catch (e: Exception) {
            result.error("FAILED", e.message, null)
        }
    }

    private fun captureOnce(resultCode: Int, data: Intent): String? {
        // Android 14+ requires a mediaProjection FGS before creating the projection.
        if (android.os.Build.VERSION.SDK_INT >= 34) {
            val svc = Intent(this, ScreenCaptureService::class.java)
            startForegroundService(svc)
            Thread.sleep(250)
        }

        val mgr = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        cleanupCapture()
        mediaProjection = mgr.getMediaProjection(resultCode, data)

        val metrics = DisplayMetrics()
        @Suppress("DEPRECATION")
        windowManager.defaultDisplay.getRealMetrics(metrics)
        val width = metrics.widthPixels
        val height = metrics.heightPixels
        val density = metrics.densityDpi

        imageReader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
        virtualDisplay = mediaProjection?.createVirtualDisplay(
            "ReadGlassCapture",
            width,
            height,
            density,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader?.surface,
            null,
            null
        )

        // Wait briefly for a frame.
        Thread.sleep(400)
        val image = imageReader?.acquireLatestImage() ?: return null
        val plane = image.planes[0]
        val buffer = plane.buffer
        val pixelStride = plane.pixelStride
        val rowStride = plane.rowStride
        val rowPadding = rowStride - pixelStride * width

        val bitmap = Bitmap.createBitmap(
            width + rowPadding / pixelStride,
            height,
            Bitmap.Config.ARGB_8888
        )
        bitmap.copyPixelsFromBuffer(buffer)
        image.close()

        val cropped = Bitmap.createBitmap(bitmap, 0, 0, width, height)
        if (cropped != bitmap) bitmap.recycle()

        val outFile = File(cacheDir, "rg_capture_${System.currentTimeMillis()}.png")
        FileOutputStream(outFile).use { fos ->
            cropped.compress(Bitmap.CompressFormat.PNG, 95, fos)
        }
        cropped.recycle()
        cleanupCapture()
        return outFile.absolutePath
    }

    private fun cleanupCapture() {
        try {
            virtualDisplay?.release()
        } catch (_: Exception) {
        }
        try {
            imageReader?.close()
        } catch (_: Exception) {
        }
        try {
            mediaProjection?.stop()
        } catch (_: Exception) {
        }
        virtualDisplay = null
        imageReader = null
        mediaProjection = null
    }

    override fun onDestroy() {
        cleanupCapture()
        super.onDestroy()
    }
}
