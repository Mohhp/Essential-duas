package io.github.mohhp.essentialduas.reminders

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action != Intent.ACTION_BOOT_COMPLETED && action != Intent.ACTION_MY_PACKAGE_REPLACED) {
            return
        }

        val repository = ReminderRepository(context)
        val permissionChecker = SystemReminderPermissionChecker(context)

        // Do not reschedule when notification/alarm permissions are unavailable.
        if (!permissionChecker.canPostNotifications() || !permissionChecker.canScheduleExactAlarms()) {
            repository.saveNextReminder(null)
            repository.markSync("boot:$action:permissions-missing")
            return
        }

        val scheduler = PrayerAlarmScheduler(
            context = context,
            repository = repository,
            permissionChecker = permissionChecker
        )
        scheduler.rescheduleAll("boot:$action")
    }
}
