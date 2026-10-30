// YouTube's daily API quota: the project has 10,000 units a day, reset at midnight Pacific time. We count our own calls in
// memory (a restart starts the count again) and, when Google says the day is used up, stop until the next midnight there.
// Every function takes the time, so a test holds the clock.

use chrono::TimeZone;
use chrono_tz::America::Los_Angeles;

/// A Google project's units per day.
pub const DAILY_UNITS: u64 = 10_000;

/// The next midnight in America/Los_Angeles after `now_ms`, in ms since the epoch.
pub fn next_reset(now_ms: i64) -> i64 {
    let Some(now) = chrono::DateTime::from_timestamp_millis(now_ms) else {
        return now_ms + 24 * 3600 * 1000;
    };
    let today = now.with_timezone(&Los_Angeles).date_naive();
    let midnight = today.succ_opt().and_then(|day| day.and_hms_opt(0, 0, 0));
    midnight
        .and_then(|local| Los_Angeles.from_local_datetime(&local).earliest())
        .map_or(now_ms + 24 * 3600 * 1000, |at| at.timestamp_millis())
}

#[derive(Debug, Default)]
pub struct Quota {
    used: u64,
    /// When the count starts again; 0 until the first call.
    reset_at: i64,
    blocked: bool,
}

impl Quota {
    /// Starts the day's count over once its midnight has passed, and lifts a block.
    fn roll(&mut self, now_ms: i64) {
        if self.reset_at == 0 || now_ms >= self.reset_at {
            *self = Self {
                used: 0,
                reset_at: next_reset(now_ms),
                blocked: false,
            };
        }
    }

    /// Counts a call of `cost` units.
    pub fn spend(&mut self, now_ms: i64, cost: u64) {
        self.roll(now_ms);
        self.used += cost;
    }

    /// Google said the day is used up: no calls until the reset, which is returned.
    pub fn exhaust(&mut self, now_ms: i64) -> i64 {
        self.roll(now_ms);
        self.used = self.used.max(DAILY_UNITS);
        self.blocked = true;
        self.reset_at
    }

    /// When calls may start again, while they may not.
    pub fn blocked_until(&mut self, now_ms: i64) -> Option<i64> {
        self.roll(now_ms);
        self.blocked.then_some(self.reset_at)
    }

    /// Units counted since the last reset.
    pub fn used(&mut self, now_ms: i64) -> u64 {
        self.roll(now_ms);
        self.used
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 2026-07-15 12:00 UTC is 05:00 in Los Angeles (PDT); the next midnight there is 07:00 UTC the next day.
    const NOON_UTC: i64 = 1_784_116_800_000;
    const HOUR: i64 = 3600 * 1000;

    #[test]
    fn resets_at_the_next_pacific_midnight_summer_and_winter() {
        assert_eq!(next_reset(NOON_UTC), NOON_UTC + 19 * HOUR);
        // 2026-01-15 12:00 UTC is 04:00 PST; the midnight is 08:00 UTC the next day.
        let winter = 1_768_478_400_000;
        assert_eq!(next_reset(winter), winter + 20 * HOUR);
        // Exactly at midnight, the next one is a day on.
        assert_eq!(next_reset(NOON_UTC + 19 * HOUR), NOON_UTC + 43 * HOUR);
    }

    #[test]
    fn counts_blocks_until_midnight_and_starts_over_after_it() {
        let mut q = Quota::default();
        q.spend(NOON_UTC, 5);
        q.spend(NOON_UTC + HOUR, 50);
        assert_eq!(
            (q.used(NOON_UTC + HOUR), q.blocked_until(NOON_UTC + HOUR)),
            (55, None)
        );
        let reset = q.exhaust(NOON_UTC + 2 * HOUR);
        assert_eq!(reset, NOON_UTC + 19 * HOUR);
        assert_eq!(q.blocked_until(NOON_UTC + 18 * HOUR), Some(reset));
        assert_eq!(q.used(NOON_UTC + 18 * HOUR), DAILY_UNITS);
        // After the midnight the day is new.
        assert_eq!(q.blocked_until(reset), None);
        assert_eq!(q.used(reset), 0);
        q.spend(reset + 1, 1);
        assert_eq!(q.used(reset + 1), 1);
    }
}
