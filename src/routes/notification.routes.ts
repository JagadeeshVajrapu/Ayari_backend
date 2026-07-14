import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { notificationController } from '../controllers/notification.controller';
import { authenticate, authorize } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import {
  broadcastNotificationSchema,
  notificationPaginationSchema,
} from '../validators/notification.validator';

const router = Router();
router.use(authenticate);

router.get('/', validate(notificationPaginationSchema, 'query'), notificationController.list);
router.get('/unread-count', notificationController.unreadCount);
router.patch('/read-all', notificationController.markAllAsRead);
router.patch('/:id/read', notificationController.markAsRead);
router.delete('/:id', notificationController.delete);

export const adminNotificationRouter = Router();
adminNotificationRouter.use(authenticate, authorize(UserRole.ADMIN));
adminNotificationRouter.get('/dashboard', notificationController.adminDashboard);
adminNotificationRouter.post(
  '/broadcast',
  validate(broadcastNotificationSchema),
  notificationController.broadcast,
);

export default router;
