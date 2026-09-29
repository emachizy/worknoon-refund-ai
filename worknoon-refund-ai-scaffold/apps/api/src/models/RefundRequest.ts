import mongoose from 'mongoose';

const refundRequestSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    orderNumber: { type: String, required: true },
    message: { type: String, required: true },
    amount: { type: Number, required: true },
    decision: { type: String, enum: ['APPROVED', 'DENIED', 'ESCALATED'], required: true },
    humanReviewRequired: { type: Boolean, required: true },
    reasonCode: { type: String, required: true },
    explanation: { type: String, required: true },
    matchedRules: [{ type: String }],
    aiClassification: { type: mongoose.Schema.Types.Mixed, required: true }
  },
  { timestamps: true }
);

export const RefundRequest = mongoose.model('RefundRequest', refundRequestSchema);
