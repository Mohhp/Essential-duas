package io.github.mohhp.essentialduas

import android.webkit.JavascriptInterface
import com.google.gson.Gson
import com.google.gson.JsonParser
import io.github.mohhp.essentialduas.reminders.PrayerAlarmScheduler
import io.github.mohhp.essentialduas.reminders.ReminderRepository

class ReminderBridge(
    private val activity: MainActivity,
    private val repository: ReminderRepository,
    private val scheduler: PrayerAlarmScheduler
) {
    private val gson = Gson()

    @JavascriptInterface
    fun isSupported(): Boolean = true

    @JavascriptInterface
    fun getStateJson(): String = activity.buildBridgeStateJson("bridge-read")

    @JavascriptInterface
    fun syncReminderState(reminderSettingsJson: String?, locationJson: String?, reason: String?): String {
        repository.saveReminderState(reminderSettingsJson, locationJson, reason ?: "bridge-sync")
        scheduler.rescheduleAll(reason ?: "bridge-sync")
        activity.runOnUiThread {
            activity.ensureReminderPermissions(autoChain = true)
            activity.publishReminderStateToWeb(reason ?: "bridge-sync")
        }
        return activity.buildBridgeStateJson(reason ?: "bridge-sync")
    }

    @JavascriptInterface
    fun requestPermissions(reason: String?): String {
        activity.runOnUiThread {
            activity.ensureReminderPermissions(autoChain = true)
            activity.publishReminderStateToWeb(reason ?: "permission-request")
        }
        return activity.buildBridgeStateJson(reason ?: "permission-request")
    }

    @JavascriptInterface
    fun reportScrollTop(scrollTop: Double) {
        activity.updateReportedContentScrollTop(scrollTop)
    }

    @JavascriptInterface
    fun openStoreUpdate(url: String?): Boolean {
        return activity.openStoreUpdate(url)
    }

    @JavascriptInterface
    fun getStatusJson(): String {
        val base = JsonParser.parseString(activity.buildBridgeStateJson("status"))
        return gson.toJson(base)
    }

    /**
     * DEBUG ONLY — schedules a test alarm [delaySeconds] seconds from now so
     * the full native alarm → notification → adhan path can be verified on device.
     */
    @JavascriptInterface
    fun scheduleTestAlarm(delaySeconds: Int): String {
        if (!activity.canScheduleExactAlarms() || !activity.canPostNotifications()) {
            return """{"success":false,"error":"permissions_missing"}"""
        }
        val reminder = scheduler.scheduleTestAlarm(delaySeconds)
            ?: return """{"success":false,"error":"scheduler_unavailable"}"""
        return """{"success":true,"prayerName":"${reminder.prayerName}","triggerAt":${reminder.triggerAt},"delaySeconds":$delaySeconds}"""
    }
}
