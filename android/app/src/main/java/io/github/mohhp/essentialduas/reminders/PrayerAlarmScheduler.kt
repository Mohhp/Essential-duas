package io.github.mohhp.essentialduas.reminders

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import io.github.mohhp.essentialduas.MainActivity
import io.github.mohhp.essentialduas.R
import java.time.Instant
import java.time.ZoneId

class PrayerAlarmScheduler(
    private val context: Context,
    private val repository: ReminderRepository,
    private val permissionChecker: ReminderPermissionChecker
) {
    private val logTag = "PrayerAlarm"
    private val alarmManager: AlarmManager? = context.getSystemService(AlarmManager::class.java)

    fun rescheduleAll(reason: String): ScheduledReminder? {
        Log.d(logTag, "rescheduleAll called: $reason")
        cancelAll(saveState = false)
        if (alarmManager == null) {
            repository.saveNextReminder(null)
            repository.markSync("$reason:alarm-manager-unavailable")
            return null
        }

        val state = repository.getState()
        val settings = state.settings
        val location = state.location
        if (!settings.enabled || location == null) {
            repository.saveNextReminder(null)
            return null
        }

        if (!permissionChecker.canPostNotifications() || !permissionChecker.canScheduleExactAlarms()) {
            repository.saveNextReminder(null)
            return null
        }

        ensureNotificationChannels()

        val scheduled = REMINDER_PRAYER_ORDER.mapNotNull { prayerName ->
            if (settings.prayers[prayerName] != true) return@mapNotNull null
            val triggerAt = PrayerTimeCalculator.nextTriggerAt(
                prayerName = prayerName,
                offsetMinutes = settings.offsetMinutes,
                location = location,
                now = Instant.now(),
                zoneId = ZoneId.systemDefault()
            ) ?: return@mapNotNull null
            val reminder = ScheduledReminder(
                prayerName = prayerName,
                triggerAt = triggerAt.toEpochMilli(),
                offsetMinutes = settings.offsetMinutes
            )
            Log.d(logTag, "Scheduling alarm for $prayerName at $triggerAt")
            scheduleExactAlarm(reminder)
            reminder
        }

        val nextReminder = scheduled.minByOrNull { it.triggerAt }
        repository.saveNextReminder(nextReminder)
        repository.markSync(reason)
        return nextReminder
    }

    fun cancelAll(saveState: Boolean = true) {
        REMINDER_PRAYER_ORDER.forEach { prayerName ->
            alarmManager?.cancel(buildPendingIntent(prayerName, ReminderSettings().offsetMinutes))
        }
        if (saveState) repository.clearLastSchedule()
    }

    fun notifyReminder(reminder: ScheduledReminder, forceSilent: Boolean = false) {
        Log.d(logTag, "notifyReminder: prayer=${reminder.prayerName} forceSilent=$forceSilent offset=${reminder.offsetMinutes}")
        val settings = repository.getSettings()
        val prayerLabel = reminder.prayerName.replaceFirstChar { it.uppercase() }
        val title = if (reminder.offsetMinutes > 0) {
            "$prayerLabel in ${reminder.offsetMinutes} minutes"
        } else {
            "$prayerLabel time is now"
        }
        val body = if (reminder.offsetMinutes > 0) {
            "$prayerLabel will begin in ${reminder.offsetMinutes} minutes."
        } else {
            "It is now time for $prayerLabel."
        }

        val isSilentMode = settings.mode == "silent" || settings.soundId == "silent"
        val channelId = when {
            isSilentMode -> SILENT_CHANNEL_ID
            forceSilent  -> ADHAN_NOTIFICATION_CHANNEL_ID  // adhan service plays audio — notification vibrates only
            else         -> ALARM_CHANNEL_ID               // no adhan — notification plays alarm ringtone + vibrates
        }
        val alarmVibrationPattern = longArrayOf(0, 500, 200, 500, 200, 500)

        val launchIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_OPEN_PRAYER_PANEL, true)
            putExtra(EXTRA_PRAYER_NAME, reminder.prayerName)
        }
        val contentIntent = PendingIntent.getActivity(
            context,
            reminder.prayerName.hashCode(),
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val fullScreenIntent = PendingIntent.getActivity(
            context,
            reminder.prayerName.hashCode() + 5000,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val largeIcon = runCatching {
            context.assets.open("icon-192.png").use(BitmapFactory::decodeStream)
        }.getOrNull()

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setFullScreenIntent(fullScreenIntent, true)

        if (largeIcon != null) builder.setLargeIcon(largeIcon)
        if (isSilentMode) {
            builder.setSilent(true)
        } else {
            builder.setVibrate(alarmVibrationPattern)
        }

        if (permissionChecker.canPostNotifications()) {
            NotificationManagerCompat.from(context).notify(
                notificationId(reminder.prayerName),
                builder.build()
            )
        }
    }

    private fun scheduleExactAlarm(reminder: ScheduledReminder) {
        val manager = alarmManager ?: return
        val pendingIntent = buildPendingIntent(reminder.prayerName, reminder.offsetMinutes)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            manager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                reminder.triggerAt,
                pendingIntent
            )
        } else {
            manager.setExact(AlarmManager.RTC_WAKEUP, reminder.triggerAt, pendingIntent)
        }
    }

    private fun buildPendingIntent(prayerName: String, offsetMinutes: Int): PendingIntent {
        val intent = Intent(context, PrayerAlarmReceiver::class.java).apply {
            action = ACTION_PRAYER_REMINDER
            putExtra(EXTRA_PRAYER_NAME, prayerName)
            putExtra(EXTRA_OFFSET_MINUTES, offsetMinutes)
        }
        return PendingIntent.getBroadcast(
            context,
            prayerName.hashCode(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun ensureNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java)

        // Delete old channel IDs so Android picks up fresh sound/importance settings
        listOf("prayer_reminders", "prayer_alarms", "prayer_alarms_adhan", "prayer_reminders_silent").forEach {
            manager.deleteNotificationChannel(it)
        }
        Log.d(logTag, "ensureNotificationChannels: deleted legacy channels, creating v3")

        val alarmVibrationPattern = longArrayOf(0, 500, 200, 500, 200, 500)
        val alarmAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        // Alarm channel: plays alarm ringtone + strong vibration (used when adhan is disabled)
        val alarmChannel = NotificationChannel(
            ALARM_CHANNEL_ID,
            context.getString(R.string.notification_alarm_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = context.getString(R.string.notification_alarm_channel_description)
            enableVibration(true)
            vibrationPattern = alarmVibrationPattern
            setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), alarmAttributes)
        }

        // Adhan notification channel: no sound (AdhanPlaybackService handles audio), strong vibration
        val adhanNotifChannel = NotificationChannel(
            ADHAN_NOTIFICATION_CHANNEL_ID,
            context.getString(R.string.notification_adhan_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = context.getString(R.string.notification_adhan_channel_description)
            enableVibration(true)
            vibrationPattern = alarmVibrationPattern
            setSound(null, null)
        }

        // Legacy audible channel: retained for AdhanPlaybackService foreground notification
        val notifAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        val legacyAudible = NotificationChannel(
            AUDIBLE_CHANNEL_ID,
            context.getString(R.string.notification_channel_name),
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = context.getString(R.string.notification_channel_description)
            enableVibration(true)
            setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION), notifAttributes)
        }

        val silent = NotificationChannel(
            SILENT_CHANNEL_ID,
            context.getString(R.string.notification_channel_silent_name),
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = context.getString(R.string.notification_channel_silent_description)
            setSound(null, null)
            enableVibration(false)
        }

        manager.createNotificationChannel(alarmChannel)
        manager.createNotificationChannel(adhanNotifChannel)
        manager.createNotificationChannel(legacyAudible)
        manager.createNotificationChannel(silent)
    }

    private fun notificationId(prayerName: String): Int = 7000 + prayerName.hashCode()

    companion object {
        const val ACTION_PRAYER_REMINDER = "io.github.mohhp.essentialduas.ACTION_PRAYER_REMINDER"
        const val EXTRA_PRAYER_NAME = "extra_prayer_name"
        const val EXTRA_OFFSET_MINUTES = "extra_offset_minutes"
        const val EXTRA_OPEN_PRAYER_PANEL = "extra_open_prayer_panel"
        const val ALARM_CHANNEL_ID = "falah_alarm_v3"                    // alarm ringtone + vibration
        const val ADHAN_NOTIFICATION_CHANNEL_ID = "falah_alarm_adhan_v3" // vibration only (service plays audio)
        const val AUDIBLE_CHANNEL_ID = "falah_alarm_service_v3"          // AdhanPlaybackService foreground
        const val SILENT_CHANNEL_ID = "falah_alarm_silent_v3"
    }
}

interface ReminderPermissionChecker {
    fun canScheduleExactAlarms(): Boolean
    fun canPostNotifications(): Boolean
}
