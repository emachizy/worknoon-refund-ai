import type { Request, Response } from 'express';
import { Customer } from '../models/Customer.js';
import { Order } from '../models/Order.js';
import { RefundRequest } from '../models/RefundRequest.js';
import { createRefundSchema } from '../validators/refund.validator.js';
import { classifyRefundMessage } from '../services/ai.service.js';
import { evaluateRefundPolicy } from '../services/policy.service.js';
import { explainPolicyDecision } from '../services/policyExplanation.js';

export async function createRefund(req: Request, res: Response) {
  const input = createRefundSchema.parse(req.body);
  const customer = await Customer.findById(input.customerId);
  const order = await Order.findOne({ orderNumber: input.orderNumber });

  const classification = await classifyRefundMessage(input.message);

  const policy = evaluateRefundPolicy({
    requestingCustomerId: customer ? String(customer._id) : null,
    order: order
      ? {
          customerId: String(order.customerId),
          total: order.total,
          orderedAt: order.orderedAt,
          isFinalSale: order.isFinalSale ?? false
        }
      : null,
    signals: classification,
    evaluatedAt: new Date()
  });
  const explanation = explainPolicyDecision(policy.reasonCode);

  if (!customer || !order || policy.reasonCode === 'ORDER_CUSTOMER_MISMATCH') {
    return res.status(200).json({
      decision: policy.decision,
      humanReviewRequired: policy.humanReviewRequired,
      explanation,
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
    explanation,
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
