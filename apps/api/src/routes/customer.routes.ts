import { Router } from 'express';
import mongoose from 'mongoose';
import { Customer } from '../models/Customer.js';
import { Order } from '../models/Order.js';

export const customerRouter = Router();

customerRouter.get('/', async (_req, res) => {
  res.json(await Customer.find().sort({ name: 1 }).lean());
});

customerRouter.get('/:id/orders', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(400).json({ message: 'Invalid customer id' });
    return;
  }
  if (!(await Customer.exists({ _id: req.params.id }))) {
    res.status(404).json({ message: 'Customer not found' });
    return;
  }
  res.json(await Order.find({ customerId: req.params.id }).sort({ orderedAt: -1 }).lean());
});
