import { pino } from 'pino';
import { env } from './env.js';

// Shared structured logger. Never pass API keys, raw provider errors, prompts, or full customer messages to it.
export const logger = pino({ level: env.NODE_ENV === 'test' ? 'silent' : 'info' });
