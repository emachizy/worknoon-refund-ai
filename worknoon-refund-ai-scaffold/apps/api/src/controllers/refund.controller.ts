import type { Request, Response } from 'express';
import { Customer } from '../models/Customer.js';
import { Order } from '../models/Order.js';
import { RefundRequest } from '../models/RefundRequest.js';
import { createRefundSchema } from '../validators/refund.validator.js';
import { classifyRefundMessage } from '../services/ai.service.js';
import { evaluateRefundPolicy } from '../services/policy.service.js';

export async function createRefund(req: Request, res: Response) {
  const input = createRefundSchema.parse(req.body);
  const customer = await Customer.findById(input.customerId);
  const order = await Order.findOne({ orderNumber: input.orderNumber });

  const classification = await classifyRefundMessage(input.message);
  const ownsOrder = Boolean(customer && order && String(order.customerId) === String(customer._id));
  const daysSinceOrder = order
    ? Math.floor((Date.now() - order.orderedAt.getTime()) / (1000 * 60 * 60 * 24))
    : Number.POSITIVE_INFINITY;

  const policy = evaluateRefundPolicy({
    orderExists: Boolean(order),
    ownsOrder,
    isFinalSale: order?.isFinalSale ?? false,
    daysSinceOrder,
    refundAmount: order?.total ?? 0,
    classification
  });

  if (!customer || !order || !ownsOrder) {
    return res.status(200).json({
      decision: policy.decision,
      humanReviewRequired: policy.humanReviewRequired,
      explanation: policy.explanation,
      matchedRules: policy.matchedRules
    });
  }

  const refund = await RefundRequest.create({
    customerId: customer._id,
    orderId: order._id,
    orderNumber: order.orderNumber,
    message: input.message,
    amount: order.total,
    ...policy,
    aiClassification: classification
  });

  return res.status(201).json(refund);
}

export async function listRefunds(_req: Request, res: Response) {
  const refunds = await RefundRequest.find().sort({ createdAt: -1 }).limit(100).lean();
  res.json(refunds);
}

export async function getRefund(req: Request, res: Response) {
  const refund = await RefundRequest.findById(req.params.id).lean();
  if (!refund) return res.status(404).json({ message: 'Refund request not found' });
  res.json(refund);
}
