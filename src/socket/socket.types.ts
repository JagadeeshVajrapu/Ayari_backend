import type { ShipmentStatus } from '@prisma/client';
import type { OrderTrackingDto } from '../types/tracking.dto';

export const SOCKET_EVENTS = {
  SHIPMENT_CREATED: 'shipment_created',
  SHIPMENT_UPDATED: 'shipment_updated',
  SHIPMENT_CANCELLED: 'shipment_cancelled',
  SHIPMENT_RETURNED: 'shipment_returned',
  SHIPMENT_DELIVERED: 'shipment_delivered',
  TRACKING_HISTORY_ADDED: 'tracking_history_added',
  NOTIFICATION_CREATED: 'notification_created',
  NOTIFICATION_READ: 'notification_read',
  NOTIFICATION_DELETED: 'notification_deleted',
  NOTIFICATION_UPDATED: 'notification_updated',
  CONNECTION_ACK: 'connection_ack',
  SUBSCRIBE_ORDER: 'subscribe_order',
  UNSUBSCRIBE_ORDER: 'unsubscribe_order',
  SUBSCRIBE_ACK: 'subscribe_ack',
  SUBSCRIBE_ERROR: 'subscribe_error',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

export interface SocketUser {
  id: string;
  email: string;
  role: string;
}

export interface ShipmentRealtimePayload {
  orderId: string;
  orderNumber: string;
  shipmentId: string;
  status: ShipmentStatus;
  tracking: OrderTrackingDto;
  updatedAt: string;
}

export interface TrackingHistoryPayload {
  orderId: string;
  orderNumber: string;
  shipmentId: string;
  status: string;
  statusLabel: string;
  description: string | null;
  location: string | null;
  eventAt: string;
  tracking: OrderTrackingDto;
}

import type { NotificationDto } from '../types/notification.dto';

export interface NotificationRealtimePayload {
  id: string;
  type: string;
  category: string;
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

export function getOrderRoom(orderNumber: string): string {
  return `order_${orderNumber}`;
}

export function resolveShipmentEvent(status: ShipmentStatus): SocketEventName {
  switch (status) {
    case 'CANCELLED':
      return SOCKET_EVENTS.SHIPMENT_CANCELLED;
    case 'RETURNED':
      return SOCKET_EVENTS.SHIPMENT_RETURNED;
    case 'DELIVERED':
      return SOCKET_EVENTS.SHIPMENT_DELIVERED;
    default:
      return SOCKET_EVENTS.SHIPMENT_UPDATED;
  }
}
