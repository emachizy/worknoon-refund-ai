import { Router } from 'express';
import { createRefund, getRefund, listRefunds } from '../controllers/refund.controller.js';

export const refundRouter = Router();
refundRouter.post('/', createRefund);
refundRouter.get('/', listRefunds);
refundRouter.get('/:id', getRefund);
