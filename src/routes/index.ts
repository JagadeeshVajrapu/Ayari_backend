import { Router } from 'express';
import authRoutes from './auth.routes';
import adminRoutes, { productRouter, userRouter } from './admin.routes';
import categoryRoutes from './category.routes';
import {
  adminShipmentRouter,
  adminCourierRouter,
  customerShipmentRouter,
  publicShipmentRouter,
} from './shipment.routes';
import trackingRoutes from './tracking.routes';
import notificationRoutes, { adminNotificationRouter } from './notification.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/admin/notifications', adminNotificationRouter);
router.use('/admin/shipments', adminShipmentRouter);
router.use('/admin/couriers', adminCourierRouter);
router.use('/notifications', notificationRoutes);
router.use('/products', productRouter);
router.use('/categories', categoryRoutes);
router.use('/users', userRouter);
router.use('/users/me', customerShipmentRouter);
router.use('/shipments/track', publicShipmentRouter);
router.use('/', trackingRoutes);

router.get('/health', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
  res.json({
    success: true,
    message: 'API is running',
    data: { status: 'healthy' },
  });
});

export default router;
