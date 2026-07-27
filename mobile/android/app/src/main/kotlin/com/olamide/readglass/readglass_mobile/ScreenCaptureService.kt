package com.olamide.readglass.readglass_mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/** Required foreground service type host for media projection on newer Android versions. */
class ScreenCaptureService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val channelId = "readglass_capture"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = getSystemService(NotificationManager::class.java)
            mgr.createNotificationChannel(
                NotificationChannel(channelId, "ReadGlass capture", NotificationManager.IMPORTANCE_LOW)
            )
        }
        val notification: Notification = NotificationCompat.Builder(this, channelId)
            .setContentTitle("ReadGlass")
            .setContentText("Preparing screen capture")
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .build()
        startForeground(4411, notification)
        stopSelf()
        return START_NOT_STICKY
    }
}
