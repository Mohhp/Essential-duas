package io.github.mohhp.essentialduas.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class PrayerAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != PrayerAlarmScheduler.ACTION_PRAYER_REMINDER) return

        val prayerName = intent.getStringExtra(PrayerAlarmScheduler.EXTRA_PRAYER_NAME) ?: return
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
        scheduler.notifyReminder(reminder)
        scheduler.rescheduleAll("alarm-fired:$prayerName")
    }
}
