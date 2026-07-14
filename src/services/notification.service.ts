import {
  NotificationChannel,
  NotificationType,
  Prisma,
  ShipmentStatus,
} from '@prisma/client';
import { prisma } from '../database/prisma';
import { notificationRepository } from '../repositories/notification.repository';
import { getEventDefinition } from '../constants/notification.events';
import { emailTemplates } from '../templates/email/templates';
import { emailService } from './email.service';
import { realtimeService } from './realtime.service';
import { NotFoundError } from '../utils/appError.util';
import type {
  AdminNotificationDashboardDto,
  NotificationDto,
  NotificationListDto,
} from '../types/notification.dto';
import type {
  BroadcastNotificationInput,
  NotificationPaginationInput,
} from '../validators/notification.validator';
import { env } from '../config/env';

type TransactionClient = Prisma.TransactionClient;

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  message: string;
  title?: string;
  orderId?: string;
  shipmentId?: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  sendEmail?: boolean;
  skipRealtime?: boolean;
}

function serializeNotification(record: {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  category: NotificationDto['category'];
  status: NotificationDto['status'];
  priority: NotificationDto['priority'];
  icon: string | null;
  actionUrl: string | null;
  metadata: unknown;
  isRead: boolean;
  readAt: Date | null;
  orderId: string | null;
  shipmentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): NotificationDto {
  return {
    id: record.id,
    userId: record.userId,
    title: record.title,
    message: record.message,
    type: record.type,
    category: record.category,
    status: record.status,
    priority: record.priority,
    icon: record.icon,
    actionUrl: record.actionUrl,
    metadata: (record.metadata as Record<string, unknown>) ?? null,
    isRead: record.isRead,
    readAt: record.readAt?.toISOString() ?? null,
    orderId: record.orderId,
    shipmentId: record.shipmentId,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

const SHIPMENT_STATUS_TYPE_MAP: Partial<Record<ShipmentStatus, NotificationType>> = {
  CONFIRMED: NotificationType.SHIPMENT_CONFIRMED,
  PACKING: NotificationType.PACKING_STARTED,
  PACKED: NotificationType.PACKED,
  PICKED_UP: NotificationType.PICKED_UP,
  IN_TRANSIT: NotificationType.IN_TRANSIT,
  REACHED_HUB: NotificationType.REACHED_HUB,
  OUT_FOR_DELIVERY: NotificationType.OUT_FOR_DELIVERY,
  DELIVERED: NotificationType.DELIVERED,
  CANCELLED: NotificationType.CANCELLED,
  RETURNED: NotificationType.RETURNED,
};

export class NotificationService {
  async create(input: CreateNotificationInput, tx?: TransactionClient) {
    const def = getEventDefinition(input.type);
    const title = input.title ?? def.title;
    const actionUrl =
      input.actionUrl ??
      (input.orderId ? `${env.FRONTEND_URL}/orders/${input.orderId}/tracking` : undefined);

    const notification = await notificationRepository.create(
      {
        userId: input.userId,
        title,
        message: input.message,
        type: input.type,
        category: def.category,
        priority: def.priority,
        icon: def.icon,
        actionUrl,
        metadata: input.metadata,
        orderId: input.orderId,
        shipmentId: input.shipmentId,
      },
      tx,
    );

    if (!tx && (input.sendEmail ?? def.sendEmail)) {
      await notificationRepository.enqueue({
        userId: input.userId,
        orderId: input.orderId,
        shipmentId: input.shipmentId,
        type: input.type,
        channel: NotificationChannel.EMAIL,
        title,
        message: input.message,
        metadata: { ...input.metadata, notificationId: notification.id },
      });
    }

    if (!tx && !input.skipRealtime) {
      const unreadCount = await notificationRepository.getUnreadCount(input.userId);
      realtimeService.emitNotificationEvent(input.userId, serializeNotification(notification), unreadCount);
    }

    return notification;
  }

  async notifyShipmentStatus(
    params: {
      userId: string;
      orderId: string;
      shipmentId: string;
      orderNumber: string;
      status: ShipmentStatus;
      message?: string;
    },
    tx?: TransactionClient,
  ) {
    const type = SHIPMENT_STATUS_TYPE_MAP[params.status];
    if (!type) return null;

    const message =
      params.message ??
      `Your order ${params.orderNumber} status has been updated.`;

    if (tx) {
      return notificationRepository.create(
        {
          userId: params.userId,
          title: getEventDefinition(type).title,
          message,
          type,
          category: getEventDefinition(type).category,
          priority: getEventDefinition(type).priority,
          icon: getEventDefinition(type).icon,
          actionUrl: `${env.FRONTEND_URL}/orders/${params.orderId}/tracking`,
          metadata: { status: params.status, orderNumber: params.orderNumber },
          orderId: params.orderId,
          shipmentId: params.shipmentId,
        },
        tx,
      );
    }

    return this.create({
      userId: params.userId,
      type,
      message,
      orderId: params.orderId,
      shipmentId: params.shipmentId,
      metadata: { status: params.status, orderNumber: params.orderNumber },
    });
  }

  async notifyCourierAssigned(
    params: {
      userId: string;
      orderId: string;
      shipmentId: string;
      orderNumber: string;
      courierName: string;
      trackingNumber: string;
    },
    tx?: TransactionClient,
  ) {
    const message = `Courier ${params.courierName} assigned. Tracking: ${params.trackingNumber}`;

    if (tx) {
      return notificationRepository.create(
        {
          userId: params.userId,
          title: getEventDefinition(NotificationType.COURIER_ASSIGNED).title,
          message,
          type: NotificationType.COURIER_ASSIGNED,
          category: getEventDefinition(NotificationType.COURIER_ASSIGNED).category,
          icon: 'truck',
          orderId: params.orderId,
          shipmentId: params.shipmentId,
          metadata: params as unknown as Record<string, unknown>,
        },
        tx,
      );
    }

    return this.create({
      userId: params.userId,
      type: NotificationType.COURIER_ASSIGNED,
      message,
      orderId: params.orderId,
      shipmentId: params.shipmentId,
      metadata: params as unknown as Record<string, unknown>,
    });
  }

  async notifyRefund(
    params: {
      userId: string;
      orderId: string;
      shipmentId?: string;
      orderNumber: string;
      completed: boolean;
    },
    tx?: TransactionClient,
  ) {
    const type = params.completed
      ? NotificationType.REFUND_COMPLETED
      : NotificationType.REFUND_INITIATED;
    const message = params.completed
      ? `Refund completed for order ${params.orderNumber}`
      : `Refund initiated for order ${params.orderNumber}`;

    if (tx) {
      return notificationRepository.create(
        {
          userId: params.userId,
          title: getEventDefinition(type).title,
          message,
          type,
          category: getEventDefinition(type).category,
          orderId: params.orderId,
          shipmentId: params.shipmentId,
          metadata: { orderNumber: params.orderNumber },
        },
        tx,
      );
    }

    return this.create({
      userId: params.userId,
      type,
      message,
      orderId: params.orderId,
      shipmentId: params.shipmentId,
      metadata: { orderNumber: params.orderNumber },
    });
  }

  async emitAfterTransaction(
    notification: {
      id: string;
      userId: string;
      title: string;
      message: string;
      type: NotificationType;
      category: NotificationDto['category'];
      status: NotificationDto['status'];
      priority: NotificationDto['priority'];
      icon: string | null;
      actionUrl: string | null;
      metadata: unknown;
      isRead: boolean;
      readAt: Date | null;
      orderId: string | null;
      shipmentId: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    options?: { enqueueEmail?: boolean; orderNumber?: string },
  ) {
    const def = getEventDefinition(notification.type);

    if (options?.enqueueEmail ?? def.sendEmail) {
      await notificationRepository.enqueue({
        userId: notification.userId,
        orderId: notification.orderId ?? undefined,
        shipmentId: notification.shipmentId ?? undefined,
        type: notification.type,
        channel: NotificationChannel.EMAIL,
        title: notification.title,
        message: notification.message,
        metadata: {
          ...(notification.metadata as Record<string, unknown>),
          notificationId: notification.id,
          orderNumber: options?.orderNumber,
        },
      });
    }

    const unreadCount = await notificationRepository.getUnreadCount(notification.userId);
    realtimeService.emitNotificationEvent(
      notification.userId,
      serializeNotification(notification),
      unreadCount,
      options?.orderNumber ?? null,
    );
  }

  async listForUser(userId: string, params: NotificationPaginationInput): Promise<NotificationListDto> {
    const { items, total, unreadCount } = await notificationRepository.findManyForUser(userId, params);
    return {
      items: items.map(serializeNotification),
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
      unreadCount,
    };
  }

  async getUnreadCount(userId: string) {
    const unreadCount = await notificationRepository.getUnreadCount(userId);
    return { unreadCount };
  }

  async markAsRead(id: string, userId: string) {
    const existing = await notificationRepository.findByIdForUser(id, userId);
    if (!existing) throw new NotFoundError('Notification not found');

    await notificationRepository.markAsRead(id, userId);
    const unreadCount = await notificationRepository.getUnreadCount(userId);
    const updated = await notificationRepository.findByIdForUser(id, userId);

    if (updated) {
      realtimeService.emitNotificationRead(userId, serializeNotification(updated), unreadCount);
    }

    return updated ? serializeNotification(updated) : null;
  }

  async markAllAsRead(userId: string) {
    await notificationRepository.markAllAsRead(userId);
    const unreadCount = await notificationRepository.getUnreadCount(userId);
    realtimeService.emitNotificationUpdated(userId, { unreadCount });
    return { unreadCount };
  }

  async deleteNotification(id: string, userId: string) {
    const existing = await notificationRepository.findByIdForUser(id, userId);
    if (!existing) throw new NotFoundError('Notification not found');

    await notificationRepository.deleteForUser(id, userId);
    const unreadCount = await notificationRepository.getUnreadCount(userId);
    realtimeService.emitNotificationDeleted(userId, id, unreadCount);
    return { success: true };
  }

  async getAdminDashboard(): Promise<AdminNotificationDashboardDto> {
    return notificationRepository.getAdminDashboardStats();
  }

  async broadcast(input: BroadcastNotificationInput) {
    const users = input.userIds?.length
      ? await prisma.user.findMany({ where: { id: { in: input.userIds }, isActive: true } })
      : await prisma.user.findMany({ where: { isActive: true, role: 'CUSTOMER' } });

    const results = await Promise.all(
      users.map((user) =>
        this.create({
          userId: user.id,
          type: NotificationType.SYSTEM_BROADCAST,
          title: input.title,
          message: input.message,
          actionUrl: input.actionUrl,
        }),
      ),
    );

    return { sent: results.length };
  }

  async processEmailQueue() {
    const [pending, failed] = await Promise.all([
      notificationRepository.listPendingQueue(30),
      notificationRepository.listFailedQueue(10),
    ]);

    const items = [...pending, ...failed];

    for (const item of items) {
      if (item.channel !== NotificationChannel.EMAIL) {
        await notificationRepository.markQueueSent(item.id);
        continue;
      }

      try {
        const user = await prisma.user.findUnique({ where: { id: item.userId } });
        if (!user) {
          await notificationRepository.markQueueFailed(item.id, 'User not found');
          continue;
        }

        const meta = (item.metadata as Record<string, unknown>) ?? {};
        const orderNumber = String(meta.orderNumber ?? '');
        const amount = String(meta.amount ?? '');
        const email = await this.buildEmailForType(user.firstName, item.type, orderNumber, amount, item.message);

        await emailService.sendRaw(user.email, email.subject, email.text, email.html);
        await notificationRepository.markQueueSent(item.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Notification queue item ${item.id} failed:`, message);
        await notificationRepository.markQueueFailed(item.id, message);
      }
    }
  }

  private async buildEmailForType(
    firstName: string,
    type: NotificationType,
    orderNumber: string,
    amount: string,
    message: string,
  ) {
    switch (type) {
      case NotificationType.USER_REGISTERED:
        return emailTemplates.welcome(firstName);
      case NotificationType.ORDER_CREATED:
      case NotificationType.ORDER_CONFIRMED:
        return emailTemplates.orderConfirmation(firstName, orderNumber, amount || '—');
      case NotificationType.PAYMENT_SUCCESSFUL:
        return emailTemplates.paymentSuccessful(firstName, orderNumber, amount || '—');
      case NotificationType.PAYMENT_FAILED:
        return emailTemplates.paymentFailed(firstName, orderNumber);
      case NotificationType.SHIPMENT_CONFIRMED:
        return emailTemplates.shipmentConfirmed(firstName, orderNumber);
      case NotificationType.PACKED:
        return emailTemplates.packed(firstName, orderNumber);
      case NotificationType.OUT_FOR_DELIVERY:
        return emailTemplates.outForDelivery(firstName, orderNumber);
      case NotificationType.DELIVERED:
        return emailTemplates.delivered(firstName, orderNumber);
      case NotificationType.RETURN_APPROVED:
        return emailTemplates.returnApproved(firstName, orderNumber);
      case NotificationType.REFUND_COMPLETED:
        return emailTemplates.refundCompleted(firstName, orderNumber, amount || '—');
      case NotificationType.NEWSLETTER:
        return emailTemplates.newsletter(firstName, 'AYARI Newsletter', message);
      default:
        return {
          subject: getEventDefinition(type).title,
          html: emailTemplates.newsletter(firstName, getEventDefinition(type).title, message).html,
          text: message,
        };
    }
  }
}

export const notificationService = new NotificationService();
