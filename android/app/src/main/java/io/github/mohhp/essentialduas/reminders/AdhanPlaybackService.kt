package io.github.mohhp.essentialduas.reminders

import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import io.github.mohhp.essentialduas.MainActivity
import io.github.mohhp.essentialduas.R
import java.util.ArrayDeque

class AdhanPlaybackService : Service() {
    private val logTag = "PrayerAdhanService"
    private val queue = ArrayDeque<ScheduledReminder>()

    private var currentReminder: ScheduledReminder? = null
    private var mediaPlayer: MediaPlayer? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var audioFocusRequest: AudioFocusRequest? = null
    private var hasAudioFocus: Boolean = false
    private var isPlayingAudio: Boolean = false

    private val audioManager by lazy {
        getSystemService(AudioManager::class.java)
    }

    private val focusChangeListener = AudioManager.OnAudioFocusChangeListener { change ->
        if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) {
            stopCurrentPlayback(clearQueue = false)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(logTag, "Service created")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(logTag, "Service start command received: action=${intent?.action}, startId=$startId")
        when (intent?.action) {
            ACTION_STOP -> {
                Log.d(logTag, "Stop action received from notification")
                stopCurrentPlayback(clearQueue = true)
                return START_NOT_STICKY
            }
            ACTION_PLAY, null -> {
                val reminder = extractReminder(intent) ?: return START_NOT_STICKY
                Log.d(logTag, "Queueing reminder: prayer=${reminder.prayerName}, triggerAt=${reminder.triggerAt}, offset=${reminder.offsetMinutes}")
                queue.addLast(reminder)
                processNextIfIdle()
                return START_NOT_STICKY
            }
            else -> return START_NOT_STICKY
        }
    }

    private fun extractReminder(intent: Intent?): ScheduledReminder? {
        if (intent == null) return null
        val prayerName = intent.getStringExtra(EXTRA_PRAYER_NAME) ?: return null
        val triggerAt = intent.getLongExtra(EXTRA_TRIGGER_AT, System.currentTimeMillis())
        val offsetMinutes = intent.getIntExtra(EXTRA_OFFSET_MINUTES, 0)
        return ScheduledReminder(prayerName = prayerName, triggerAt = triggerAt, offsetMinutes = offsetMinutes)
    }

    private fun processNextIfIdle() {
        if (currentReminder != null) return
        val next = if (queue.isEmpty()) null else queue.removeFirst()
        if (next == null) {
            Log.d(logTag, "No reminders in queue, stopping service")
            stopSelf()
            return
        }

        currentReminder = next
        Log.d(logTag, "Starting foreground for prayer=${next.prayerName}")
        startForeground(NOTIFICATION_ID, buildForegroundNotification(next))

        if (isPhoneOnCall() || isDoNotDisturbBlockingAlarms()) {
            Log.d(logTag, "Skipping adhan playback due to call/DND state for prayer=${next.prayerName}")
            stopCurrentPlayback(clearQueue = false)
            return
        }

        if (!requestAudioFocus()) {
            Log.d(logTag, "Audio focus denied for prayer=${next.prayerName}, stopping playback path")
            stopCurrentPlayback(clearQueue = false)
            return
        }

        val player = MediaPlayer.create(this, R.raw.adhan_alafasy) ?: run {
            Log.d(logTag, "MediaPlayer.create returned null")
            stopCurrentPlayback(clearQueue = false)
            return
        }

        player.setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build()
        )
        @Suppress("DEPRECATION")
        player.setAudioStreamType(AudioManager.STREAM_ALARM)
        player.setOnCompletionListener {
            Log.d(logTag, "Playback complete for prayer=${currentReminder?.prayerName}")
            stopCurrentPlayback(clearQueue = false)
        }
        player.setOnErrorListener { _, _, _ ->
            Log.e(logTag, "MediaPlayer error during adhan playback")
            stopCurrentPlayback(clearQueue = false)
            true
        }

        mediaPlayer = player
        acquireWakeLock()
        isPlayingAudio = true
        Log.d(logTag, "Starting MediaPlayer for prayer=${next.prayerName}")
        player.start()
    }

    private fun buildForegroundNotification(reminder: ScheduledReminder) = NotificationCompat.Builder(
        this,
        PrayerAlarmScheduler.AUDIBLE_CHANNEL_ID
    )
        .setSmallIcon(R.drawable.ic_notification)
        .setContentTitle("${reminder.prayerName.replaceFirstChar { it.uppercase() }} - Adhan Playing")
        .setContentText("Tap Stop to end adhan playback")
        .setPriority(NotificationCompat.PRIORITY_HIGH)
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setContentIntent(
            PendingIntent.getActivity(
                this,
                reminder.prayerName.hashCode(),
                Intent(this, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    putExtra(PrayerAlarmScheduler.EXTRA_OPEN_PRAYER_PANEL, true)
                    putExtra(PrayerAlarmScheduler.EXTRA_PRAYER_NAME, reminder.prayerName)
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        )
        .addAction(
            0,
            "Stop",
            PendingIntent.getService(
                this,
                9001,
                Intent(this, AdhanPlaybackService::class.java).apply { action = ACTION_STOP },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        )
        .build()

    private fun requestAudioFocus(): Boolean {
        val manager = audioManager ?: return false
        Log.d(logTag, "Requesting audio focus")
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                .setAcceptsDelayedFocusGain(false)
                .setOnAudioFocusChangeListener(focusChangeListener)
                .build()
            audioFocusRequest = request
            val result = manager.requestAudioFocus(request)
            hasAudioFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
            Log.d(logTag, "Audio focus request result=$result granted=$hasAudioFocus")
            hasAudioFocus
        } else {
            @Suppress("DEPRECATION")
            val result = manager.requestAudioFocus(
                focusChangeListener,
                AudioManager.STREAM_ALARM,
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
            )
            hasAudioFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
            Log.d(logTag, "Audio focus request result=$result granted=$hasAudioFocus")
            hasAudioFocus
        }
    }

    private fun releaseAudioFocus() {
        val manager = audioManager ?: return
        if (!hasAudioFocus) return

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { manager.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            manager.abandonAudioFocus(focusChangeListener)
        }
        hasAudioFocus = false
        audioFocusRequest = null
    }

    private fun isPhoneOnCall(): Boolean {
        val manager = audioManager ?: return false
        return manager.mode == AudioManager.MODE_IN_CALL || manager.mode == AudioManager.MODE_IN_COMMUNICATION
    }

    private fun isDoNotDisturbBlockingAlarms(): Boolean {
        val manager = getSystemService(NotificationManager::class.java) ?: return false
        return manager.currentInterruptionFilter == NotificationManager.INTERRUPTION_FILTER_NONE
    }

    private fun acquireWakeLock() {
        val pm = getSystemService(PowerManager::class.java) ?: return
        if (wakeLock?.isHeld == true) return

        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "EssentialDuas:AdhanPlayback")
        wakeLock?.setReferenceCounted(false)
        wakeLock?.acquire(WAKELOCK_TIMEOUT_MS)
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) it.release()
        }
        wakeLock = null
    }

    private fun stopCurrentPlayback(clearQueue: Boolean) {
        Log.d(logTag, "Stopping playback clearQueue=$clearQueue")
        if (clearQueue) queue.clear()

        mediaPlayer?.let { player ->
            runCatching {
                if (player.isPlaying) player.stop()
                player.reset()
                player.release()
            }.onFailure {
                Log.e(logTag, "Error while stopping/releasing MediaPlayer", it)
            }
        }
        mediaPlayer = null
        isPlayingAudio = false

        releaseWakeLock()
        releaseAudioFocus()

        currentReminder = null

        stopForeground(STOP_FOREGROUND_REMOVE)
        processNextIfIdle()
    }

    override fun onDestroy() {
        Log.d(logTag, "Service destroyed")
        queue.clear()
        mediaPlayer?.let { player ->
            runCatching {
                if (player.isPlaying) player.stop()
                player.reset()
                player.release()
            }.onFailure {
                Log.e(logTag, "Error while releasing MediaPlayer in onDestroy", it)
            }
        }
        mediaPlayer = null
        releaseWakeLock()
        releaseAudioFocus()
        currentReminder = null
        super.onDestroy()
    }

    companion object {
        private const val NOTIFICATION_ID = 8801
        private const val WAKELOCK_TIMEOUT_MS = 12L * 60L * 1000L

        const val ACTION_PLAY = "io.github.mohhp.essentialduas.reminders.action.PLAY"
        const val ACTION_STOP = "io.github.mohhp.essentialduas.reminders.action.STOP"
        const val EXTRA_PRAYER_NAME = "extra_prayer_name"
        const val EXTRA_OFFSET_MINUTES = "extra_offset_minutes"
        const val EXTRA_TRIGGER_AT = "extra_trigger_at"

        fun start(context: android.content.Context, reminder: ScheduledReminder) {
            val intent = Intent(context, AdhanPlaybackService::class.java).apply {
                action = ACTION_PLAY
                putExtra(EXTRA_PRAYER_NAME, reminder.prayerName)
                putExtra(EXTRA_OFFSET_MINUTES, reminder.offsetMinutes)
                putExtra(EXTRA_TRIGGER_AT, reminder.triggerAt)
            }
            ContextCompat.startForegroundService(context, intent)
        }
    }
}
