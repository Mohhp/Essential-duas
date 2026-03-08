package io.github.mohhp.essentialduas.reminders

data class PrayerLocation(
    val lat: Double,
    val lng: Double,
    val city: String? = null,
    val cityKey: String? = null,
    val country: String? = null
)

data class ReminderSettings(
    val enabled: Boolean = false,
    val mode: String = "tone",
    val soundId: String = "ding",
    val sameSoundForAll: Boolean = true,
    val prayerSounds: Map<String, String> = DEFAULT_PRAYER_SOUNDS,
    val offsetMinutes: Int = 0,
    val prayers: Map<String, Boolean> = DEFAULT_ENABLED_PRAYERS
)

data class NativeReminderState(
    val settings: ReminderSettings = ReminderSettings(),
    val location: PrayerLocation? = null,
    val nextReminder: ScheduledReminder? = null,
    val lastSyncReason: String? = null,
    val lastSyncedAt: Long? = null
)

data class ScheduledReminder(
    val prayerName: String,
    val triggerAt: Long,
    val offsetMinutes: Int
)

val REMINDER_PRAYER_ORDER = listOf("fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha")

val DEFAULT_ENABLED_PRAYERS = linkedMapOf(
    "fajr" to true,
    "sunrise" to true,
    "dhuhr" to true,
    "asr" to true,
    "maghrib" to true,
    "isha" to true
)

val DEFAULT_PRAYER_SOUNDS = linkedMapOf(
    "fajr" to "bell",
    "sunrise" to "ding",
    "dhuhr" to "ding",
    "asr" to "ding",
    "maghrib" to "bell",
    "isha" to "nasheed"
)
