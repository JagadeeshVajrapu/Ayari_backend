import { Prisma } from '@prisma/client';
import type {
  AdminShipmentDetailDto,
  CourierPartnerDto,
  ShipmentDto,
  ShipmentListItemDto,
  ShipmentStatusHistoryDto,
  ShipmentTrackingDto,
} from '../types/shipment.dto';
import { buildTrackingUrl } from './shipment.util';

export const shipmentInclude = {
  order: {
    select: {
      orderNumber: true,
      shippingAddress: { select: { firstName: true, lastName: true, phone: true } },
      user: { select: { firstName: true, lastName: true, phone: true } },
    },
  },
  courierPartner: true,
  statusHistory: { orderBy: { createdAt: 'desc' as const } },
  trackingEvents: { orderBy: { eventAt: 'desc' as const } },
} satisfies Prisma.ShipmentInclude;

export const adminShipmentInclude = {
  order: {
    select: {
      orderNumber: true,
      userId: true,
      status: true,
      placedAt: true,
      createdAt: true,
      notes: true,
      subtotal: true,
      discountAmount: true,
      taxAmount: true,
      shippingAmount: true,
      totalAmount: true,
      shippingAddress: true,
      user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      items: true,
      payment: true,
    },
  },
  courierPartner: true,
  statusHistory: { orderBy: { createdAt: 'desc' as const } },
  trackingEvents: { orderBy: { eventAt: 'desc' as const } },
  notes: { orderBy: { createdAt: 'desc' as const } },
  deliveryAttempts: { orderBy: { attemptAt: 'desc' as const } },
} satisfies Prisma.ShipmentInclude;

type ShipmentWithRelations = Prisma.ShipmentGetPayload<{ include: typeof shipmentInclude }>;
type AdminShipmentRecord = Prisma.ShipmentGetPayload<{ include: typeof adminShipmentInclude }>;

export function serializeCourierPartner(partner: {
  id: string;
  name: string;
  code: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  trackingUrlTemplate: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): CourierPartnerDto {
  return {
    id: partner.id,
    name: partner.name,
    code: partner.code,
    contactPerson: partner.contactPerson ?? null,
    phone: partner.phone ?? null,
    email: partner.email ?? null,
    website: partner.website ?? null,
    logoUrl: partner.logoUrl ?? null,
    trackingUrlTemplate: partner.trackingUrlTemplate,
    isActive: partner.isActive,
    createdAt: partner.createdAt.toISOString(),
    updatedAt: partner.updatedAt.toISOString(),
  };
}

function serializeStatusHistory(entry: {
  id: string;
  status: ShipmentStatusHistoryDto['status'];
  note: string | null;
  location: string | null;
  createdBy: string | null;
  createdAt: Date;
}): ShipmentStatusHistoryDto {
  return {
    id: entry.id,
    status: entry.status,
    note: entry.note,
    location: entry.location,
    createdBy: entry.createdBy,
    createdAt: entry.createdAt.toISOString(),
  };
}

function serializeTrackingEvent(event: {
  id: string;
  status: ShipmentTrackingDto['status'];
  location: string | null;
  description: string | null;
  eventAt: Date;
  createdAt: Date;
}): ShipmentTrackingDto {
  return {
    id: event.id,
    status: event.status,
    location: event.location,
    description: event.description,
    eventAt: event.eventAt.toISOString(),
    createdAt: event.createdAt.toISOString(),
  };
}

function getCustomerName(order: {
  shippingAddress: { firstName: string; lastName: string };
  user: { firstName: string; lastName: string };
}) {
  const fromAddress = `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`.trim();
  return fromAddress || `${order.user.firstName} ${order.user.lastName}`.trim();
}

export function serializeShipment(
  shipment: ShipmentWithRelations,
  options?: { includeHistory?: boolean },
): ShipmentDto {
  return {
    id: shipment.id,
    shipmentNumber: shipment.shipmentNumber,
    orderId: shipment.orderId,
    orderNumber: shipment.order.orderNumber,
    courierPartnerId: shipment.courierPartnerId,
    courierName: shipment.courierPartner.name,
    trackingNumber: shipment.trackingNumber,
    trackingUrl: buildTrackingUrl(shipment.courierPartner.trackingUrlTemplate, shipment.trackingNumber),
    estimatedDelivery: shipment.estimatedDelivery.toISOString(),
    status: shipment.status,
    createdAt: shipment.createdAt.toISOString(),
    updatedAt: shipment.updatedAt.toISOString(),
    ...(options?.includeHistory
      ? {
          statusHistory: shipment.statusHistory.map(serializeStatusHistory),
          trackingEvents: shipment.trackingEvents.map(serializeTrackingEvent),
        }
      : {}),
  };
}

export function serializeShipmentListItem(shipment: ShipmentWithRelations): ShipmentListItemDto {
  const order = shipment.order as ShipmentWithRelations['order'] & {
    shippingAddress?: { firstName: string; lastName: string; phone: string | null };
    user?: { firstName: string; lastName: string; phone: string | null };
  };

  const customerName = order.shippingAddress
    ? `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`.trim()
    : '—';

  return {
    id: shipment.id,
    shipmentNumber: shipment.shipmentNumber,
    orderId: shipment.orderId,
    orderNumber: shipment.order.orderNumber,
    courierName: shipment.courierPartner.name,
    courierPartnerId: shipment.courierPartnerId,
    trackingNumber: shipment.trackingNumber,
    estimatedDelivery: shipment.estimatedDelivery.toISOString(),
    status: shipment.status,
    customerName,
    customerPhone: order.shippingAddress?.phone ?? order.user?.phone ?? null,
    createdAt: shipment.createdAt.toISOString(),
    updatedAt: shipment.updatedAt.toISOString(),
  };
}

export function serializeAdminShipmentDetail(
  shipment: AdminShipmentRecord,
  createdByLabels: Map<string, string>,
): AdminShipmentDetailDto {
  const base = serializeShipment(shipment as unknown as ShipmentWithRelations, { includeHistory: true });
  const order = shipment.order;
  const customerName = getCustomerName(order);

  return {
    ...base,
    shippingMethod: shipment.shippingMethod,
    warehouse: shipment.warehouse,
    packageWeight: shipment.packageWeight,
    packageDimensions: shipment.packageDimensions,
    customerName,
    customerPhone: order.shippingAddress.phone ?? order.user.phone,
    customerEmail: order.user.email,
    shippingAddress: {
      street: order.shippingAddress.street,
      city: order.shippingAddress.city,
      state: order.shippingAddress.state,
      postalCode: order.shippingAddress.zipCode,
      country: order.shippingAddress.country,
    },
    order: {
      status: order.status,
      placedAt: order.placedAt?.toISOString() ?? null,
      subtotal: Number(order.subtotal),
      discount: Number(order.discountAmount),
      tax: Number(order.taxAmount),
      shippingCharges: Number(order.shippingAmount),
      total: Number(order.totalAmount),
      notes: order.notes,
      items: order.items.map((item) => ({
        id: item.id,
        productName: item.productName,
        productSku: item.productSku,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        totalPrice: Number(item.totalPrice),
      })),
      payment: order.payment
        ? {
            method: order.payment.paymentMethod,
            status: order.payment.status,
            transactionId: order.payment.transactionId,
            amount: Number(order.payment.amount),
            paidAt: order.payment.paidAt?.toISOString() ?? null,
          }
        : null,
    },
    notes: shipment.notes.map((note) => ({
      id: note.id,
      type: note.type,
      content: note.content,
      createdBy: note.createdBy,
      createdByLabel: note.createdBy ? createdByLabels.get(note.createdBy) ?? 'Admin' : 'System',
      createdAt: note.createdAt.toISOString(),
    })),
    deliveryAttempts: shipment.deliveryAttempts.map((attempt) => ({
      id: attempt.id,
      attemptAt: attempt.attemptAt.toISOString(),
      status: attempt.status,
      reason: attempt.reason,
      location: attempt.location,
    })),
  };
}
