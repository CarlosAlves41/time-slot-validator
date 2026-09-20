import test from 'node:test';
import assert from 'node:assert/strict';
import { AvailabilityWindow, TimeSlotValidator } from '../src/index.js';

function utc(year, month, day, hour = 0, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

const londonWindow = new AvailabilityWindow({
  daysOfWeek: [1, 2, 3, 4, 5],
  startTime: '09:00',
  endTime: '17:00',
  timeZone: 'Europe/London',
});

const nyWindow = new AvailabilityWindow({
  daysOfWeek: [0, 6],
  startTime: '10:00',
  endTime: '14:00',
  timeZone: 'America/New_York',
});

const overnightWindow = new AvailabilityWindow({
  daysOfWeek: [5, 6],
  startTime: '22:00',
  endTime: '02:00',
  timeZone: 'Europe/London',
});

test('valid instant inside a normal window', () => {
  const validator = new TimeSlotValidator([londonWindow], () => utc(2024, 1, 1));
  assert.equal(validator.isValid(utc(2024, 1, 2, 11, 0)), true); // Tuesday 11:00 UTC = 11:00 London
});

test('invalid instant outside a normal window', () => {
  const validator = new TimeSlotValidator([londonWindow], () => utc(2024, 1, 1));
  assert.equal(validator.isValid(utc(2024, 1, 2, 18, 0)), false);
});

test('invalid instant on a non-listed day', () => {
  const validator = new TimeSlotValidator([londonWindow], () => utc(2024, 1, 1));
  assert.equal(validator.isValid(utc(2024, 1, 6, 11, 0)), false); // Saturday
});

test('timezone offset is applied before comparing wall-clock time', () => {
  const validator = new TimeSlotValidator([nyWindow], () => utc(2024, 1, 1));
  // 14:00 UTC is 09:00 New York (EST), which is before the 10:00 start
  assert.equal(validator.isValid(utc(2024, 1, 7, 14, 0)), false);
  // 15:00 UTC is 10:00 New York, exactly the start boundary
  assert.equal(validator.isValid(utc(2024, 1, 7, 15, 0)), true);
});

test('start boundary is inclusive, end boundary is exclusive', () => {
  const validator = new TimeSlotValidator([londonWindow], () => utc(2024, 1, 1));
  assert.equal(validator.isValid(utc(2024, 1, 2, 9, 0)), true);
  assert.equal(validator.isValid(utc(2024, 1, 2, 17, 0)), false);
});

test('overnight window includes times after midnight on following day', () => {
  const validator = new TimeSlotValidator([overnightWindow], () => utc(2024, 1, 1));
  // Friday 23:00 London is inside Friday's 22:00-02:00 window
  assert.equal(validator.isValid(utc(2024, 1, 5, 23, 0)), true);
  // Saturday 01:00 London is still inside Friday's overnight window
  assert.equal(validator.isValid(utc(2024, 1, 6, 1, 0)), true);
  // Saturday 03:00 London is outside
  assert.equal(validator.isValid(utc(2024, 1, 6, 3, 0)), false);
});

test('overnight window does not leak into unlisted following days', () => {
  const validator = new TimeSlotValidator([overnightWindow], () => utc(2024, 1, 1));
  // Sunday 01:00 London is after Saturday's 22:00-02:00, but Sunday is not in daysOfWeek
  assert.equal(validator.isValid(utc(2024, 1, 7, 1, 0)), false);
});

test('multiple windows are combined with OR', () => {
  const validator = new TimeSlotValidator([londonWindow, nyWindow], () => utc(2024, 1, 1));
  // Sunday 15:00 UTC is 10:00 New York, valid in nyWindow
  assert.equal(validator.isValid(utc(2024, 1, 7, 15, 0)), true);
  // Tuesday 11:00 UTC is 11:00 London, valid in londonWindow
  assert.equal(validator.isValid(utc(2024, 1, 2, 11, 0)), true);
  // Tuesday 20:00 UTC is 15:00 New York (not valid) and 20:00 London (not valid)
  assert.equal(validator.isValid(utc(2024, 1, 2, 20, 0)), false);
});

test('isValid uses injected clock when no argument is provided', () => {
  const fixedNow = utc(2024, 3, 4, 10, 0); // Monday 10:00 UTC = 10:00 London (GMT)
  const validator = new TimeSlotValidator([londonWindow], () => fixedNow);
  assert.equal(validator.isValid(), true);
});

test('validator throws on invalid Date argument', () => {
  const validator = new TimeSlotValidator([londonWindow], () => utc(2024, 1, 1));
  assert.throws(() => validator.isValid(new Date('invalid')), TypeError);
  assert.throws(() => validator.isValid('not a date'), TypeError);
});

test('AvailabilityWindow rejects invalid daysOfWeek', () => {
  assert.throws(
    () => new AvailabilityWindow({ daysOfWeek: [7], startTime: '09:00', endTime: '17:00', timeZone: 'UTC' }),
    RangeError
  );
  assert.throws(
    () => new AvailabilityWindow({ daysOfWeek: [], startTime: '09:00', endTime: '17:00', timeZone: 'UTC' }),
    TypeError
  );
});

test('AvailabilityWindow rejects invalid times', () => {
  assert.throws(
    () => new AvailabilityWindow({ daysOfWeek: [1], startTime: '9:00', endTime: '17:00', timeZone: 'UTC' }),
    RangeError
  );
  assert.throws(
    () => new AvailabilityWindow({ daysOfWeek: [1], startTime: '24:00', endTime: '17:00', timeZone: 'UTC' }),
    RangeError
  );
  assert.throws(
    () => new AvailabilityWindow({ daysOfWeek: [1], startTime: '09:00', endTime: '09:00', timeZone: 'UTC' }),
    RangeError
  );
});
