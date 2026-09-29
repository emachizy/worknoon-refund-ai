import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ClassificationError } from '../services/ai.service.js';

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    return res.status(400).json({ message: 'Validation failed', issues: error.issues });
  }

  // No refund decision is made without classification. Details were already logged by the classifier;
  // the customer gets a generic message with no provider information.
  if (error instanceof ClassificationError) {
    return res.status(503).json({ message: 'We could not assess your request right now. Please try again shortly.' });
  }

  console.error(error);
  return res.status(500).json({ message: 'Internal server error' });
}
