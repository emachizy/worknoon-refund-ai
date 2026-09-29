import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { customerRouter } from './routes/customer.routes.js';
import { createRefundRouter } from './routes/refund.routes.js';
import { errorHandler } from './middleware/error.middleware.js';
import type { RefundClassifier } from './services/ai/index.js';

export interface AppDependencies {
  classifier: RefundClassifier;
  now?: () => Date;
}

export function createApp({ classifier, now = () => new Date() }: AppDependencies) {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CLIENT_ORIGIN }));
  app.use(express.json({ limit: '20kb' }));
  app.use(pinoHttp({ logger }));
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 120 }));

  app.get('/api/health', (_req, res) => {
    const dbConnected = mongoose.connection.readyState === 1;
    res.status(dbConnected ? 200 : 503).json({ ok: dbConnected, db: dbConnected ? 'connected' : 'disconnected' });
  });
  app.use('/api/customers', customerRouter);
  app.use('/api/refunds', createRefundRouter({ classifier, now, logger: logger.child({ component: 'refund-workflow' }) }));
  app.use(errorHandler);

  return app;
}
