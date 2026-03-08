package io.github.mohhp.essentialduas.reminders

import android.content.Context
import com.google.gson.Gson
import com.google.gson.JsonParser

class ReminderRepository(context: Context) {
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    private val gson = Gson()

    fun getState(): NativeReminderState {
        val settings = getSettings()
        val location = getLocation()
        val nextReminder = getNextReminder()
        return NativeReminderState(
            settings = settings,
            location = location,
            nextReminder = nextReminder,
            lastSyncReason = prefs.getString(KEY_LAST_SYNC_REASON, null),
            lastSyncedAt = prefs.takeIf { it.contains(KEY_LAST_SYNC_AT) }?.getLong(KEY_LAST_SYNC_AT, 0L)
        )
    }

    fun getSettings(): ReminderSettings {
        val raw = prefs.getString(KEY_SETTINGS_JSON, null) ?: return ReminderSettings()
        return try {
            val parsed = gson.fromJson(raw, ReminderSettings::class.java) ?: ReminderSettings()
            normalizeSettings(parsed)
        } catch (_: Exception) {
            ReminderSettings()
        }
    }

    fun getLocation(): PrayerLocation? {
        val raw = prefs.getString(KEY_LOCATION_JSON, null) ?: return null
        return try {
            gson.fromJson(raw, PrayerLocation::class.java)
        } catch (_: Exception) {
            null
        }
    }

    fun saveReminderState(settingsJson: String?, locationJson: String?, reason: String?) {
        val normalizedSettings = parseSettings(settingsJson)
        val normalizedLocation = parseLocation(locationJson)
        prefs.edit()
            .putString(KEY_SETTINGS_JSON, gson.toJson(normalizedSettings))
            .apply {
                if (normalizedLocation != null) {
                    putString(KEY_LOCATION_JSON, gson.toJson(normalizedLocation))
                } else if (!locationJson.isNullOrBlank()) {
                    remove(KEY_LOCATION_JSON)
                }
                putString(KEY_LAST_SYNC_REASON, reason)
                putLong(KEY_LAST_SYNC_AT, System.currentTimeMillis())
            }
            .apply()
    }

    fun saveNextReminder(reminder: ScheduledReminder?) {
        prefs.edit().apply {
            if (reminder == null) {
                remove(KEY_NEXT_REMINDER_JSON)
            } else {
                putString(KEY_NEXT_REMINDER_JSON, gson.toJson(reminder))
            }
        }.apply()
    }

    fun clearLastSchedule() {
        prefs.edit().remove(KEY_NEXT_REMINDER_JSON).apply()
    }

    fun disableRemindersDueToPermissionRevocation(reason: String) {
        val current = getSettings()
        val disabled = current.copy(enabled = false)
        prefs.edit()
            .putString(KEY_SETTINGS_JSON, gson.toJson(disabled))
            .remove(KEY_NEXT_REMINDER_JSON)
            .putString(KEY_LAST_SYNC_REASON, reason)
            .putLong(KEY_LAST_SYNC_AT, System.currentTimeMillis())
            .apply()
    }

    fun markSync(reason: String?) {
        prefs.edit()
            .putString(KEY_LAST_SYNC_REASON, reason)
            .putLong(KEY_LAST_SYNC_AT, System.currentTimeMillis())
            .apply()
    }

    fun getStateJson(): String {
        val state = getState()
        val payload = linkedMapOf<String, Any?>(
            "nativeReminderSupported" to true,
            "settings" to JsonParser.parseString(gson.toJson(state.settings)),
            "location" to state.location?.let { JsonParser.parseString(gson.toJson(it)) },
            "nextReminder" to state.nextReminder?.let { JsonParser.parseString(gson.toJson(it)) },
            "lastSyncReason" to state.lastSyncReason,
            "lastSyncedAt" to state.lastSyncedAt
        )
        return gson.toJson(payload)
    }

    private fun parseSettings(raw: String?): ReminderSettings {
        if (raw.isNullOrBlank()) return getSettings()
        return try {
            normalizeSettings(gson.fromJson(raw, ReminderSettings::class.java) ?: ReminderSettings())
        } catch (_: Exception) {
            getSettings()
        }
    }

    private fun parseLocation(raw: String?): PrayerLocation? {
        if (raw.isNullOrBlank()) return getLocation()
        return try {
            gson.fromJson(raw, PrayerLocation::class.java)
        } catch (_: Exception) {
            getLocation()
        }
    }

    private fun normalizeSettings(settings: ReminderSettings): ReminderSettings {
        val clampedOffset = settings.offsetMinutes.coerceIn(0, 15).let {
            when (it) {
                0, 5, 10, 15 -> it
                in 1..4 -> 0
                in 6..9 -> 5
                in 11..14 -> 10
                else -> 15
            }
        }
        return settings.copy(
            mode = settings.mode.takeIf { it in setOf("adhan", "tone", "silent") } ?: "tone",
            soundId = settings.soundId.ifBlank { "ding" },
            playAdhanSound = settings.playAdhanSound,
            offsetMinutes = clampedOffset,
            prayerSounds = DEFAULT_PRAYER_SOUNDS + settings.prayerSounds.filterKeys { it in REMINDER_PRAYER_ORDER },
            prayers = DEFAULT_ENABLED_PRAYERS + settings.prayers.filterKeys { it in REMINDER_PRAYER_ORDER }
        )
    }

    fun getNextReminder(): ScheduledReminder? {
        val raw = prefs.getString(KEY_NEXT_REMINDER_JSON, null) ?: return null
        return try {
            gson.fromJson(raw, ScheduledReminder::class.java)
        } catch (_: Exception) {
            null
        }
    }

    companion object {
        private const val PREFS_NAME = "falah_native_reminders"
        private const val KEY_SETTINGS_JSON = "settings_json"
        private const val KEY_LOCATION_JSON = "location_json"
        private const val KEY_NEXT_REMINDER_JSON = "next_reminder_json"
        private const val KEY_LAST_SYNC_REASON = "last_sync_reason"
        private const val KEY_LAST_SYNC_AT = "last_sync_at"
    }
}
