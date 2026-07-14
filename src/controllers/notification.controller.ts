import { Request, Response } from 'express';
import { notificationService } from '../services/notification.service';
import { asyncHandler } from '../utils/asyncHandler.util';
import { sendSuccess } from '../utils/apiResponse.util';
import type {
  BroadcastNotificationInput,
  NotificationPaginationInput,
} from '../validators/notification.validator';

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

export class NotificationController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const data = await notificationService.listForUser(
      req.user!.id,
      req.query as unknown as NotificationPaginationInput,
    );
    sendSuccess(res, 'Notifications retrieved', data);
  });

  unreadCount = asyncHandler(async (req: Request, res: Response) => {
    const data = await notificationService.getUnreadCount(req.user!.id);
    sendSuccess(res, 'Unread count retrieved', data);
  });

  markAsRead = asyncHandler(async (req: Request, res: Response) => {
    const notification = await notificationService.markAsRead(paramId(req), req.user!.id);
    sendSuccess(res, 'Notification marked as read', { notification });
  });

  markAllAsRead = asyncHandler(async (req: Request, res: Response) => {
    const data = await notificationService.markAllAsRead(req.user!.id);
    sendSuccess(res, 'All notifications marked as read', data);
  });

  delete = asyncHandler(async (req: Request, res: Response) => {
    const data = await notificationService.deleteNotification(paramId(req), req.user!.id);
    sendSuccess(res, 'Notification deleted', data);
  });

  adminDashboard = asyncHandler(async (_req: Request, res: Response) => {
    const stats = await notificationService.getAdminDashboard();
    sendSuccess(res, 'Notification dashboard retrieved', { stats });
  });

  broadcast = asyncHandler(async (req: Request, res: Response) => {
    const data = await notificationService.broadcast(req.body as BroadcastNotificationInput);
    sendSuccess(res, 'Broadcast sent', data);
  });
}

export const notificationController = new NotificationController();
