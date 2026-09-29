import { describe, expect, it } from 'vitest';
import { loadEnv } from '../../../src/config/env.js';

describe('loadEnv — AI provider configuration', () => {
  it('defaults to the mock provider when nothing is configured', () => {
    expect(loadEnv({})).toMatchObject({ AI_PROVIDER: 'mock', OPENAI_MODEL: 'gpt-5-mini', OPENAI_TIMEOUT_MS: 15_000 });
  });

  it('treats empty strings (as passed by Docker Compose) as unset', () => {
    expect(loadEnv({ AI_PROVIDER: '', OPENAI_API_KEY: '', OPENAI_MODEL: '', OPENAI_TIMEOUT_MS: '' })).toMatchObject({
      AI_PROVIDER: 'mock',
      OPENAI_API_KEY: undefined,
      OPENAI_MODEL: 'gpt-5-mini'
    });
  });

  it('allows mock mode with a key present', () => {
    expect(loadEnv({ AI_PROVIDER: 'mock', OPENAI_API_KEY: 'sk-x' }).AI_PROVIDER).toBe('mock');
  });

  it('accepts openai with a key', () => {
    expect(loadEnv({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-x', OPENAI_MODEL: 'gpt-x', OPENAI_TIMEOUT_MS: '8000' })).toMatchObject({
      AI_PROVIDER: 'openai',
      OPENAI_MODEL: 'gpt-x',
      OPENAI_TIMEOUT_MS: 8000
    });
  });

  it.each([{ AI_PROVIDER: 'openai' }, { AI_PROVIDER: 'openai', OPENAI_API_KEY: '' }])(
    'fails clearly when openai is selected without a key (%o)',
    (source) => {
      expect(() => loadEnv(source)).toThrow(/OPENAI_API_KEY: is required when AI_PROVIDER=openai/);
    }
  );

  it('rejects an unknown provider instead of silently falling back', () => {
    expect(() => loadEnv({ AI_PROVIDER: 'anthropic' })).toThrow(/AI_PROVIDER/);
  });

  it.each(['abc', '0', '999999'])('rejects an invalid timeout (%s)', (value) => {
    expect(() => loadEnv({ OPENAI_TIMEOUT_MS: value })).toThrow(/OPENAI_TIMEOUT_MS/);
  });

  it('never includes configured values in the error message', () => {
    let message = '';
    try {
      loadEnv({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-super-secret', OPENAI_TIMEOUT_MS: 'not-a-number' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/OPENAI_TIMEOUT_MS/);
    expect(message).not.toContain('sk-super-secret');
    expect(message).not.toContain('not-a-number');
  });
});
