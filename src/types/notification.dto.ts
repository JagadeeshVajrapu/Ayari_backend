import {
  NotificationCategory,
  NotificationPriority,
  NotificationRecordStatus,
  NotificationType,
} from '@prisma/client';

export interface NotificationDto {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  category: NotificationCategory;
  status: NotificationRecordStatus;
  priority: NotificationPriority;
  icon: string | null;
  actionUrl: string | null;
  metadata: Record<string, unknown> | null;
  isRead: boolean;
  readAt: string | null;
  orderId: string | null;
  shipmentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationListDto {
  items: NotificationDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  unreadCount: number;
}

export interface NotificationUnreadCountDto {
  unreadCount: number;
}

export interface AdminNotificationDashboardDto {
  total: number;
  unread: number;
  sentToday: number;
  emailSuccess: number;
  emailFailed: number;
  topTypes: Array<{ type: string; count: number }>;
}

export interface NotificationRealtimeDto {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  icon: string | null;
  actionUrl: string | null;
  orderId: string | null;
  shipmentId: string | null;
  isRead: boolean;
  createdAt: string;
  unreadCount: number;
}
