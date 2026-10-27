import { validateEnv } from './env.validation';

function validEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: 'development',
    COOKIDOO_EMAIL: 'user@example.com',
    COOKIDOO_PASSWORD: 'secret',
    MCP_AUTH_TOKEN: 'a'.repeat(64),
    ...overrides,
  };
}

describe('validateEnv', () => {
  it('accepts a complete environment', () => {
    expect(() => validateEnv(validEnv())).not.toThrow();
  });

  it('accepts optional localization overrides', () => {
    expect(() =>
      validateEnv(
        validEnv({
          COOKIDOO_COUNTRY_CODE: 'es',
          COOKIDOO_LANGUAGE: 'es',
          COOKIDOO_URL: 'https://cookidoo.es/foundation/es',
        }),
      ),
    ).not.toThrow();
  });

  it('rejects a missing MCP_AUTH_TOKEN unless auth is explicitly disabled', () => {
    expect(() => validateEnv(validEnv({ MCP_AUTH_TOKEN: undefined }))).toThrow(
      /MCP_AUTH_TOKEN is required/,
    );
    expect(() =>
      validateEnv(
        validEnv({ MCP_AUTH_TOKEN: undefined, MCP_AUTH_DISABLED: 'true' }),
      ),
    ).not.toThrow();
  });

  it('rejects a short MCP_AUTH_TOKEN', () => {
    expect(() => validateEnv(validEnv({ MCP_AUTH_TOKEN: 'short' }))).toThrow(
      /at least 32 characters/,
    );
  });

  it('rejects an MCP_AUTH_TOKEN that is not URL-safe', () => {
    expect(() =>
      validateEnv(validEnv({ MCP_AUTH_TOKEN: `${'a'.repeat(40)}/../x` })),
    ).toThrow(/may only contain/);
  });

  it('rejects a missing email', () => {
    expect(() => validateEnv(validEnv({ COOKIDOO_EMAIL: undefined }))).toThrow(
      /Environment validation failed:[\s\S]*COOKIDOO_EMAIL/,
    );
  });

  it('rejects an invalid email', () => {
    expect(() =>
      validateEnv(validEnv({ COOKIDOO_EMAIL: 'not-an-email' })),
    ).toThrow(/COOKIDOO_EMAIL/);
  });

  it('rejects an empty password', () => {
    expect(() => validateEnv(validEnv({ COOKIDOO_PASSWORD: '' }))).toThrow(
      /COOKIDOO_PASSWORD/,
    );
  });

  it('rejects a non-URL localization url', () => {
    expect(() => validateEnv(validEnv({ COOKIDOO_URL: 'not a url' }))).toThrow(
      /COOKIDOO_URL/,
    );
  });

  it('accepts a valid OTEL_EXPORTER_OTLP_ENDPOINT', () => {
    const env = validEnv({
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318',
    });

    expect(() => validateEnv(env)).not.toThrow();
  });

  it('rejects a non-URL OTEL_EXPORTER_OTLP_ENDPOINT', () => {
    const env = validEnv({ OTEL_EXPORTER_OTLP_ENDPOINT: 'not-a-url' });

    expect(() => validateEnv(env)).toThrow(
      /Environment validation failed:[\s\S]*OTEL_EXPORTER_OTLP_ENDPOINT/,
    );
  });
});
