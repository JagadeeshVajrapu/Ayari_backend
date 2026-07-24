import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { shipmentController } from '../controllers/shipment.controller';
import { courierController } from '../controllers/courier.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  addShipmentNoteSchema,
  addShipmentTrackingEventSchema,
  adminActionSchema,
  assignCourierSchema,
  createCourierPartnerSchema,
  shipmentPaginationSchema,
  updateCourierPartnerSchema,
  updateShipmentSchema,
  updateShipmentStatusSchema,
} from '../validators/shipment.validator';

const adminOnly = [authenticate, authorize(UserRole.ADMIN)] as const;

export const adminShipmentRouter = Router();

adminShipmentRouter.get('/dashboard', ...adminOnly, shipmentController.getDashboard);

adminShipmentRouter.get(
  '/',
  ...adminOnly,
  validate(shipmentPaginationSchema, 'query'),
  shipmentController.listShipments,
);

adminShipmentRouter.get('/courier-partners', ...adminOnly, shipmentController.listCourierPartners);

adminShipmentRouter.post(
  '/courier-partners',
  ...adminOnly,
  validate(createCourierPartnerSchema),
  shipmentController.createCourierPartner,
);

adminShipmentRouter.patch(
  '/courier-partners/:id',
  ...adminOnly,
  validate(updateCourierPartnerSchema),
  shipmentController.updateCourierPartner,
);

adminShipmentRouter.get('/order/:orderId', ...adminOnly, shipmentController.getShipmentByOrder);

adminShipmentRouter.get('/:id', ...adminOnly, shipmentController.getAdminShipmentDetail);

adminShipmentRouter.patch(
  '/:id',
  ...adminOnly,
  validate(updateShipmentSchema),
  shipmentController.updateShipment,
);

adminShipmentRouter.patch(
  '/:id/status',
  ...adminOnly,
  validate(updateShipmentStatusSchema),
  shipmentController.updateShipmentStatus,
);

adminShipmentRouter.post(
  '/:id/actions',
  ...adminOnly,
  validate(adminActionSchema),
  shipmentController.performAdminAction,
);

adminShipmentRouter.post(
  '/:id/notes',
  ...adminOnly,
  validate(addShipmentNoteSchema),
  shipmentController.addShipmentNote,
);

adminShipmentRouter.post(
  '/:id/assign-courier',
  ...adminOnly,
  validate(assignCourierSchema),
  shipmentController.assignCourier,
);

adminShipmentRouter.post(
  '/:id/generate-tracking',
  ...adminOnly,
  shipmentController.generateTrackingNumber,
);

adminShipmentRouter.post(
  '/:id/tracking-events',
  ...adminOnly,
  validate(addShipmentTrackingEventSchema),
  shipmentController.addTrackingEvent,
);

adminShipmentRouter.post('/:id/shiprocket/sync', ...adminOnly, shipmentController.syncShiprocket);
adminShipmentRouter.post('/:id/shiprocket/pickup', ...adminOnly, shipmentController.requestPickup);
adminShipmentRouter.post('/:id/shiprocket/label', ...adminOnly, shipmentController.generateLabel);
adminShipmentRouter.post(
  '/:id/shiprocket/refresh-tracking',
  ...adminOnly,
  shipmentController.refreshShiprocketTracking,
);
adminShipmentRouter.post(
  '/:id/shiprocket/cancel',
  ...adminOnly,
  shipmentController.cancelShiprocketShipment,
);
adminShipmentRouter.post('/:id/shiprocket/return', ...adminOnly, shipmentController.createReturn);
adminShipmentRouter.get('/:id/invoice', ...adminOnly, shipmentController.getInvoiceHtml);

export const adminCourierRouter = Router();
adminCourierRouter.use(...adminOnly);

adminCourierRouter.get('/', courierController.list);
adminCourierRouter.post('/', validate(createCourierPartnerSchema), courierController.create);
adminCourierRouter.put('/:id', validate(updateCourierPartnerSchema), courierController.update);
adminCourierRouter.delete('/:id', courierController.delete);

export const customerShipmentRouter = Router();
customerShipmentRouter.use(authenticate);

customerShipmentRouter.get('/orders/:orderId/shipment', shipmentController.getMyOrderShipment);
customerShipmentRouter.get('/orders/:orderId/invoice', shipmentController.getCustomerInvoiceHtml);

export const publicShipmentRouter = Router();

publicShipmentRouter.get('/number/:shipmentNumber', shipmentController.trackByShipmentNumber);
publicShipmentRouter.get('/tracking/:trackingNumber', shipmentController.trackByTrackingNumber);
// Shiprocket webhook is mounted at /shipments/shiprocket/webhook in routes/index.ts
// (and app.ts) so it is not accidentally covered by JWT-protected routers.
