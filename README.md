# Time Slot Validator

A small, dependency-free ESM library that checks whether a UTC instant falls within a set of recurring availability windows defined in a specific IANA timezone.

```js
import { AvailabilityWindow, TimeSlotValidator } from 'time-slot-validator';

const londonOfficeHours = new AvailabilityWindow({
  daysOfWeek: [1, 2, 3, 4, 5], // Monday–Friday
  startTime: '09:00',
  endTime: '17:00',
  timeZone: 'Europe/London',
});

const validator = new TimeSlotValidator([londonOfficeHours]);

validator.isValid(new Date('2024-03-04T10:00:00Z')); // true, Monday 10:00 London
validator.isValid(new Date('2024-03-04T18:00:00Z')); // false, after 17:00 London
```

The `TimeSlotValidator` constructor accepts an optional clock function returning a `Date`. When `isValid` is called without an argument, the clock supplies the current instant. This keeps tests deterministic.

## Why this exists

Scheduling systems often store availability as recurring weekly windows in a local timezone, but need to validate a UTC timestamp against them. The awkward part is handling the timezone conversion correctly, including daylight saving transitions and windows that cross midnight.

This library chooses to convert the UTC instant into the window's timezone using `Intl.DateTimeFormat`, then compares local day-of-week and minutes-since-midnight. The alternative — converting the window into UTC — becomes complicated when DST changes the offset between the start and end of a window. Converting the instant avoids that complexity.

A window whose start time is later than its end time is treated as crossing midnight. On a matching start day, the valid interval runs from the start time until midnight; on the following day, the interval runs from midnight until the end time, but only if that following day is also listed in `daysOfWeek`. This prevents an overnight Friday window from leaking into an unlisted Sunday.

The start boundary is inclusive and the end boundary is exclusive, matching the common half-open interval convention.

## Exports

- `AvailabilityWindow` — a class describing a recurring window.
- `TimeSlotValidator` — a class that validates a UTC instant against a list of windows.
