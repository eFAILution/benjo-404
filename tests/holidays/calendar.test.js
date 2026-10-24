import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  dayNumber,
  daysBetween,
  easterDate,
  fromDayNumber,
  HOLIDAYS,
  holidayDate,
  weekdayOf,
} from '../../src/holidays/calendar.js';

const byId = (id) => {
  const holiday = HOLIDAYS.find((entry) => entry.id === id);
  assert.ok(holiday, `missing holiday ${id}`);
  return holiday;
};

describe('HOLIDAYS table', () => {
  test('lists the fourteen holidays from the plan in calendar order', () => {
    assert.deepEqual(
      HOLIDAYS.map((holiday) => holiday.id),
      [
        'newyear',
        'mlk',
        'valentines',
        'presidents',
        'stpatricks',
        'easter',
        'memorial',
        'juneteenth',
        'independence',
        'labor',
        'halloween',
        'veterans',
        'thanksgiving',
        'christmas',
      ],
    );
  });

  test('every entry has a safe id, a name, and a non-negative window', () => {
    for (const holiday of HOLIDAYS) {
      assert.match(holiday.id, /^[a-z0-9-]{1,32}$/);
      assert.ok(holiday.name.length > 0);
      assert.ok(Number.isInteger(holiday.before) && holiday.before >= 0);
      assert.ok(Number.isInteger(holiday.after) && holiday.after >= 0);
    }
  });

  test('windows match the plan', () => {
    const windows = Object.fromEntries(
      HOLIDAYS.map((holiday) => [holiday.id, [holiday.before, holiday.after]]),
    );
    assert.deepEqual(windows, {
      newyear: [6, 3],
      mlk: [2, 0],
      valentines: [14, 1],
      presidents: [2, 0],
      stpatricks: [10, 1],
      easter: [14, 1],
      memorial: [3, 0],
      juneteenth: [3, 0],
      independence: [14, 1],
      labor: [3, 0],
      halloween: [21, 1],
      veterans: [3, 0],
      thanksgiving: [14, 1],
      christmas: [24, 1],
    });
  });
});

describe('dayNumber and daysBetween', () => {
  test('the epoch is day zero', () => {
    assert.equal(dayNumber({ y: 1970, m: 1, d: 1 }), 0);
    assert.equal(dayNumber({ y: 1969, m: 12, d: 31 }), -1);
  });

  test('matches UTC Date math for known dates', () => {
    const msPerDay = 86400000;
    for (const [y, m, d] of [
      [2000, 2, 29],
      [2000, 3, 1],
      [2024, 12, 31],
      [2026, 10, 24],
      [2100, 3, 1],
    ]) {
      assert.equal(dayNumber({ y, m, d }), Date.UTC(y, m - 1, d) / msPerDay);
    }
  });

  test('round trips through fromDayNumber', () => {
    for (let days = -800; days <= 60000; days += 37) {
      assert.equal(dayNumber(fromDayNumber(days)), days);
    }
    assert.deepEqual(fromDayNumber(dayNumber({ y: 2028, m: 2, d: 29 })), {
      y: 2028,
      m: 2,
      d: 29,
    });
  });

  test('counts across the year boundary and leap days', () => {
    assert.equal(daysBetween({ y: 2026, m: 12, d: 28 }, { y: 2027, m: 1, d: 1 }), 4);
    assert.equal(daysBetween({ y: 2028, m: 2, d: 28 }, { y: 2028, m: 3, d: 1 }), 2);
    assert.equal(daysBetween({ y: 2027, m: 1, d: 2 }, { y: 2026, m: 12, d: 25 }), -8);
  });

  test('weekdayOf follows Date.getDay with Sunday 0', () => {
    assert.equal(weekdayOf({ y: 1970, m: 1, d: 1 }), 4);
    assert.equal(weekdayOf({ y: 2026, m: 10, d: 24 }), 6);
    assert.equal(weekdayOf({ y: 1969, m: 12, d: 28 }), 0);
  });
});

describe('easterDate', () => {
  test('2026 is April 5', () => {
    assert.deepEqual(easterDate(2026), { y: 2026, m: 4, d: 5 });
  });

  test('2027 is March 28', () => {
    assert.deepEqual(easterDate(2027), { y: 2027, m: 3, d: 28 });
  });

  test('matches published dates for other years', () => {
    assert.deepEqual(easterDate(2024), { y: 2024, m: 3, d: 31 });
    assert.deepEqual(easterDate(2025), { y: 2025, m: 4, d: 20 });
    assert.deepEqual(easterDate(2038), { y: 2038, m: 4, d: 25 });
  });
});

describe('holidayDate', () => {
  test('Thanksgiving 2026 is November 26', () => {
    assert.deepEqual(holidayDate(byId('thanksgiving'), 2026), {
      y: 2026,
      m: 11,
      d: 26,
    });
  });

  test('Memorial Day 2026 is May 25', () => {
    assert.deepEqual(holidayDate(byId('memorial'), 2026), {
      y: 2026,
      m: 5,
      d: 25,
    });
  });

  test('nth weekday rules for other years', () => {
    assert.deepEqual(holidayDate(byId('mlk'), 2026), { y: 2026, m: 1, d: 19 });
    assert.deepEqual(holidayDate(byId('presidents'), 2026), {
      y: 2026,
      m: 2,
      d: 16,
    });
    assert.deepEqual(holidayDate(byId('labor'), 2026), { y: 2026, m: 9, d: 7 });
    assert.deepEqual(holidayDate(byId('memorial'), 2027), {
      y: 2027,
      m: 5,
      d: 31,
    });
    assert.deepEqual(holidayDate(byId('thanksgiving'), 2027), {
      y: 2027,
      m: 11,
      d: 25,
    });
  });

  test('fixed rules', () => {
    assert.deepEqual(holidayDate(byId('halloween'), 2026), {
      y: 2026,
      m: 10,
      d: 31,
    });
    assert.deepEqual(holidayDate(byId('newyear'), 2027), {
      y: 2027,
      m: 1,
      d: 1,
    });
  });

  test('easter rule applies its day offset across a month boundary', () => {
    const goodFriday = {
      id: 'goodfriday',
      name: 'Good Friday',
      rule: { kind: 'easter', offsetDays: -2 },
      before: 0,
      after: 0,
    };
    assert.deepEqual(holidayDate(byId('easter'), 2026), {
      y: 2026,
      m: 4,
      d: 5,
    });
    assert.deepEqual(holidayDate(goodFriday, 2026), { y: 2026, m: 4, d: 3 });
    assert.deepEqual(holidayDate(goodFriday, 2024), { y: 2024, m: 3, d: 29 });
  });
});
