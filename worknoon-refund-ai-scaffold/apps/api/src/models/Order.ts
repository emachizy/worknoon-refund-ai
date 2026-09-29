import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    itemName: { type: String, required: true },
    total: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    orderedAt: { type: Date, required: true },
    isFinalSale: { type: Boolean, default: false },
    status: { type: String, enum: ['delivered', 'shipped', 'cancelled'], default: 'delivered' }
  },
  { timestamps: true }
);

export const Order = mongoose.model('Order', orderSchema);
