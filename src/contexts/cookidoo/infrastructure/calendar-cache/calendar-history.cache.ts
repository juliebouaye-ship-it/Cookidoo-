import { Injectable, Logger } from '@nestjs/common';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { CookidooHistoryDay } from '@contexts/cookidoo/domain/types/cookidoo-calendar-history.type';

/** Default location of the cache file, next to the session file. */
export const DEFAULT_CALENDAR_CACHE_FILE = './data/calendar-history.json';

/** DI token for the cache file path (overridable in tests). */
export const CALENDAR_CACHE_FILE = Symbol('CALENDAR_CACHE_FILE');

/** A finished week, frozen once every one of its days is in the past. */
export interface CachedWeek {
  /** When it was fetched from Cookidoo (ISO timestamp). */
  readonly fetchedAt: string;
  /** Every day of that week, including the empty ones. */
  readonly days: CookidooHistoryDay[];
}

interface CacheFile {
  readonly version: 1;
  readonly weeks: Record<string, CachedWeek>;
}

/**
 * Local, on-disk cache of past meal-planner weeks, keyed by the week's Monday.
 *
 * Past weeks never change, so reading the history again costs no Cookidoo
 * call at all — this is what keeps the request volume low (and the account
 * safe from rate limiting). Only finished weeks are stored; the current and
 * future weeks are always fetched live.
 */
@Injectable()
export class CalendarHistoryCache {
  private readonly logger = new Logger(CalendarHistoryCache.name);
  private weeks: Record<string, CachedWeek> | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async get(weekStart: string): Promise<CachedWeek | undefined> {
    const weeks = await this.load();
    return weeks[weekStart];
  }

  async set(weekStart: string, week: CachedWeek): Promise<void> {
    const weeks = await this.load();
    weeks[weekStart] = week;
    await this.persist();
  }

  async delete(weekStart: string): Promise<void> {
    const weeks = await this.load();
    if (weekStart in weeks) {
      delete weeks[weekStart];
      await this.persist();
    }
  }

  private async load(): Promise<Record<string, CachedWeek>> {
    if (this.weeks) {
      return this.weeks;
    }
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<CacheFile>;
      this.weeks =
        parsed.version === 1 && parsed.weeks && typeof parsed.weeks === 'object'
          ? { ...parsed.weeks }
          : {};
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(
          `Ignoring unreadable calendar cache ${this.filePath}: ${String(error)}`,
        );
      }
      this.weeks = {};
    }
    return this.weeks;
  }

  /** Serialised, atomic write (temp file + rename) so a crash never corrupts it. */
  private persist(): Promise<void> {
    const snapshot: CacheFile = { version: 1, weeks: { ...this.weeks } };
    this.writeChain = this.writeChain
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true });
        const tmp = `${this.filePath}.${process.pid}.tmp`;
        await writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
        await rename(tmp, this.filePath);
      });
    return this.writeChain;
  }
}
