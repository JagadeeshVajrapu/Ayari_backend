import { OrderStatus, PaymentStatus, Prisma, ShipmentStatus } from '@prisma/client';
import { prisma } from '../database/prisma';
import { shipmentRepository } from '../repositories/shipment.repository';
import { notificationService } from './notification.service';
import { realtimeService } from './realtime.service';
import {
  serializeAdminShipmentDetail,
  serializeCourierPartner,
  serializeShipment,
  serializeShipmentListItem,
} from '../utils/shipment-serialize.util';
import {
  canTransitionShipmentStatus,
  getShipmentStatusDescription,
  isTerminalShipmentStatus,
} from '../utils/shipment.util';
import { BadRequestError, ConflictError, NotFoundError } from '../utils/appError.util';
import type {
  AddShipmentNoteInput,
  AddShipmentTrackingEventInput,
  AdminActionInput,
  AssignCourierInput,
  CreateCourierPartnerInput,
  ShipmentPaginationInput,
  UpdateCourierPartnerInput,
  UpdateShipmentInput,
  UpdateShipmentStatusInput,
} from '../validators/shipment.validator';
import { SHIPMENT_STATUS_LABELS } from '../types/shipment.dto';

const ACTION_STATUS_MAP: Record<string, ShipmentStatus | null> = {
  ACCEPT_ORDER: ShipmentStatus.CONFIRMED,
  REJECT_ORDER: ShipmentStatus.CANCELLED,
  START_PACKING: ShipmentStatus.PACKING,
  MARK_PACKED: ShipmentStatus.PACKED,
  READY_FOR_PICKUP: ShipmentStatus.READY_FOR_PICKUP,
  PICKED_UP: ShipmentStatus.PICKED_UP,
  IN_TRANSIT: ShipmentStatus.IN_TRANSIT,
  REACHED_HUB: ShipmentStatus.REACHED_HUB,
  OUT_FOR_DELIVERY: ShipmentStatus.OUT_FOR_DELIVERY,
  DELIVERED: ShipmentStatus.DELIVERED,
  CANCEL: ShipmentStatus.CANCELLED,
  RETURN: ShipmentStatus.RETURNED,
  APPROVE_RETURN: ShipmentStatus.RETURNED,
  REJECT_RETURN: ShipmentStatus.DELIVERED,
  ASSIGN_COURIER: null,
  GENERATE_TRACKING: null,
  INITIATE_REFUND: null,
  COMPLETE_REFUND: null,
};

export class ShipmentService {
  private emitNotification(
    notification: {
      id: string;
      userId: string;
      title: string;
      message: string;
      type: import('@prisma/client').NotificationType;
      category: import('@prisma/client').NotificationCategory;
      status: import('@prisma/client').NotificationRecordStatus;
      priority: import('@prisma/client').NotificationPriority;
      icon: string | null;
      actionUrl: string | null;
      metadata: unknown;
      isRead: boolean;
      readAt: Date | null;
      orderId: string | null;
      shipmentId: string | null;
      createdAt: Date;
      updatedAt: Date;
    } | null,
    orderNumber: string,
  ) {
    if (!notification) return;
    void notificationService.emitAfterTransaction(notification, { orderNumber });
  }

  async createForPaidOrder(orderId: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? prisma;
    const existing = await client.shipment.findUnique({ where: { orderId } });
    if (existing) return existing;

    let courier = await shipmentRepository.getDefaultCourierPartner(tx);
    if (!courier) {
      courier = await client.courierPartner.create({
        data: {
          name: 'Ayari Logistics',
          code: 'AYARI',
          trackingUrlTemplate: 'https://track.ayari.com/{trackingNumber}',
          isActive: true,
        },
      });
    }

    return shipmentRepository.createForOrder(orderId, courier.id, tx);
  }

  async getDashboardStats() {
    return shipmentRepository.getDashboardStats();
  }

  async listShipments(params: ShipmentPaginationInput) {
    const { items, total } = await shipmentRepository.findMany(params);

    return {
      items: items.map(serializeShipmentListItem),
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async getShipmentById(id: string) {
    const shipment = await shipmentRepository.findById(id);
    if (!shipment) throw new NotFoundError('Shipment not found');
    return serializeShipment(shipment, { includeHistory: true });
  }

  async getAdminShipmentDetail(id: string) {
    const shipment = await shipmentRepository.findAdminById(id);
    if (!shipment) throw new NotFoundError('Shipment not found');

    const createdByIds = [
      ...shipment.notes.map((n) => n.createdBy ?? ''),
      ...shipment.statusHistory.map((h) => h.createdBy ?? ''),
    ];
    const users = await prisma.user.findMany({
      where: { id: { in: [...new Set(createdByIds.filter(Boolean))] } },
      select: { id: true, firstName: true, lastName: true, role: true },
    });
    const labelMap = new Map(
      users.map((u) => [u.id, u.role === 'ADMIN' ? 'Admin' : `${u.firstName} ${u.lastName}`.trim()]),
    );

    return serializeAdminShipmentDetail(shipment, labelMap);
  }

  async getShipmentByOrderId(orderId: string) {
    const shipment = await shipmentRepository.findByOrderId(orderId);
    if (!shipment) throw new NotFoundError('Shipment not found for this order');
    return serializeShipment(shipment, { includeHistory: true });
  }

  async getShipmentForCustomer(orderId: string, userId: string) {
    const owned = await prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundError('Shipment not found');

    const shipment = await shipmentRepository.findByOrderId(orderId);
    if (!shipment) throw new NotFoundError('Shipment not found for this order');
    return serializeShipment(shipment, { includeHistory: true });
  }

  async trackByNumber(shipmentNumber: string) {
    const shipment = await shipmentRepository.findByShipmentNumber(shipmentNumber);
    if (!shipment) throw new NotFoundError('Shipment not found');
    return serializeShipment(shipment, { includeHistory: true });
  }

  async trackByTrackingNumber(trackingNumber: string) {
    const shipment = await shipmentRepository.findByTrackingNumber(trackingNumber);
    if (!shipment) throw new NotFoundError('Shipment not found');
    return serializeShipment(shipment, { includeHistory: true });
  }

  async updateShipment(id: string, input: UpdateShipmentInput) {
    const shipment = await shipmentRepository.findById(id);
    if (!shipment) throw new NotFoundError('Shipment not found');

    if (input.courierPartnerId) {
      const courier = await shipmentRepository.findCourierPartnerById(input.courierPartnerId);
      if (!courier || !courier.isActive) {
        throw new BadRequestError('Invalid or inactive courier partner');
      }
    }

    const updated = await shipmentRepository.update(id, input);
    return serializeShipment(updated, { includeHistory: true });
  }

  async updateShipmentStatus(id: string, input: UpdateShipmentStatusInput, adminUserId?: string) {
    return this.applyStatusUpdate(id, input.status, {
      note: input.note,
      location: input.location,
      warehouse: input.warehouse,
      adminUserId,
    });
  }

  async performAdminAction(id: string, input: AdminActionInput, adminUserId?: string) {
    const shipment = await shipmentRepository.findAdminById(id);
    if (!shipment) throw new NotFoundError('Shipment not found');

    if (input.action === 'ASSIGN_COURIER') {
      if (!input.courierPartnerId) throw new BadRequestError('Courier partner is required');
      return this.assignCourier(id, { courierPartnerId: input.courierPartnerId, location: input.location }, adminUserId);
    }

    if (input.action === 'GENERATE_TRACKING') {
      return this.generateTrackingNumber(id, adminUserId);
    }

    if (input.action === 'INITIATE_REFUND') {
      return this.handleRefund(id, false, adminUserId, input.note);
    }

    if (input.action === 'COMPLETE_REFUND') {
      return this.handleRefund(id, true, adminUserId, input.note);
    }

    const targetStatus = ACTION_STATUS_MAP[input.action];
    if (!targetStatus) throw new BadRequestError('Invalid action');

    return this.applyStatusUpdate(id, targetStatus, {
      note: input.note ?? getShipmentStatusDescription(targetStatus),
      location: input.location,
      warehouse: input.location,
      adminUserId,
    });
  }

  async assignCourier(id: string, input: AssignCourierInput, adminUserId?: string) {
    const shipment = await shipmentRepository.findAdminById(id);
    if (!shipment) throw new NotFoundError('Shipment not found');

    const courier = await shipmentRepository.findCourierPartnerById(input.courierPartnerId);
    if (!courier || !courier.isActive) throw new BadRequestError('Invalid courier partner');

    return prisma.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id },
        data: { courierPartnerId: input.courierPartnerId },
      });

      await shipmentRepository.updateStatus(
        id,
        shipment.status,
        {
          note: `Courier assigned: ${courier.name}`,
          location: input.location ?? shipment.warehouse ?? undefined,
          createdBy: adminUserId,
        },
        tx,
      );

      const notification = await notificationService.notifyCourierAssigned(
        {
          userId: shipment.order.userId,
          orderId: shipment.orderId,
          shipmentId: id,
          orderNumber: shipment.order.orderNumber,
          courierName: courier.name,
          trackingNumber: shipment.trackingNumber,
        },
        tx,
      );

      const updated = await tx.shipment.findUniqueOrThrow({
        where: { id },
        include: { order: { select: { orderNumber: true } }, courierPartner: true, statusHistory: true, trackingEvents: true },
      });

      return { updated, notification };
    }).then(({ updated, notification }) => {
      const ctx = {
        orderId: shipment.orderId,
        orderNumber: shipment.order.orderNumber,
        shipmentId: id,
        userId: shipment.order.userId,
        status: shipment.status,
      };

      void realtimeService.emitTrackingHistoryAdded(ctx, {
        status: shipment.status,
        statusLabel: SHIPMENT_STATUS_LABELS[shipment.status],
        description: `Courier assigned: ${courier.name}`,
        location: input.location ?? shipment.warehouse ?? null,
        eventAt: new Date().toISOString(),
      });
      this.emitNotification(notification, shipment.order.orderNumber);

      return serializeShipment(updated as Parameters<typeof serializeShipment>[0], { includeHistory: true });
    });
  }

  async generateTrackingNumber(id: string, adminUserId?: string) {
    const shipment = await shipmentRepository.findAdminById(id);
    if (!shipment) throw new NotFoundError('Shipment not found');

    return prisma.$transaction(async (tx) => {
      const updated = await shipmentRepository.regenerateTrackingNumber(id, tx);

      await shipmentRepository.updateStatus(
        id,
        shipment.status,
        {
          note: `New tracking number generated: ${updated.trackingNumber}`,
          createdBy: adminUserId,
        },
        tx,
      );

      return updated;
    }).then((updated) => {
      void realtimeService.emitTrackingHistoryAdded(
        {
          orderId: shipment.orderId,
          orderNumber: shipment.order.orderNumber,
          shipmentId: id,
          userId: shipment.order.userId,
          status: shipment.status,
        },
        {
          status: shipment.status,
          statusLabel: SHIPMENT_STATUS_LABELS[shipment.status],
          description: `New tracking number generated: ${updated.trackingNumber}`,
          location: shipment.warehouse,
          eventAt: new Date().toISOString(),
        },
      );

      return serializeShipment(updated, { includeHistory: true });
    });
  }

  async addShipmentNote(id: string, input: AddShipmentNoteInput, adminUserId?: string) {
    const shipment = await shipmentRepository.findById(id);
    if (!shipment) throw new NotFoundError('Shipment not found');

    await shipmentRepository.addNote(id, {
      type: input.type,
      content: input.content,
      createdBy: adminUserId,
    });

    return this.getAdminShipmentDetail(id);
  }

  async addTrackingEvent(id: string, input: AddShipmentTrackingEventInput) {
    const shipment = await shipmentRepository.findById(id);
    if (!shipment) throw new NotFoundError('Shipment not found');

    const order = await prisma.order.findUnique({
      where: { id: shipment.orderId },
      select: { userId: true, orderNumber: true },
    });
    if (!order) throw new NotFoundError('Order not found');

    const updated = await shipmentRepository.addTrackingEvent(id, {
      status: input.status,
      location: input.location,
      description: input.description ?? getShipmentStatusDescription(input.status),
      eventAt: input.eventAt,
    });

    const latestEvent = updated.trackingEvents[0];
    void realtimeService.emitTrackingHistoryAdded(
      {
        orderId: shipment.orderId,
        orderNumber: order.orderNumber,
        shipmentId: id,
        userId: order.userId,
        status: shipment.status,
      },
      {
        status: input.status,
        statusLabel: SHIPMENT_STATUS_LABELS[input.status],
        description: latestEvent?.description ?? input.description ?? null,
        location: latestEvent?.location ?? input.location ?? null,
        eventAt: (latestEvent?.eventAt ?? new Date()).toISOString(),
      },
    );

    return serializeShipment(updated, { includeHistory: true });
  }

  async listCourierPartners(activeOnly = false) {
    const partners = await shipmentRepository.listCourierPartners(activeOnly);
    return partners.map(serializeCourierPartner);
  }

  async createCourierPartner(input: CreateCourierPartnerInput) {
    const partner = await shipmentRepository.createCourierPartner(input);
    return serializeCourierPartner(partner);
  }

  async updateCourierPartner(id: string, input: UpdateCourierPartnerInput) {
    const existing = await shipmentRepository.findCourierPartnerById(id);
    if (!existing) throw new NotFoundError('Courier partner not found');

    const partner = await shipmentRepository.updateCourierPartner(id, input);
    return serializeCourierPartner(partner);
  }

  async deleteCourierPartner(id: string) {
    const existing = await shipmentRepository.findCourierPartnerById(id);
    if (!existing) throw new NotFoundError('Courier partner not found');

    const partner = await shipmentRepository.deleteCourierPartner(id);
    return serializeCourierPartner(partner);
  }

  private async applyStatusUpdate(
    id: string,
    status: ShipmentStatus,
    meta: { note?: string; location?: string; warehouse?: string; adminUserId?: string },
  ) {
    const shipment = await shipmentRepository.findAdminById(id);
    if (!shipment) throw new NotFoundError('Shipment not found');

    if (isTerminalShipmentStatus(shipment.status) && shipment.status !== status) {
      throw new ConflictError(`Cannot update shipment from terminal status ${shipment.status}`);
    }

    if (!canTransitionShipmentStatus(shipment.status, status)) {
      throw new BadRequestError(`Invalid status transition from ${shipment.status} to ${status}`);
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await shipmentRepository.updateStatus(
        id,
        status,
        {
          note: meta.note ?? getShipmentStatusDescription(status),
          location: meta.location,
          createdBy: meta.adminUserId,
          warehouse: meta.warehouse,
        },
        tx,
      );

      await shipmentRepository.syncOrderStatus(shipment.orderId, status, tx);

      const notification = await notificationService.notifyShipmentStatus(
        {
          userId: shipment.order.userId,
          orderId: shipment.orderId,
          shipmentId: id,
          orderNumber: shipment.order.orderNumber,
          status,
          message: meta.note,
        },
        tx,
      );

      return { updated, notification };
    });

    void realtimeService.emitShipmentStatusChange({
      orderId: shipment.orderId,
      orderNumber: shipment.order.orderNumber,
      shipmentId: id,
      userId: shipment.order.userId,
      status,
    });
    this.emitNotification(result.notification, shipment.order.orderNumber);

    return serializeShipment(result.updated, { includeHistory: true });
  }

  private async handleRefund(
    id: string,
    completed: boolean,
    adminUserId?: string,
    note?: string,
  ) {
    const shipment = await shipmentRepository.findAdminById(id);
    if (!shipment) throw new NotFoundError('Shipment not found');

    const result = await prisma.$transaction(async (tx) => {
      if (completed) {
        await tx.order.update({
          where: { id: shipment.orderId },
          data: { status: OrderStatus.REFUNDED },
        });
        if (shipment.order.payment) {
          await tx.payment.update({
            where: { id: shipment.order.payment.id },
            data: { status: PaymentStatus.REFUNDED, refundedAt: new Date() },
          });
        }
      } else if (shipment.order.payment) {
        await tx.payment.update({
          where: { id: shipment.order.payment.id },
          data: { status: PaymentStatus.PARTIALLY_REFUNDED },
        });
      }

      await tx.shipmentNote.create({
        data: {
          shipmentId: id,
          type: 'GENERAL',
          content: note ?? (completed ? 'Refund completed' : 'Refund initiated'),
          createdBy: adminUserId,
        },
      });

      const notification = await notificationService.notifyRefund(
        {
          userId: shipment.order.userId,
          orderId: shipment.orderId,
          shipmentId: id,
          orderNumber: shipment.order.orderNumber,
          completed,
        },
        tx,
      );

      return { notification };
    });

    this.emitNotification(result.notification, shipment.order.orderNumber);

    return this.getAdminShipmentDetail(id);
  }
}

export const shipmentService = new ShipmentService();
