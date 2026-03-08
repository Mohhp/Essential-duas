package io.github.mohhp.essentialduas.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class ReminderRescheduleReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val repository = ReminderRepository(context)
        val scheduler = PrayerAlarmScheduler(
            context = context,
            repository = repository,
            permissionChecker = SystemReminderPermissionChecker(context)
        )
        scheduler.rescheduleAll("system:$action")
    }
}
