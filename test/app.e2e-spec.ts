import { createE2EApp, E2EContext } from './helpers/app-bootstrap';

describe('Cookidoo MCP server (e2e)', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await createE2EApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('GET /api/health', () => {
    it('returns 200 with status "ok" and a valid timestamp', async () => {
      const res = await ctx.http().get('/api/health').expect(200);

      expect(res.body.status).toBe('ok');
      expect(Number.isNaN(Date.parse(res.body.timestamp as string))).toBe(
        false,
      );
    });
  });

  describe('POST /api/mcp', () => {
    const token = process.env.MCP_AUTH_TOKEN as string;
    const initialize = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'e2e', version: '1.0.0' },
      },
    };
    const post = (path: string) =>
      ctx
        .http()
        .post(path)
        .set('Content-Type', 'application/json')
        .set('Accept', 'application/json, text/event-stream');

    it('completes the MCP initialize handshake with a Bearer token', async () => {
      const res = await post('/api/mcp')
        .set('Authorization', `Bearer ${token}`)
        .send(initialize)
        .expect(200);

      expect(res.body.jsonrpc).toBe('2.0');
      expect(res.body.result.serverInfo.name).toBe('cookidoo-mcp');
      expect(res.body.result.capabilities.tools).toBeDefined();
    });

    it('accepts the token as a URL path segment', async () => {
      const res = await post(`/api/mcp/${token}`).send(initialize).expect(200);
      expect(res.body.result.serverInfo.name).toBe('cookidoo-mcp');
    });

    it('rejects a request without a token', async () => {
      const res = await post('/api/mcp').send(initialize).expect(401);
      expect(res.body.error.message).toBe('Unauthorized.');
    });

    it('rejects a wrong Bearer token', async () => {
      await post('/api/mcp')
        .set('Authorization', `Bearer ${token}x`)
        .send(initialize)
        .expect(401);
    });

    it('rejects a wrong path token', async () => {
      await post('/api/mcp/not-the-token').send(initialize).expect(401);
    });

    it('does not expose the destructive tools', async () => {
      const res = await post('/api/mcp')
        .set('Authorization', `Bearer ${token}`)
        .send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
        .expect(200);

      const names = (res.body.result.tools as { name: string }[]).map(
        (tool) => tool.name,
      );
      expect(names).toContain('cookidoo_get_calendar_week');
      expect(names).toContain('cookidoo_get_calendar_history');
      for (const removed of [
        'cookidoo_clear_shopping_list',
        'cookidoo_remove_custom_recipe',
        'cookidoo_remove_managed_collection',
        'cookidoo_remove_custom_collection',
        'cookidoo_remove_recipe_from_custom_collection',
      ]) {
        expect(names).not.toContain(removed);
      }
    });
  });

  describe('unsupported MCP methods', () => {
    it('returns 405 for GET /api/mcp (no sessions)', async () => {
      const res = await ctx.http().get('/api/mcp').expect(405);
      expect(res.body.error.message).toBe('Method not allowed.');
    });

    it('returns 405 for DELETE /api/mcp (no sessions)', async () => {
      await ctx.http().delete('/api/mcp').expect(405);
    });
  });
});
