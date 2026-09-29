import { z } from 'zod';

export const createRefundSchema = z.object({
  customerId: z.string().min(1),
  orderNumber: z.string().min(3).max(40),
  message: z.string().min(5).max(2000)
});
