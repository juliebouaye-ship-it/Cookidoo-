import { z } from 'zod';

/** An ISO `YYYY-MM-DD` calendar day. */
const daySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Day must be an ISO date, e.g. "2026-06-26"')
  .describe('Calendar day as an ISO date (YYYY-MM-DD)');

/** Input schema for the `cookidoo_get_calendar_week` MCP tool. */
export const calendarWeekSchema = {
  day: daySchema.describe(
    'Any ISO date (YYYY-MM-DD) within the target week; the whole week is returned',
  ),
};

/** Input schema for the `cookidoo_add_recipes_to_calendar` MCP tool. */
export const calendarAddRecipesSchema = {
  day: daySchema.describe('ISO date (YYYY-MM-DD) to plan the recipes on'),
  recipeIds: z
    .array(z.string().min(1))
    .min(1)
    .describe('Ids of the recipes to add to that day'),
};

/** Input schema for the `cookidoo_remove_recipe_from_calendar` MCP tool. */
export const calendarRemoveRecipeSchema = {
  day: daySchema.describe('ISO date (YYYY-MM-DD) the recipe is planned on'),
  recipeId: z.string().min(1).describe('Id of the recipe to remove'),
};

/** Input schema for the `cookidoo_get_calendar_history` MCP tool. */
export const calendarHistorySchema = {
  weeks: z
    .number()
    .int()
    .min(1)
    .max(26)
    .default(12)
    .describe(
      'How many weeks of planning to look back over, counting the current week (1-26, default 12)',
    ),
  until: daySchema
    .optional()
    .describe('Last day to include (ISO date). Defaults to today'),
  refresh: z
    .boolean()
    .default(false)
    .describe(
      'Re-fetch past weeks from Cookidoo instead of the local cache. Only use if the user says past planning was changed',
    ),
};
