/** A recipe as kept in the planning history (only what the agent needs). */
export interface CookidooHistoryRecipe {
  readonly id: string;
  readonly name: string;
  /** Total time in seconds, when Cookidoo provides it. */
  readonly totalTime: number | null;
  /** `true` for a user-created ("custom") recipe. */
  readonly custom: boolean;
}

/** One day of past planning. Days with nothing planned are omitted. */
export interface CookidooHistoryDay {
  /** ISO date (YYYY-MM-DD). */
  readonly date: string;
  readonly recipes: CookidooHistoryRecipe[];
}

/** How often a recipe was planned over the requested period. */
export interface CookidooHistoryFrequency {
  readonly id: string;
  readonly name: string;
  readonly custom: boolean;
  readonly count: number;
  /** ISO date of the most recent day it was planned on. */
  readonly lastPlanned: string;
}

/** Aggregated meal-planner history over several weeks. */
export interface CookidooCalendarHistory {
  /** First day covered (ISO date, a Monday). */
  readonly from: string;
  /** Last day covered (ISO date). */
  readonly until: string;
  readonly weeksRequested: number;
  /** Weeks served from the local cache (no Cookidoo call). */
  readonly weeksFromCache: number;
  /** Weeks fetched from Cookidoo during this call. */
  readonly weeksFetched: number;
  /** Recipes sorted by how often they were planned, most frequent first. */
  readonly frequency: CookidooHistoryFrequency[];
  /** Day-by-day planning, most recent first. */
  readonly days: CookidooHistoryDay[];
}
