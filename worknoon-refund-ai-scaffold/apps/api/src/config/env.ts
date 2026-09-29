import 'dotenv/config';
import { z } from 'zod';

// Docker Compose passes unset variables through as empty strings; treat those as "not set".
const optionalString = z.preprocess((value) => (value === '' ? undefined : value), z.string().optional());
const withDefault = <T extends z.ZodTypeAny>(inner: T) => z.preprocess((value) => (value === '' ? undefined : value), inner);

const schema = z
  .object({
    NODE_ENV: withDefault(z.enum(['development', 'test', 'production']).default('development')),
    PORT: withDefault(z.coerce.number().default(4000)),
    MONGO_URI: withDefault(z.string().min(1).default('mongodb://localhost:27017/refund_ai')),
    CLIENT_ORIGIN: withDefault(z.string().default('http://localhost:5173')),
    // Unset means mock, so the app runs without credentials. Choosing openai explicitly requires a key.
    AI_PROVIDER: withDefault(z.enum(['openai', 'mock']).default('mock')),
    OPENAI_API_KEY: optionalString,
    OPENAI_MODEL: withDefault(z.string().min(1).default('gpt-5-mini')),
    OPENAI_TIMEOUT_MS: withDefault(z.coerce.number().int().min(1000).max(60_000).default(15_000))
  })
  .superRefine((config, ctx) => {
    if (config.AI_PROVIDER === 'openai' && !config.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OPENAI_API_KEY'],
        message: 'is required when AI_PROVIDER=openai (set AI_PROVIDER=mock to run without a key)'
      });
    }
  });

export type Env = z.infer<typeof schema>;

/** Validates configuration. The error lists variable names and problems only, never values. */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}

export const env = loadEnv(process.env);
