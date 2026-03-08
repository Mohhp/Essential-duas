package io.github.mohhp.essentialduas.reminders

import com.batoulapps.adhan.CalculationMethod
import com.batoulapps.adhan.Coordinates
import com.batoulapps.adhan.Madhab
import com.batoulapps.adhan.PrayerTimes
import com.batoulapps.adhan.data.DateComponents
import java.time.Instant
import java.time.ZoneId

object PrayerTimeCalculator {
    fun nextTriggerAt(
        prayerName: String,
        offsetMinutes: Int,
        location: PrayerLocation,
        now: Instant,
        zoneId: ZoneId
    ): Instant? {
        val today = computePrayerInstant(prayerName, location, now, zoneId)
        if (today != null) {
            val trigger = today.minusSeconds(offsetMinutes * 60L)
            if (trigger.isAfter(now)) return trigger
        }

        val tomorrow = now.plusSeconds(24L * 60L * 60L)
        val nextPrayer = computePrayerInstant(prayerName, location, tomorrow, zoneId) ?: return null
        val nextTrigger = nextPrayer.minusSeconds(offsetMinutes * 60L)
        return if (nextTrigger.isAfter(now)) nextTrigger else null
    }

    private fun computePrayerInstant(
        prayerName: String,
        location: PrayerLocation,
        at: Instant,
        zoneId: ZoneId
    ): Instant? {
        val localDate = at.atZone(zoneId).toLocalDate()
        val parameters = CalculationMethod.MUSLIM_WORLD_LEAGUE.getParameters().apply {
            madhab = Madhab.HANAFI
        }
        val prayerTimes = PrayerTimes(
            Coordinates(location.lat, location.lng),
            DateComponents(localDate.year, localDate.monthValue, localDate.dayOfMonth),
            parameters
        )
        return when (prayerName) {
            "fajr" -> prayerTimes.fajr?.toInstant()
            "sunrise" -> prayerTimes.sunrise?.toInstant()
            "dhuhr" -> prayerTimes.dhuhr?.toInstant()
            "asr" -> prayerTimes.asr?.toInstant()
            "maghrib" -> prayerTimes.maghrib?.toInstant()
            "isha" -> prayerTimes.isha?.toInstant()
            else -> null
        }
    }
}
