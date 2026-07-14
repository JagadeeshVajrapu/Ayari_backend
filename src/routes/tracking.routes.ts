import { Router } from 'express';
import { trackingController } from '../controllers/tracking.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { trackingHistoryPaginationSchema } from '../validators/tracking.validator';

const trackingRouter = Router();

trackingRouter.use(authenticate);

trackingRouter.get('/orders/:orderId/tracking', trackingController.getOrderTracking);

trackingRouter.get(
  '/orders/:orderId/status-history',
  validate(trackingHistoryPaginationSchema, 'query'),
  trackingController.getOrderStatusHistory,
);

trackingRouter.get(
  '/shipments/:shipmentId/history',
  validate(trackingHistoryPaginationSchema, 'query'),
  trackingController.getShipmentHistory,
);

export default trackingRouter;
