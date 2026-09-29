import mongoose from 'mongoose';
import { z } from 'zod';

/**
 * Request validation (HTTP 400) is about whether the payload is well-formed enough
 * to identify a refund attempt at all. A syntactically valid customer id or order
 * number that does not exist is NOT a validation error: it is a legitimate attempt
 * that the policy engine denies, and it is persisted for audit.
 */
export const objectIdSchema = z
  .string()
  .trim()
  .refine((value) => /^[0-9a-f]{24}$/i.test(value) && mongoose.isValidObjectId(value), 'must be a 24-character hex id');

export const createRefundSchema = z.object({
  customerId: objectIdSchema,
  orderNumber: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, 'may contain only letters, digits and hyphens'),
  message: z.string().trim().min(5).max(2000)
});
export type CreateRefundInput = z.infer<typeof createRefundSchema>;

/** Optional client-generated key (e.g. a UUID) that makes retries and double submissions return the original result. */
export const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'may contain only letters, digits, underscores and hyphens')
  .optional();

export const listRefundsQuerySchema = z.object({
  decision: z.enum(['APPROVED', 'DENIED', 'ESCALATED']).optional(),
  humanReviewRequired: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});
export type ListRefundsQuery = z.infer<typeof listRefundsQuerySchema>;
