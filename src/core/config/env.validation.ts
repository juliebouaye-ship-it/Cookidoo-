import { z } from 'zod';

import { MCP_AUTH_TOKEN_MIN_LENGTH } from './mcp-auth.config';

function formatZodIssues(issues: z.ZodIssue[]): string {
  return issues
    .map(
      (issue) =>
        `  - ${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`,
    )
    .join('\n');
}

/**
 * Schema for the process environment.
 *
 * Cookidoo credentials are mandatory — the server logs in as a single account
 * configured here. Localization is optional and defaults to `de-CH` / Swiss
 * Cookidoo, mirroring the upstream library defaults.
 */
const baseEnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive().optional(),

  COOKIDOO_EMAIL: z
    .string()
    .trim()
    .min(1, 'COOKIDOO_EMAIL must not be empty')
    .email('COOKIDOO_EMAIL must be a valid email'),
  COOKIDOO_PASSWORD: z.string().min(1, 'COOKIDOO_PASSWORD must not be empty'),

  COOKIDOO_COUNTRY_CODE: z.string().trim().min(1).optional(),
  COOKIDOO_LANGUAGE: z.string().trim().min(1).optional(),
  COOKIDOO_URL: z.string().trim().url().optional(),

  COOKIDOO_COOKIE_FILE: z.string().trim().min(1).optional(),

  MCP_AUTH_TOKEN: z
    .string()
    .trim()
    .min(
      MCP_AUTH_TOKEN_MIN_LENGTH,
      `MCP_AUTH_TOKEN must be at least ${MCP_AUTH_TOKEN_MIN_LENGTH} characters (try: openssl rand -hex 32)`,
    )
    .regex(
      /^[A-Za-z0-9_-]+$/,
      'MCP_AUTH_TOKEN may only contain letters, digits, "-" and "_" (it can appear in a URL path)',
    )
    .optional(),
  MCP_AUTH_DISABLED: z.enum(['true', 'false']).optional(),

  CALENDAR_CACHE_FILE: z.string().trim().min(1).optional(),

  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().trim().url().optional(),
  OTEL_SERVICE_NAME: z.string().optional(),
  OTEL_TRACES_SAMPLE_RATIO: z.coerce.number().min(0).max(1).optional(),
  OTEL_METRIC_EXPORT_INTERVAL_MILLIS: z.coerce.number().positive().optional(),
});

const envSchema = baseEnvSchema.superRefine((env, ctx) => {
  if (!env.MCP_AUTH_TOKEN && env.MCP_AUTH_DISABLED !== 'true') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['MCP_AUTH_TOKEN'],
      message:
        'MCP_AUTH_TOKEN is required to protect /api/mcp (generate one with: openssl rand -hex 32). ' +
        'Set MCP_AUTH_DISABLED=true only for a server reachable from localhost alone.',
    });
  }
});

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = envSchema.safeParse(config);

  if (!parsed.success) {
    throw new Error(
      `Environment validation failed:\n${formatZodIssues(parsed.error.issues)}`,
    );
  }

  return config;
}
