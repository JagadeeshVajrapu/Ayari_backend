import {
  NotificationCategory,
  NotificationChannel,
  NotificationPriority,
  NotificationRecordStatus,
  NotificationStatus,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { prisma } from '../database/prisma';

type TransactionClient = Prisma.TransactionClient;

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export class NotificationRepository {
  async create(
    data: {
      userId: string;
      title: string;
      message: string;
      type: NotificationType;
      category: NotificationCategory;
      priority?: NotificationPriority;
      icon?: string;
      actionUrl?: string;
      metadata?: Record<string, unknown>;
      orderId?: string;
      shipmentId?: string;
    },
    tx?: TransactionClient,
  ) {
    const client = tx ?? prisma;
    return client.notification.create({
      data: {
        userId: data.userId,
        title: data.title,
        message: data.message,
        type: data.type,
        category: data.category,
        priority: data.priority ?? NotificationPriority.NORMAL,
        icon: data.icon,
        actionUrl: data.actionUrl,
        metadata: data.metadata as Prisma.InputJsonValue,
        orderId: data.orderId,
        shipmentId: data.shipmentId,
        status: NotificationRecordStatus.ACTIVE,
      },
    });
  }

  async enqueue(
    data: {
      userId: string;
      orderId?: string;
      shipmentId?: string;
      type: NotificationType;
      title: string;
      message: string;
      channel?: NotificationChannel;
      metadata?: Record<string, unknown>;
    },
    tx?: TransactionClient,
  ) {
    const client = tx ?? prisma;
    return client.notificationQueue.create({
      data: {
        userId: data.userId,
        orderId: data.orderId,
        shipmentId: data.shipmentId,
        type: data.type,
        channel: data.channel ?? NotificationChannel.EMAIL,
        title: data.title,
        message: data.message,
        metadata: data.metadata as Prisma.InputJsonValue,
        status: NotificationStatus.PENDING,
      },
    });
  }

  async findByIdForUser(id: string, userId: string) {
    return prisma.notification.findFirst({
      where: { id, userId, status: NotificationRecordStatus.ACTIVE },
    });
  }

  async findManyForUser(
    userId: string,
    params: {
      page: number;
      limit: number;
      search?: string;
      category?: NotificationCategory;
      unreadOnly?: boolean;
    },
  ) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      status: NotificationRecordStatus.ACTIVE,
      ...(params.category ? { category: params.category } : {}),
      ...(params.unreadOnly ? { isRead: false } : {}),
      ...(params.search
        ? {
            OR: [
              { title: { contains: params.search, mode: 'insensitive' } },
              { message: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { userId, status: NotificationRecordStatus.ACTIVE, isRead: false },
      }),
    ]);

    return { items, total, unreadCount };
  }

  async getUnreadCount(userId: string) {
    return prisma.notification.count({
      where: { userId, status: NotificationRecordStatus.ACTIVE, isRead: false },
    });
  }

  async markAsRead(id: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, isRead: false, status: NotificationRecordStatus.ACTIVE },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async deleteForUser(id: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id, userId },
      data: { status: NotificationRecordStatus.ARCHIVED },
    });
  }

  async listPendingQueue(limit = 50) {
    return prisma.notificationQueue.findMany({
      where: { status: NotificationStatus.PENDING },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async listFailedQueue(limit = 20) {
    return prisma.notificationQueue.findMany({
      where: { status: NotificationStatus.FAILED, retryCount: { lt: 5 } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async markQueueSent(id: string) {
    return prisma.notificationQueue.update({
      where: { id },
      data: { status: NotificationStatus.SENT, sentAt: new Date(), lastError: null },
    });
  }

  async markQueueFailed(id: string, error: string) {
    return prisma.notificationQueue.update({
      where: { id },
      data: {
        status: NotificationStatus.FAILED,
        retryCount: { increment: 1 },
        lastError: error.slice(0, 500),
      },
    });
  }

  async resetQueueForRetry(id: string) {
    return prisma.notificationQueue.update({
      where: { id },
      data: { status: NotificationStatus.PENDING },
    });
  }

  async getAdminDashboardStats() {
    const today = startOfToday();

    const [total, unread, sentToday, emailSuccess, emailFailed, typeGroups] = await Promise.all([
      prisma.notification.count(),
      prisma.notification.count({ where: { isRead: false, status: NotificationRecordStatus.ACTIVE } }),
      prisma.notification.count({ where: { createdAt: { gte: today } } }),
      prisma.notificationQueue.count({
        where: { channel: NotificationChannel.EMAIL, status: NotificationStatus.SENT, sentAt: { gte: today } },
      }),
      prisma.notificationQueue.count({
        where: { channel: NotificationChannel.EMAIL, status: NotificationStatus.FAILED },
      }),
      prisma.notification.groupBy({
        by: ['type'],
        _count: { type: true },
        orderBy: { _count: { type: 'desc' } },
        take: 8,
      }),
    ]);

    return {
      total,
      unread,
      sentToday,
      emailSuccess,
      emailFailed,
      topTypes: typeGroups.map((g) => ({ type: g.type, count: g._count.type })),
    };
  }
}

export const notificationRepository = new NotificationRepository();
