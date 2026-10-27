import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ICookidooClient } from '@contexts/cookidoo/domain/interfaces/cookidoo-client.interface';
import { CookidooCalendarDay } from '@contexts/cookidoo/domain/types/cookidoo-calendar.type';
import { CalendarHistoryCache } from '@contexts/cookidoo/infrastructure/calendar-cache/calendar-history.cache';
import {
  CalendarFindHistoryQueryHandler,
  computeFrequency,
  LIVE_FETCH_DELAY_MS,
} from './calendar-find-history.handler';
import { CalendarFindHistoryQuery } from './calendar-find-history.query';
import { weekStart, weekStartsBackFrom } from './calendar-week.util';

/** Builds the 7 days Cookidoo returns for the week starting on `monday`. */
function fakeWeek(
  monday: string,
  plan: Record<string, string[]> = {},
): CookidooCalendarDay[] {
  const [y, m, d] = monday.split('-').map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const id = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    const recipeIds = plan[id] ?? [];
    return {
      id,
      title: id,
      recipes: recipeIds.map((rid) => ({
        id: rid,
        name: `Recipe ${rid}`,
        totalTime: 1200,
        thumbnail: null,
        image: null,
        url: `https://cookidoo.fr/recipes/recipe/fr-FR/${rid}`,
      })),
      customerRecipeIds: recipeIds.filter((rid) => rid.startsWith('c')),
    };
  });
}

describe('calendar week utils', () => {
  it('finds the Monday of a week', () => {
    expect(weekStart('2026-10-27')).toBe('2026-10-26'); // Tuesday
    expect(weekStart('2026-11-01')).toBe('2026-10-26'); // Sunday
    expect(weekStart('2026-10-26')).toBe('2026-10-26'); // Monday
  });

  it('lists week starts backwards, across a month boundary', () => {
    expect(weekStartsBackFrom('2026-10-27', 3)).toEqual([
      '2026-10-26',
      '2026-10-19',
      '2026-10-12',
    ]);
    expect(weekStartsBackFrom('2026-03-03', 2)).toEqual([
      '2026-03-02',
      '2026-02-23',
    ]);
  });
});

describe('computeFrequency', () => {
  it('ranks by count, then by most recent', () => {
    const result = computeFrequency([
      {
        date: '2026-10-20',
        recipes: [{ id: 'a', name: 'A', totalTime: null, custom: false }],
      },
      {
        date: '2026-10-13',
        recipes: [
          { id: 'a', name: 'A', totalTime: null, custom: false },
          { id: 'b', name: 'B', totalTime: null, custom: false },
        ],
      },
      {
        date: '2026-10-21',
        recipes: [{ id: 'c', name: 'C', totalTime: null, custom: true }],
      },
    ]);

    expect(result.map((r) => [r.id, r.count, r.lastPlanned])).toEqual([
      ['a', 2, '2026-10-20'],
      ['c', 1, '2026-10-21'],
      ['b', 1, '2026-10-13'],
    ]);
  });
});

describe('CalendarFindHistoryQueryHandler', () => {
  let dir: string;
  let cacheFile: string;
  let getWeek: jest.Mock;
  let pauses: number[];

  const plans: Record<string, Record<string, string[]>> = {
    '2026-10-26': { '2026-10-26': ['r1'], '2026-10-30': ['r9'] }, // current week
    '2026-10-19': { '2026-10-20': ['r1', 'c1'] },
    '2026-10-12': { '2026-10-15': ['r2'] },
  };

  function makeHandler(): CalendarFindHistoryQueryHandler {
    const client = {
      getRecipesInCalendarWeek: getWeek,
    } as unknown as ICookidooClient;
    const handler = new CalendarFindHistoryQueryHandler(
      client,
      new CalendarHistoryCache(cacheFile),
    );
    // Tuesday 27 Oct 2026, noon local time.
    handler.now = () => new Date(2026, 9, 27, 12, 0, 0);
    handler.pause = (ms) => {
      pauses.push(ms);
      return Promise.resolve();
    };
    return handler;
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cookidoo-history-'));
    cacheFile = join(dir, 'nested', 'calendar-history.json');
    pauses = [];
    getWeek = jest.fn((day: string) =>
      Promise.resolve(fakeWeek(day, plans[day] ?? {})),
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('aggregates the weeks, up to today, most recent first', async () => {
    const result = await makeHandler().execute(
      new CalendarFindHistoryQuery({ weeks: 3 }),
    );

    expect(result.from).toBe('2026-10-12');
    expect(result.until).toBe('2026-10-27');
    expect(result.days.map((d) => d.date)).toEqual([
      '2026-10-26',
      '2026-10-20',
      '2026-10-15',
    ]);
    // r9 is planned for Friday: in the future, so not history.
    expect(result.frequency.map((f) => f.id)).not.toContain('r9');
    expect(result.frequency[0]).toMatchObject({ id: 'r1', count: 2 });
    expect(result.frequency.find((f) => f.id === 'c1')?.custom).toBe(true);
    expect(result.weeksFetched).toBe(3);
    expect(result.weeksFromCache).toBe(0);
  });

  it('spaces out live calls to Cookidoo', async () => {
    await makeHandler().execute(new CalendarFindHistoryQuery({ weeks: 3 }));
    expect(pauses).toEqual([LIVE_FETCH_DELAY_MS, LIVE_FETCH_DELAY_MS]);
  });

  it('serves finished weeks from the disk cache on the next call', async () => {
    await makeHandler().execute(new CalendarFindHistoryQuery({ weeks: 3 }));
    getWeek.mockClear();

    // A fresh handler + cache instance: proves it was persisted to disk.
    const result = await makeHandler().execute(
      new CalendarFindHistoryQuery({ weeks: 3 }),
    );

    expect(getWeek.mock.calls.map((c) => c[0])).toEqual(['2026-10-26']);
    expect(result.weeksFromCache).toBe(2);
    expect(result.weeksFetched).toBe(1);
    expect(result.frequency[0]).toMatchObject({ id: 'r1', count: 2 });

    const onDisk = JSON.parse(readFileSync(cacheFile, 'utf8'));
    expect(Object.keys(onDisk.weeks).sort()).toEqual([
      '2026-10-12',
      '2026-10-19',
    ]);
  });

  it('never caches the current week', async () => {
    await makeHandler().execute(new CalendarFindHistoryQuery({ weeks: 1 }));
    await makeHandler().execute(new CalendarFindHistoryQuery({ weeks: 1 }));
    expect(getWeek).toHaveBeenCalledTimes(2);
  });

  it('re-fetches past weeks when refresh is set', async () => {
    await makeHandler().execute(new CalendarFindHistoryQuery({ weeks: 3 }));
    getWeek.mockClear();
    await makeHandler().execute(
      new CalendarFindHistoryQuery({ weeks: 3, refresh: true }),
    );
    expect(getWeek).toHaveBeenCalledTimes(3);
  });

  it('stops at an earlier "until" date', async () => {
    const result = await makeHandler().execute(
      new CalendarFindHistoryQuery({ weeks: 2, until: '2026-10-21' }),
    );
    expect(result.from).toBe('2026-10-12');
    expect(result.until).toBe('2026-10-21');
    expect(getWeek.mock.calls.map((c) => c[0])).toEqual([
      '2026-10-19',
      '2026-10-12',
    ]);
  });
});
