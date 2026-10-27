import { Injectable, Logger } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { McpTool } from '@core/mcp/domain/decorators/mcp-tool.decorator';
import { IMcpTool } from '@core/mcp/domain/interfaces/mcp-tool.interface';
import { CalendarFindHistoryQuery } from '@contexts/cookidoo/application/queries/calendar-find-history/calendar-find-history.query';
import { calendarHistorySchema } from '../schemas/calendar.schema';

@McpTool()
@Injectable()
export class CalendarGetHistoryMcpTool implements IMcpTool {
  private readonly logger = new Logger(CalendarGetHistoryMcpTool.name);

  readonly name = 'cookidoo_get_calendar_history';
  readonly title = 'Get meal-planner history';
  readonly description =
    'Returns what was planned on the Cookidoo meal-planner calendar over the last N weeks, ' +
    'as a frequency ranking (most planned recipes first, with the last date planned) plus the day-by-day list. ' +
    'This is the household cooking history: use it to learn which recipes and kinds of dishes they like, ' +
    'and to avoid repeating recent meals. Past weeks are cached locally, so calling it again is cheap; ' +
    'prefer one call with enough weeks over many calls to cookidoo_get_calendar_week.';
  readonly inputSchema = calendarHistorySchema;

  constructor(private readonly queryBus: QueryBus) {}

  async execute(args: Record<string, unknown>): Promise<CallToolResult> {
    const { weeks, until, refresh } = args as {
      weeks: number;
      until?: string;
      refresh?: boolean;
    };
    this.logger.log(`Loading ${weeks} week(s) of calendar history`);
    const result = await this.queryBus.execute(
      new CalendarFindHistoryQuery({ weeks, until, refresh }),
    );
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  }
}
