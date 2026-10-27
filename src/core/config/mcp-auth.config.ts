import { registerAs } from '@nestjs/config';

/** Minimum length accepted for `MCP_AUTH_TOKEN` (e.g. `openssl rand -hex 32` gives 64). */
export const MCP_AUTH_TOKEN_MIN_LENGTH = 32;

export interface McpAuthConfig {
  /** Shared secret required on every MCP request, or `undefined` when auth is disabled. */
  readonly token?: string;
  /** Explicit opt-out, only meant for a server bound to localhost. */
  readonly disabled: boolean;
}

/**
 * Resolves the MCP endpoint protection from the environment.
 *
 * The endpoint drives a real Cookidoo account, so it is protected by default:
 * the server refuses to start without `MCP_AUTH_TOKEN` unless
 * `MCP_AUTH_DISABLED=true` is set on purpose (local-only use).
 */
export const mcpAuthConfig = registerAs('mcpAuth', (): McpAuthConfig => ({
  token: process.env.MCP_AUTH_TOKEN?.trim() || undefined,
  disabled: process.env.MCP_AUTH_DISABLED?.trim().toLowerCase() === 'true',
}));
