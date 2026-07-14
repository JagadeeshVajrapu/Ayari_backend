import { OrderStatus, PaymentStatus, Prisma, ShipmentStatus } from '@prisma/client';
import { prisma } from '../database/prisma';
import { adminShipmentInclude, shipmentInclude } from '../utils/shipment-serialize.util';
import {
  calculateEstimatedDelivery,
  generateAyariTrackingNumber,
  generateShipmentNumber,
  inferShippingMethod,
} from '../utils/shipment.util';
import type { ShipmentPaginationInput } from '../validators/shipment.validator';

type ShipmentWithRelations = Prisma.ShipmentGetPayload<{ include: typeof shipmentInclude }>;
type AdminShipmentRecord = Prisma.ShipmentGetPayload<{ include: typeof adminShipmentInclude }>;
type TransactionClient = Prisma.TransactionClient;

export class ShipmentRepository {
  async findMany(params?: ShipmentPaginationInput): Promise<{ items: ShipmentWithRelations[]; total: number }> {
    const where: Prisma.ShipmentWhereInput = {};

    if (params?.status) where.status = params.status;
    if (params?.courierPartnerId) where.courierPartnerId = params.courierPartnerId;

    if (params?.dateFrom || params?.dateTo) {
      where.createdAt = {
        ...(params.dateFrom ? { gte: params.dateFrom } : {}),
        ...(params.dateTo ? { lte: params.dateTo } : {}),
      };
    }

    if (params?.search) {
      where.OR = [
        { shipmentNumber: { contains: params.search, mode: 'insensitive' } },
        { trackingNumber: { contains: params.search, mode: 'insensitive' } },
        { order: { orderNumber: { contains: params.search, mode: 'insensitive' } } },
        { order: { shippingAddress: { firstName: { contains: params.search, mode: 'insensitive' } } } },
        { order: { shippingAddress: { lastName: { contains: params.search, mode: 'insensitive' } } } },
        { order: { shippingAddress: { phone: { contains: params.search, mode: 'insensitive' } } } },
      ];
    }

    const orderBy: Prisma.ShipmentOrderByWithRelationInput = {
      [params?.sortBy ?? 'createdAt']: params?.sortOrder ?? 'desc',
    };

    const skip = params?.page ? (params.page - 1) * (params.limit ?? 20) : undefined;
    const take = params?.limit;

    const [items, total] = await prisma.$transaction([
      prisma.shipment.findMany({
        where,
        include: shipmentInclude,
        orderBy,
        skip,
        take,
      }),
      prisma.shipment.count({ where }),
    ]);

    return { items, total };
  }

  async getDashboardStats() {
    const [statusGroups, refundPending, refundCompleted, total] = await Promise.all([
      prisma.shipment.groupBy({ by: ['status'], _count: true }),
      prisma.order.count({
        where: {
          payment: { status: { in: [PaymentStatus.PARTIALLY_REFUNDED] } },
        },
      }),
      prisma.order.count({
        where: { status: OrderStatus.REFUNDED },
      }),
      prisma.shipment.count(),
    ]);

    const counts = Object.fromEntries(
      statusGroups.map((g) => [g.status, g._count]),
    ) as Record<ShipmentStatus, number>;

    return {
      total,
      pending: counts.PENDING ?? 0,
      confirmed: counts.CONFIRMED ?? 0,
      packing: counts.PACKING ?? 0,
      packed: counts.PACKED ?? 0,
      readyForPickup: counts.READY_FOR_PICKUP ?? 0,
      pickedUp: counts.PICKED_UP ?? 0,
      inTransit: counts.IN_TRANSIT ?? 0,
      reachedHub: counts.REACHED_HUB ?? 0,
      outForDelivery: counts.OUT_FOR_DELIVERY ?? 0,
      delivered: counts.DELIVERED ?? 0,
      cancelled: counts.CANCELLED ?? 0,
      returned: counts.RETURNED ?? 0,
      refundPending,
      refundCompleted,
    };
  }

  async findById(id: string): Promise<ShipmentWithRelations | null> {
    return prisma.shipment.findUnique({ where: { id }, include: shipmentInclude });
  }

  async findAdminById(id: string): Promise<AdminShipmentRecord | null> {
    return prisma.shipment.findUnique({ where: { id }, include: adminShipmentInclude });
  }

  async findByOrderId(orderId: string): Promise<ShipmentWithRelations | null> {
    return prisma.shipment.findUnique({ where: { orderId }, include: shipmentInclude });
  }

  async findByShipmentNumber(shipmentNumber: string): Promise<ShipmentWithRelations | null> {
    return prisma.shipment.findUnique({ where: { shipmentNumber }, include: shipmentInclude });
  }

  async findByTrackingNumber(trackingNumber: string): Promise<ShipmentWithRelations | null> {
    return prisma.shipment.findFirst({ where: { trackingNumber }, include: shipmentInclude });
  }

  async getDefaultCourierPartner(tx?: TransactionClient) {
    const client = tx ?? prisma;
    return client.courierPartner.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createForOrder(orderId: string, courierPartnerId: string, tx?: TransactionClient) {
    const client = tx ?? prisma;
    const order = await client.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { shippingAmount: true },
    });

    const shippingMethod = inferShippingMethod(Number(order.shippingAmount));
    const trackingNumber = await generateAyariTrackingNumber(client);

    const shipment = await client.shipment.create({
      data: {
        shipmentNumber: generateShipmentNumber(),
        orderId,
        courierPartnerId,
        trackingNumber,
        estimatedDelivery: calculateEstimatedDelivery(new Date(), shippingMethod),
        shippingMethod,
        status: ShipmentStatus.CONFIRMED,
        statusHistory: {
          create: {
            status: ShipmentStatus.CONFIRMED,
            note: 'Shipment created after successful payment',
          },
        },
        trackingEvents: {
          create: {
            status: ShipmentStatus.CONFIRMED,
            description: 'Shipment confirmed',
            eventAt: new Date(),
          },
        },
      },
      include: shipmentInclude,
    });

    return shipment;
  }

  async update(
    id: string,
    data: {
      courierPartnerId?: string;
      trackingNumber?: string;
      estimatedDelivery?: Date;
      warehouse?: string;
      packageWeight?: string;
      packageDimensions?: string;
      shippingMethod?: Prisma.ShipmentUpdateInput['shippingMethod'];
    },
  ): Promise<ShipmentWithRelations> {
    return prisma.shipment.update({ where: { id }, data, include: shipmentInclude });
  }

  async updateStatus(
    id: string,
    status: ShipmentStatus,
    meta: { note?: string; location?: string; createdBy?: string; warehouse?: string },
    tx?: TransactionClient,
  ): Promise<ShipmentWithRelations> {
    const client = tx ?? prisma;

    await client.shipment.update({
      where: { id },
      data: {
        status,
        ...(meta.warehouse ? { warehouse: meta.warehouse } : {}),
      },
    });

    await client.shipmentStatusHistory.create({
      data: {
        shipmentId: id,
        status,
        note: meta.note,
        location: meta.location,
        createdBy: meta.createdBy,
      },
    });

    await client.shipmentTracking.create({
      data: {
        shipmentId: id,
        status,
        location: meta.location,
        description: meta.note,
        eventAt: new Date(),
      },
    });

    return client.shipment.findUniqueOrThrow({ where: { id }, include: shipmentInclude });
  }

  async addNote(
    shipmentId: string,
    data: { type: Prisma.ShipmentNoteCreateInput['type']; content: string; createdBy?: string },
  ) {
    return prisma.shipmentNote.create({
      data: { shipmentId, type: data.type, content: data.content, createdBy: data.createdBy },
    });
  }

  async addTrackingEvent(
    shipmentId: string,
    data: {
      status: ShipmentStatus;
      location?: string;
      description?: string;
      eventAt?: Date;
    },
  ): Promise<ShipmentWithRelations> {
    await prisma.shipmentTracking.create({
      data: {
        shipmentId,
        status: data.status,
        location: data.location,
        description: data.description,
        eventAt: data.eventAt ?? new Date(),
      },
    });

    return prisma.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: shipmentInclude });
  }

  async regenerateTrackingNumber(id: string, tx?: TransactionClient) {
    const client = tx ?? prisma;
    const trackingNumber = await generateAyariTrackingNumber(client);
    return client.shipment.update({
      where: { id },
      data: { trackingNumber },
      include: shipmentInclude,
    });
  }

  async syncOrderStatus(orderId: string, shipmentStatus: ShipmentStatus, tx?: TransactionClient) {
    const client = tx ?? prisma;
    const orderUpdate: Prisma.OrderUpdateInput = {};

    if (
      shipmentStatus === ShipmentStatus.PACKING ||
      shipmentStatus === ShipmentStatus.PACKED ||
      shipmentStatus === ShipmentStatus.READY_FOR_PICKUP
    ) {
      orderUpdate.status = OrderStatus.PROCESSING;
    }

    if (
      shipmentStatus === ShipmentStatus.PICKED_UP ||
      shipmentStatus === ShipmentStatus.IN_TRANSIT ||
      shipmentStatus === ShipmentStatus.REACHED_HUB ||
      shipmentStatus === ShipmentStatus.OUT_FOR_DELIVERY
    ) {
      orderUpdate.status = OrderStatus.SHIPPED;
      orderUpdate.shippedAt = new Date();
    }

    if (shipmentStatus === ShipmentStatus.DELIVERED) {
      orderUpdate.status = OrderStatus.DELIVERED;
      orderUpdate.deliveredAt = new Date();
    }

    if (shipmentStatus === ShipmentStatus.CANCELLED) {
      orderUpdate.status = OrderStatus.CANCELLED;
      orderUpdate.cancelledAt = new Date();
    }

    if (Object.keys(orderUpdate).length === 0) return;

    await client.order.update({ where: { id: orderId }, data: orderUpdate });
  }

  async listCourierPartners(activeOnly = false) {
    return prisma.courierPartner.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async createCourierPartner(data: {
    name: string;
    code: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
    website?: string;
    logoUrl?: string;
    trackingUrlTemplate?: string;
    isActive?: boolean;
  }) {
    return prisma.courierPartner.create({ data });
  }

  async updateCourierPartner(
    id: string,
    data: Partial<{
      name: string;
      code: string;
      contactPerson: string | null;
      phone: string | null;
      email: string | null;
      website: string | null;
      logoUrl: string | null;
      trackingUrlTemplate: string | null;
      isActive: boolean;
    }>,
  ) {
    return prisma.courierPartner.update({ where: { id }, data });
  }

  async deleteCourierPartner(id: string) {
    return prisma.courierPartner.update({ where: { id }, data: { isActive: false } });
  }

  async findCourierPartnerById(id: string) {
    return prisma.courierPartner.findUnique({ where: { id } });
  }
}

export const shipmentRepository = new ShipmentRepository();
