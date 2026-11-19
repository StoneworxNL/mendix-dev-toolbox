// Date logic that depends on the local time zone, run in a zone with daylight saving time.
// CI runs in UTC, where offset bugs never show. Each test file runs in its own process.
process.env.TZ = 'Europe/Amsterdam';
const { test } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const mxx = await import(new URL('../../src/toolbox/lib/mxxpath.js', import.meta.url));
const dp = await import(new URL('../../src/toolbox/lib/datepattern.js', import.meta.url));

// 30 October 2026, 15:20 in Amsterdam (CET, UTC+1); summer time ended on 25 October.
const now = new Date('2026-10-30T14:20:00Z');
const at = (name) => mxx.resolveDateToken(name, { now, firstDay: 1 }).toISOString();
const expr = (e) => mxx.evaluateDateExpression(e, { now }).toISOString();

test('the zone is in effect', () => assert.equal(now.getTimezoneOffset(), -60));

test('UTC tokens do not depend on the local offset across daylight saving', () => {
  assert.equal(at('BeginOfCurrentMonthUTC'), '2026-10-01T00:00:00.000Z');
  assert.equal(at('EndOfCurrentMonthUTC'), '2026-10-31T23:59:59.999Z');
  assert.equal(at('BeginOfCurrentDayUTC'), '2026-10-30T00:00:00.000Z');
  assert.equal(at('BeginOfCurrentWeekUTC'), '2026-10-26T00:00:00.000Z');
  assert.equal(at('BeginOfCurrentYearUTC'), '2026-01-01T00:00:00.000Z');
  assert.equal(expr('[%BeginOfCurrentMonthUTC%] - 1 * [%MonthLength%]'), '2026-09-01T00:00:00.000Z');
  assert.equal(expr('[%BeginOfCurrentDayUTC%] - 7 * [%DayLength%]'), '2026-10-23T00:00:00.000Z');
});

test('local tokens follow the local calendar across daylight saving', () => {
  assert.equal(at('BeginOfCurrentMonth'), '2026-09-30T22:00:00.000Z'); // 1 October 00:00 CEST
  assert.equal(at('EndOfCurrentMonth'), '2026-10-31T22:59:59.999Z'); // 31 October 23:59:59.999 CET
  assert.equal(at('BeginOfCurrentWeek'), '2026-10-25T23:00:00.000Z'); // Monday 26 October 00:00 CET
  assert.equal(expr('[%BeginOfCurrentDay%] - 7 * [%DayLength%]'), '2026-10-22T22:00:00.000Z'); // 23 October 00:00 CEST
  assert.equal(at('EndOfYesterday'), '2026-10-29T22:59:59.999Z');
});

test('date patterns show local time and UTC', () => {
  assert.equal(dp.formatDate(now, "yyyy-MM-dd'T'HH:mm XXX"), '2026-10-30T15:20 +01:00');
  assert.equal(dp.formatDate(new Date('2026-07-01T12:00:00Z'), 'HH:mm Z'), '14:00 +0200');
  assert.equal(dp.formatDate(now, 'HH:mm', { utc: true }), '14:20');
  assert.equal(dp.parseDate('2026-10-25 02:30', 'yyyy-MM-dd HH:mm', { utc: true }).toISOString(), '2026-10-25T02:30:00.000Z');
});
