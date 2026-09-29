import type { Request, Response } from 'express';
import { RefundRequest } from '../models/RefundRequest.js';
import { submitRefundRequest, type RefundWorkflowDeps, type StoredRefundRequest } from '../services/refundWorkflow.js';
import { toAdminDetail, toAdminSummary, toCustomerResponse } from '../services/refundViews.js';
import {
  createRefundSchema,
  idempotencyKeySchema,
  listRefundsQuerySchema,
  objectIdSchema
} from '../validators/refund.validator.js';

export function createRefundController(deps: RefundWorkflowDeps) {
  return {
    async create(req: Request, res: Response) {
      const input = createRefundSchema.parse(req.body);
      const idempotencyKey = idempotencyKeySchema.parse(req.get('Idempotency-Key'));

      const { record, replayed } = await submitRefundRequest(input, idempotencyKey, deps);
      if (replayed) res.set('Idempotent-Replayed', 'true');
      res.status(replayed ? 200 : 201).json(toCustomerResponse(record));
    },

    async list(req: Request, res: Response) {
      const query = listRefundsQuerySchema.parse(req.query);
      const filter: Record<string, unknown> = {};
      if (query.decision) filter.decision = query.decision;
      if (query.humanReviewRequired !== undefined) filter.humanReviewRequired = query.humanReviewRequired;

      const records = await RefundRequest.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(query.limit)
        .lean<StoredRefundRequest[]>();
      // Envelope leaves room for pagination fields (e.g. a cursor) without breaking clients.
      res.json({ items: records.map(toAdminSummary), limit: query.limit });
    },

    async get(req: Request, res: Response) {
      const parsed = objectIdSchema.safeParse(req.params.id);
      if (!parsed.success) {
        res.status(400).json({ message: 'Invalid refund request id' });
        return;
      }
      const record = await RefundRequest.findById(parsed.data).lean<StoredRefundRequest>();
      if (!record) {
        res.status(404).json({ message: 'Refund request not found' });
        return;
      }
      res.json(toAdminDetail(record));
    }
  };
}
