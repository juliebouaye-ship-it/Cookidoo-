/** Query: aggregate the meal-planner history over the last N weeks. */
export class CalendarFindHistoryQuery {
  /** Number of weeks to cover, counting the week of `until`. */
  public readonly weeks: number;
  /** Last day of interest (ISO date); defaults to today. */
  public readonly until?: string;
  /** Re-fetch past weeks from Cookidoo instead of using the local cache. */
  public readonly refresh: boolean;

  constructor(input: { weeks: number; until?: string; refresh?: boolean }) {
    this.weeks = input.weeks;
    this.until = input.until;
    this.refresh = input.refresh ?? false;
  }
}
