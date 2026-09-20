/**
 * Represents a recurring availability window in a fixed IANA timezone.
 *
 * Days of week are expressed in the same numeric convention as JavaScript's
 * Date#getUTCDay / getDay: 0 = Sunday, 1 = Monday, ... 6 = Saturday.
 */
export class AvailabilityWindow {
  /**
   * @param {Object} options
   * @param {number[]} options.daysOfWeek - 0 (Sunday) through 6 (Saturday)
   * @param {string} options.startTime - local wall-clock time, "HH:MM" 24-hour
   * @param {string} options.endTime - local wall-clock time, "HH:MM" 24-hour
   * @param {string} options.timeZone - IANA timezone name
   */
  constructor({ daysOfWeek, startTime, endTime, timeZone }) {
    if (!Array.isArray(daysOfWeek) || daysOfWeek.length === 0) {
      throw new TypeError('daysOfWeek must be a non-empty array');
    }
    for (const day of daysOfWeek) {
      if (!Number.isInteger(day) || day < 0 || day > 6) {
        throw new RangeError('daysOfWeek must contain integers from 0 to 6');
      }
    }
    if (typeof timeZone !== 'string' || timeZone.length === 0) {
      throw new TypeError('timeZone must be a non-empty string');
    }

    const startMinutes = parseTime(startTime);
    const endMinutes = parseTime(endTime);
    if (startMinutes === endMinutes) {
      throw new RangeError('startTime and endTime must be different');
    }

    this.daysOfWeek = [...new Set(daysOfWeek)].sort((a, b) => a - b);
    this.startTime = startTime;
    this.endTime = endTime;
    this.startMinutes = startMinutes;
    this.endMinutes = endMinutes;
    this.timeZone = timeZone;
  }
}

/**
 * Validates whether a UTC instant falls within one of the provided recurring
 * availability windows.
 *
 * The validator uses an injected clock function so callers can test
 * deterministic behaviour without depending on wall-clock time.
 */
export class TimeSlotValidator {
  /**
   * @param {AvailabilityWindow[]} windows
   * @param {() => Date} [clock] - returns a Date representing the current UTC instant
   */
  constructor(windows, clock = () => new Date()) {
    if (!Array.isArray(windows)) {
      throw new TypeError('windows must be an array');
    }
    if (typeof clock !== 'function') {
      throw new TypeError('clock must be a function returning a Date');
    }
    this.windows = windows;
    this.clock = clock;
  }

  /**
   * Returns true if the given UTC instant (default: clock()) is inside any window.
   *
   * @param {Date} [utcInstant]
   * @returns {boolean}
   */
  isValid(utcInstant = this.clock()) {
    if (!(utcInstant instanceof Date) || Number.isNaN(utcInstant.getTime())) {
      throw new TypeError('utcInstant must be a valid Date');
    }

    return this.windows.some((window) => isWithinWindow(utcInstant, window));
  }
}

/**
 * Parse a "HH:MM" string into minutes since midnight. Throws on malformed input.
 */
function parseTime(time) {
  if (typeof time !== 'string') {
    throw new TypeError('time must be a string in "HH:MM" format');
  }
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) {
    throw new RangeError(`Invalid time "${time}". Expected 24-hour "HH:MM" format`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Convert a UTC Date to the wall-clock time parts in the target timezone.
 * Uses Intl.DateTimeFormat with formatToParts so we never depend on locale
 * string parsing.
 */
function wallClockParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type)?.value;
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    dayOfWeek: weekdayMap[get('weekday')],
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

/**
 * Core containment check for a single window and a UTC instant.
 *
 * Works by converting the UTC instant into the window's timezone and comparing
 * local day-of-week and minutes-since-midnight. Handles windows that cross
 * midnight because the end comparison uses a rotated minute range when
 * startMinutes > endMinutes.
 */
function isWithinWindow(utcInstant, window) {
  const { dayOfWeek, hour, minute } = wallClockParts(utcInstant, window.timeZone);
  const currentMinutes = hour * 60 + minute;

  if (!window.daysOfWeek.includes(dayOfWeek)) {
    return false;
  }

  if (window.startMinutes < window.endMinutes) {
    return currentMinutes >= window.startMinutes && currentMinutes < window.endMinutes;
  }

  // Window crosses midnight, e.g. 22:00-02:00.
  // On a matching start day, the valid interval is [startMinutes, 1440).
  // On the following day, valid interval is [0, endMinutes), but that day must
  // also be listed in daysOfWeek to be included; otherwise the window only
  // applies from its start day until midnight.
  const previousDay = (dayOfWeek + 6) % 7;
  const previousDayMatches = window.daysOfWeek.includes(previousDay);
  const previousWindowContinues = previousDayMatches && currentMinutes < window.endMinutes;
  return currentMinutes >= window.startMinutes || previousWindowContinues;
}
