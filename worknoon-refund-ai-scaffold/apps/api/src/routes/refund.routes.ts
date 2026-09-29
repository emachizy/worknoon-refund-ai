import { Router } from 'express';
import { createRefundController } from '../controllers/refund.controller.js';
import type { RefundWorkflowDeps } from '../services/refundWorkflow.js';

export function createRefundRouter(deps: RefundWorkflowDeps) {
  const controller = createRefundController(deps);
  const router = Router();
  router.post('/', controller.create);
  router.get('/', controller.list);
  router.get('/:id', controller.get);
  return router;
}
