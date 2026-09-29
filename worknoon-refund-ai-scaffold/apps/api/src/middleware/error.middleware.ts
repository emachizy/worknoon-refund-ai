import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { IdempotencyConflictError } from '../services/refundWorkflow.js';

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: 'Validation failed',
      issues: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    });
  }

  // Body-parser failures (malformed JSON, oversized body) are client errors, not server errors.
  const parserType = (error as { type?: unknown } | null)?.type;
  if (parserType === 'entity.parse.failed') return res.status(400).json({ message: 'Malformed JSON body' });
  if (parserType === 'entity.too.large') return res.status(413).json({ message: 'Request body too large' });

  if (error instanceof IdempotencyConflictError) {
    return res.status(409).json({ message: error.message });
  }

  // Unexpected: log the error server-side (no request body), return a generic message.
  logger.error({ err: error, method: req.method, path: req.path }, 'unhandled request error');
  return res.status(500).json({ message: 'Internal server error' });
}
