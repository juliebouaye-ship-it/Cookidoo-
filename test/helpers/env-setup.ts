import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Provides dummy Cookidoo credentials for e2e tests.
 *
 * Runs before the app module is imported (jest `setupFiles`), so env
 * validation and the Cookidoo config factory succeed. Login is lazy, so no
 * real Cookidoo request is ever made by these tests.
 */
process.env.NODE_ENV ??= 'test';
process.env.COOKIDOO_EMAIL ??= 'e2e@example.com';
process.env.COOKIDOO_PASSWORD ??= 'e2e-password';
process.env.MCP_AUTH_TOKEN ??= 'e2e-token-0123456789abcdef0123456789abcdef';
process.env.CALENDAR_CACHE_FILE ??= join(
  tmpdir(),
  `cookidoo-mcp-e2e-calendar-${process.pid}.json`,
);
