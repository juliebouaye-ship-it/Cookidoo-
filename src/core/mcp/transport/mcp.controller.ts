import {
  Controller,
  Delete,
  Get,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Request, Response } from 'express';

import { McpServerFactory } from '../application/services/mcp-server.factory';
import { McpAuthGuard } from './mcp-auth.guard';

/**
 * MCP transport entry point (Streamable HTTP, stateless).
 *
 * Exposed at `POST /api/mcp` (token in an `Authorization: Bearer` header) and
 * `POST /api/mcp/<token>` (token in the URL, for clients that only take a URL).
 * A new MCP server + transport is created per request (no session state).
 * Every POST goes through {@link McpAuthGuard}: the server acts as a real
 * Cookidoo account, so it must never be reachable without the shared secret.
 */
@Controller('mcp')
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(private readonly mcpServerFactory: McpServerFactory) {}

  @Post()
  @UseGuards(McpAuthGuard)
  async handleRequest(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log('MCP request received');

    const server = this.mcpServerFactory.create();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      // Reply with a single JSON-RPC response instead of an SSE stream — the
      // tools are request/response only, so clients get plain application/json.
      enableJsonResponse: true,
    });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  @Post(':token')
  @UseGuards(McpAuthGuard)
  async handleRequestWithPathToken(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.handleRequest(req, res);
  }

  @Get()
  handleGet(@Res() res: Response): void {
    this.methodNotAllowed(res);
  }

  @Delete()
  handleDelete(@Res() res: Response): void {
    this.methodNotAllowed(res);
  }

  /**
   * Stateless transport keeps no session, so the SSE stream (GET) and session
   * termination (DELETE) defined by the spec are not supported.
   */
  private methodNotAllowed(res: Response): void {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed.' },
      id: null,
    });
  }
}
