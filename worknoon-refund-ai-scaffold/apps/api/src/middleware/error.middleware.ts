import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    return res.status(400).json({ message: 'Validation failed', issues: error.issues });
  }

  console.error(error);
  return res.status(500).json({ message: 'Internal server error' });
}
