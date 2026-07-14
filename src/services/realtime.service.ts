import { ShipmentStatus, UserRole } from '@prisma/client';
import { trackingService } from './tracking.service';
import type { NotificationDto } from '../types/notification.dto';
import {
  SOCKET_EVENTS,
  resolveShipmentEvent,
  socketService,
  type ShipmentRealtimePayload,
  type TrackingHistoryPayload,
} from '../socket';

interface ShipmentContext {
  orderId: string;
  orderNumber: string;
  shipmentId: string;
  userId: string;
  status: ShipmentStatus;
}

export class RealtimeService {
  private async buildTracking(orderId: string, userId: string) {
    return trackingService.getOrderTracking(orderId, userId, UserRole.CUSTOMER);
  }

  private buildShipmentPayload(
    ctx: ShipmentContext,
    tracking: Awaited<ReturnType<typeof this.buildTracking>>,
  ): ShipmentRealtimePayload {
    return {
      orderId: ctx.orderId,
      orderNumber: ctx.orderNumber,
      shipmentId: ctx.shipmentId,
      status: ctx.status,
      tracking,
      updatedAt: new Date().toISOString(),
    };
  }

  async emitShipmentCreated(ctx: ShipmentContext) {
    if (!socketService.isReady()) return;

    const tracking = await this.buildTracking(ctx.orderId, ctx.userId);
    const payload = this.buildShipmentPayload(ctx, tracking);

    socketService.emitToOrder(ctx.orderNumber, SOCKET_EVENTS.SHIPMENT_CREATED, payload);
    socketService.emitToUser(ctx.userId, SOCKET_EVENTS.SHIPMENT_CREATED, payload);
  }

  async emitShipmentStatusChange(ctx: ShipmentContext) {
    if (!socketService.isReady()) return;

    const tracking = await this.buildTracking(ctx.orderId, ctx.userId);
    const payload = this.buildShipmentPayload(ctx, tracking);
    const event = resolveShipmentEvent(ctx.status);

    socketService.emitToOrder(ctx.orderNumber, event, payload);
    socketService.emitToUser(ctx.userId, event, payload);
  }

  async emitTrackingHistoryAdded(
    ctx: ShipmentContext,
    history: {
      status: string;
      statusLabel: string;
      description: string | null;
      location: string | null;
      eventAt: string;
    },
  ) {
    if (!socketService.isReady()) return;

    const tracking = await this.buildTracking(ctx.orderId, ctx.userId);
    const payload: TrackingHistoryPayload = {
      orderId: ctx.orderId,
      orderNumber: ctx.orderNumber,
      shipmentId: ctx.shipmentId,
      ...history,
      tracking,
    };

    socketService.emitToOrder(ctx.orderNumber, SOCKET_EVENTS.TRACKING_HISTORY_ADDED, payload);
    socketService.emitToUser(ctx.userId, SOCKET_EVENTS.TRACKING_HISTORY_ADDED, payload);
  }

  emitNotificationEvent(
    userId: string,
    notification: NotificationDto,
    unreadCount: number,
    orderNumber: string | null = null,
  ) {
    if (!socketService.isReady()) return;

    const payload = this.toRealtimePayload(notification, unreadCount);
    socketService.emitToUser(userId, SOCKET_EVENTS.NOTIFICATION_CREATED, payload);

    if (orderNumber) {
      socketService.emitToOrder(orderNumber, SOCKET_EVENTS.NOTIFICATION_CREATED, payload);
    }
  }

  emitNotificationRead(userId: string, notification: NotificationDto, unreadCount: number) {
    if (!socketService.isReady()) return;
    socketService.emitToUser(userId, SOCKET_EVENTS.NOTIFICATION_READ, {
      notification: this.toRealtimePayload(notification, unreadCount),
      unreadCount,
    });
  }

  emitNotificationDeleted(userId: string, notificationId: string, unreadCount: number) {
    if (!socketService.isReady()) return;
    socketService.emitToUser(userId, SOCKET_EVENTS.NOTIFICATION_DELETED, {
      id: notificationId,
      unreadCount,
    });
  }

  emitNotificationUpdated(userId: string, data: { unreadCount: number }) {
    if (!socketService.isReady()) return;
    socketService.emitToUser(userId, SOCKET_EVENTS.NOTIFICATION_UPDATED, data);
  }

  /** @deprecated use emitNotificationEvent */
  emitNotificationCreated(
    userId: string,
    orderNumber: string | null,
    notification: {
      id: string;
      type: string;
      title: string;
      message: string;
      orderId: string | null;
      shipmentId: string | null;
      createdAt: string;
    },
  ) {
    if (!socketService.isReady()) return;
    socketService.emitToUser(userId, SOCKET_EVENTS.NOTIFICATION_CREATED, notification);
    if (orderNumber) {
      socketService.emitToOrder(orderNumber, SOCKET_EVENTS.NOTIFICATION_CREATED, notification);
    }
  }

  private toRealtimePayload(notification: NotificationDto, unreadCount: number) {
    return {
      id: notification.id,
      type: notification.type,
      category: notification.category,
      title: notification.title,
      message: notification.message,
      icon: notification.icon,
      actionUrl: notification.actionUrl,
      orderId: notification.orderId,
      shipmentId: notification.shipmentId,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
      unreadCount,
    };
  }
}

export const realtimeService = new RealtimeService();
