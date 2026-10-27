import { Inject, Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import {
  COOKIDOO_CLIENT,
  ICookidooClient,
} from '@contexts/cookidoo/domain/interfaces/cookidoo-client.interface';
import { CookidooCalendarDay } from '@contexts/cookidoo/domain/types/cookidoo-calendar.type';
import {
  CookidooCalendarHistory,
  CookidooHistoryDay,
  CookidooHistoryFrequency,
} from '@contexts/cookidoo/domain/types/cookidoo-calendar-history.type';
import { CalendarHistoryCache } from '@contexts/cookidoo/infrastructure/calendar-cache/calendar-history.cache';
import { CalendarFindHistoryQuery } from './calendar-find-history.query';
import { localToday, weekStartsBackFrom } from './calendar-week.util';

/**
 * Pause between two live calls to Cookidoo. The first history load of many
 * weeks is therefore deliberately slow (about one call per second) rather than
 * a burst; later loads come from the cache and make almost no calls.
 */
export const LIVE_FETCH_DELAY_MS = 1000;

/** Keeps only what the planning agent needs from a calendar day. */
export function toHistoryDay(day: CookidooCalendarDay): CookidooHistoryDay {
  const customIds = new Set(day.customerRecipeIds);
  return {
    date: day.id,
    recipes: day.recipes.map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      totalTime: recipe.totalTime,
      custom: customIds.has(recipe.id),
    })),
  };
}

/** Counts how often each recipe was planned, most frequent first. */
export function computeFrequency(
  days: CookidooHistoryDay[],
): CookidooHistoryFrequency[] {
  const byId = new Map<string, CookidooHistoryFrequency>();
  for (const day of days) {
    for (const recipe of day.recipes) {
      const previous = byId.get(recipe.id);
      byId.set(recipe.id, {
        id: recipe.id,
        name: recipe.name,
        custom: recipe.custom,
        count: (previous?.count ?? 0) + 1,
        lastPlanned:
          previous && previous.lastPlanned > day.date
            ? previous.lastPlanned
            : day.date,
      });
    }
  }
  return [...byId.values()].sort(
    (a, b) =>
      b.count - a.count ||
      b.lastPlanned.localeCompare(a.lastPlanned) ||
      a.name.localeCompare(b.name),
  );
}

@QueryHandler(CalendarFindHistoryQuery)
export class CalendarFindHistoryQueryHandler implements IQueryHandler<CalendarFindHistoryQuery> {
  private readonly logger = new Logger(CalendarFindHistoryQueryHandler.name);

  /** Overridable in tests. */
  now: () => Date = () => new Date();
  pause: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  constructor(
    @Inject(COOKIDOO_CLIENT) private readonly client: ICookidooClient,
    private readonly cache: CalendarHistoryCache,
  ) {}

  async execute(
    query: CalendarFindHistoryQuery,
  ): Promise<CookidooCalendarHistory> {
    const today = localToday(this.now());
    const until = query.until && query.until < today ? query.until : today;
    const weekStarts = weekStartsBackFrom(until, query.weeks);

    let weeksFromCache = 0;
    let weeksFetched = 0;
    const allDays: CookidooHistoryDay[] = [];

    for (const start of weekStarts) {
      const cached = query.refresh ? undefined : await this.cache.get(start);
      if (cached) {
        weeksFromCache += 1;
        allDays.push(...cached.days);
        continue;
      }

      if (weeksFetched > 0) {
        await this.pause(LIVE_FETCH_DELAY_MS);
      }
      const days = (await this.client.getRecipesInCalendarWeek(start)).map(
        toHistoryDay,
      );
      weeksFetched += 1;
      allDays.push(...days);

      // Freeze the week only once every one of its days is in the past.
      const finished = days.length > 0 && days.every((day) => day.date < today);
      if (finished) {
        await this.cache.set(start, {
          fetchedAt: this.now().toISOString(),
          days,
        });
      }
    }

    const from = weekStarts[weekStarts.length - 1];
    const days = allDays
      .filter(
        (day) =>
          day.recipes.length > 0 && day.date >= from && day.date <= until,
      )
      .sort((a, b) => b.date.localeCompare(a.date));

    this.logger.log(
      `History ${from}..${until}: ${weeksFromCache} week(s) from cache, ${weeksFetched} fetched`,
    );

    return {
      from,
      until,
      weeksRequested: query.weeks,
      weeksFromCache,
      weeksFetched,
      frequency: computeFrequency(days),
      days,
    };
  }
}
