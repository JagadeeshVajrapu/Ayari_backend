import { Prisma, UserRole } from '@prisma/client';
import { prisma } from '../database/prisma';
import { NotFoundError } from '../utils/appError.util';
import { buildTrackingUrl } from '../utils/shipment.util';

const orderTrackingInclude = {
  items: true,
  payment: true,
  shippingAddress: true,
  user: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
  shipment: {
    include: {
      courierPartner: true,
      statusHistory: { orderBy: { createdAt: 'asc' as const } },
      trackingEvents: { orderBy: { eventAt: 'desc' as const } },
    },
  },
} satisfies Prisma.OrderInclude;

type OrderTrackingRecord = Prisma.OrderGetPayload<{ include: typeof orderTrackingInclude }>;

export class TrackingRepository {
  async findOrderForTracking(orderId: string): Promise<OrderTrackingRecord | null> {
    return prisma.order.findUnique({
      where: { id: orderId },
      include: orderTrackingInclude,
    });
  }

  async assertOrderAccess(orderId: string, userId: string, role: UserRole) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { userId: true },
    });

    if (!order) throw new NotFoundError('Order not found');
    if (role !== UserRole.ADMIN && order.userId !== userId) {
      throw new NotFoundError('Order not found');
    }

    return order;
  }

  async assertShipmentAccess(shipmentId: string, userId: string, role: UserRole) {
    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      select: { order: { select: { userId: true } } },
    });

    if (!shipment) throw new NotFoundError('Shipment not found');
    if (role !== UserRole.ADMIN && shipment.order.userId !== userId) {
      throw new NotFoundError('Shipment not found');
    }

    return shipment;
  }

  async resolveUpdatedByLabels(userIds: string[]) {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    if (!uniqueIds.length) return new Map<string, string>();

    const users = await prisma.user.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, firstName: true, lastName: true, role: true },
    });

    return new Map(
      users.map((user) => [
        user.id,
        user.role === UserRole.ADMIN
          ? 'Admin'
          : `${user.firstName} ${user.lastName}`.trim() || 'Customer',
      ]),
    );
  }

  async getShipmentTrackingHistory(
    shipmentId: string,
    page: number,
    limit: number,
  ) {
    const where = { shipmentId };

    const [events, total] = await prisma.$transaction([
      prisma.shipmentTracking.findMany({
        where,
        orderBy: { eventAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.shipmentTracking.count({ where }),
    ]);

    return { events, total };
  }

  async getOrderStatusHistoryRecords(orderId: string, page: number, limit: number) {
    const shipment = await prisma.shipment.findUnique({
      where: { orderId },
      select: { id: true },
    });

    if (!shipment) {
      return { events: [], total: 0 };
    }

    const where = { shipmentId: shipment.id };

    const [events, total] = await prisma.$transaction([
      prisma.shipmentStatusHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.shipmentStatusHistory.count({ where }),
    ]);

    return { events, total };
  }

  buildTrackingUrlForShipment(shipment: {
    trackingNumber: string;
    trackingUrl?: string | null;
    awbNumber?: string | null;
    courierPartner: { trackingUrlTemplate: string | null };
  }) {
    if (shipment.trackingUrl) return shipment.trackingUrl;
    const trackingNumber = shipment.awbNumber ?? shipment.trackingNumber;
    return buildTrackingUrl(shipment.courierPartner.trackingUrlTemplate, trackingNumber);
  }
}

export const trackingRepository = new TrackingRepository();

export { orderTrackingInclude };
