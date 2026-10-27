import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Request } from 'express';

import { McpAuthConfig } from '@core/config/mcp-auth.config';

/** Constant-time string comparison (hashing first equalises the lengths). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Extracts the token presented by a request, from either:
 *  - an `Authorization: Bearer <token>` header (Claude Desktop / Claude Code,
 *    any client that lets you set headers), or
 *  - the `:token` path segment of `POST /api/mcp/<token>` (for clients that
 *    only accept a URL, such as a custom connector added by URL).
 */
export function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (typeof header === 'string') {
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (match) {
      return match[1].trim();
    }
  }
  const fromPath = (req.params as Record<string, string | undefined>)?.token;
  return fromPath?.trim() || undefined;
}

/**
 * Protects the MCP endpoint with a shared secret (`MCP_AUTH_TOKEN`).
 *
 * The endpoint acts as a real Cookidoo account, so anyone reaching it without
 * this guard could read and change the account's planning and shopping list.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  private readonly logger = new Logger(McpAuthGuard.name);
  private readonly config: McpAuthConfig;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<McpAuthConfig>('mcpAuth');
    if (this.config.disabled && !this.config.token) {
      this.logger.warn(
        'MCP_AUTH_DISABLED=true: /api/mcp is NOT protected. Only expose it on localhost.',
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.token;
    if (!expected) {
      // Only reachable when auth was explicitly disabled (env validation
      // refuses to start otherwise).
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const presented = extractToken(req);
    if (presented && safeEqual(presented, expected)) {
      return true;
    }

    // Never log the presented value.
    this.logger.warn(`Rejected unauthenticated MCP request from ${req.ip}`);
    throw new HttpException(
      {
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized.' },
        id: null,
      },
      HttpStatus.UNAUTHORIZED,
    );
  }
}
