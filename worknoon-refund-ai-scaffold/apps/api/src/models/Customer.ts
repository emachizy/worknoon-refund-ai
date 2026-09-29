import mongoose from 'mongoose';

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    tier: { type: String, enum: ['standard', 'premium'], default: 'standard' }
  },
  { timestamps: true }
);

export const Customer = mongoose.model('Customer', customerSchema);
