package io.github.mohhp.essentialduas.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class PrayerAlarmReceiver : BroadcastReceiver() {
    private val logTag = "PrayerAlarm"

    override fun onReceive(context: Context, intent: Intent) {
        Log.d(logTag, "Alarm received: action=${intent.action}")
        if (intent.action != PrayerAlarmScheduler.ACTION_PRAYER_REMINDER) return

        val prayerName = intent.getStringExtra(PrayerAlarmScheduler.EXTRA_PRAYER_NAME) ?: return
        Log.d(logTag, "Prayer extracted from alarm: prayerName=$prayerName")
        val offsetMinutes = intent.getIntExtra(PrayerAlarmScheduler.EXTRA_OFFSET_MINUTES, 0)
        val repository = ReminderRepository(context)
        val scheduler = PrayerAlarmScheduler(
            context = context,
            repository = repository,
            permissionChecker = SystemReminderPermissionChecker(context)
        )

        val reminder = ScheduledReminder(
            prayerName = prayerName,
            triggerAt = System.currentTimeMillis(),
            offsetMinutes = offsetMinutes
        )
        val playAdhanSound = repository.getSettings().playAdhanSound
        Log.d(logTag, "Adhan service decision: playAdhanSound=$playAdhanSound prayerName=$prayerName")

        // Keep the standard reminder notification silent; adhan playback is handled by the service.
        scheduler.notifyReminder(reminder, forceSilent = true)
        if (playAdhanSound) {
            Log.d(logTag, "Starting AdhanPlaybackService for prayerName=$prayerName")
            AdhanPlaybackService.start(context, reminder)
        } else {
            Log.d(logTag, "AdhanPlaybackService skipped because playAdhanSound=false")
        }

        scheduler.rescheduleAll("alarm-fired:$prayerName")
    }
}
