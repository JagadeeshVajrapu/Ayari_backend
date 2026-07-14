import { PaymentMethod, PaymentStatus, UserRole } from '@prisma/client';
import { ORDER_STATUS_LABELS } from '../utils/serialize.util';
import { SHIPMENT_STATUS_LABELS } from '../types/shipment.dto';
import type {
  OrderStatusHistoryResponseDto,
  OrderTrackingDto,
  TrackingHistoryItemDto,
  TrackingHistoryResponseDto,
} from '../types/tracking.dto';
import { trackingRepository } from '../repositories/tracking.repository';
import { NotFoundError } from '../utils/appError.util';
import {
  buildTrackingTimeline,
  calculateProgressPercent,
  inferShippingMethod,
} from '../utils/tracking.timeline.util';
import type { TrackingHistoryPaginationInput } from '../validators/tracking.validator';

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CREDIT_CARD: 'Credit Card',
  DEBIT_CARD: 'Debit Card',
  UPI: 'UPI',
  NET_BANKING: 'Net Banking',
  WALLET: 'Wallet',
  COD: 'Cash on Delivery',
  RAZORPAY: 'Razorpay',
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: 'Pending',
  AUTHORIZED: 'Authorized',
  CAPTURED: 'Paid',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
  PARTIALLY_REFUNDED: 'Partially Refunded',
};

function formatHistoryItem(params: {
  id: string;
  status: string;
  statusLabel: string;
  description: string | null;
  location: string | null;
  updatedBy: string | null;
  eventAt: Date;
}): TrackingHistoryItemDto {
  const date = params.eventAt.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const time = params.eventAt.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return {
    id: params.id,
    status: params.status,
    statusLabel: params.statusLabel,
    description: params.description,
    location: params.location,
    updatedBy: params.updatedBy,
    eventAt: params.eventAt.toISOString(),
    date,
    time,
  };
}

export class TrackingService {
  async getOrderTracking(orderId: string, userId: string, role: UserRole): Promise<OrderTrackingDto> {
    await trackingRepository.assertOrderAccess(orderId, userId, role);

    const order = await trackingRepository.findOrderForTracking(orderId);
    if (!order) throw new NotFoundError('Order not found');

    const shipment = order.shipment;
    const createdByIds = shipment?.statusHistory.map((h) => h.createdBy ?? '') ?? [];
    const labelMap = await trackingRepository.resolveUpdatedByLabels(createdByIds);

    const statusHistory = (shipment?.statusHistory ?? []).map((entry) => ({
      status: entry.status,
      note: entry.note,
      location: entry.location,
      createdBy: entry.createdBy,
      createdAt: entry.createdAt,
      updatedByLabel: entry.createdBy ? labelMap.get(entry.createdBy) ?? 'Logistics' : 'System',
    }));

    const timeline = buildTrackingTimeline({
      orderCreatedAt: order.createdAt,
      orderPlacedAt: order.placedAt,
      orderStatus: order.status,
      paymentStatus: order.payment?.status ?? PaymentStatus.PENDING,
      paymentPaidAt: order.payment?.paidAt ?? null,
      shipmentStatus: shipment?.status ?? null,
      shipmentCreatedAt: shipment?.createdAt ?? null,
      courierAssignedAt: shipment?.createdAt ?? null,
      statusHistory,
    });

    const currentStep = timeline.find((s) => s.state === 'current') ?? timeline[timeline.length - 1];
    const latestHistory = shipment?.statusHistory[shipment.statusHistory.length - 1];
    const latestTracking = shipment?.trackingEvents[0];

    const customerName = `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`.trim();
    const payment = order.payment;

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderDate: (order.placedAt ?? order.createdAt).toISOString(),
      estimatedDelivery: shipment?.estimatedDelivery.toISOString() ?? null,
      orderStatus: order.status,
      orderStatusLabel: ORDER_STATUS_LABELS[order.status],
      paymentStatus: payment?.status ?? PaymentStatus.PENDING,
      paymentStatusLabel: PAYMENT_STATUS_LABELS[payment?.status ?? PaymentStatus.PENDING],
      shipmentStatus: shipment?.status ?? null,
      shipmentStatusLabel: shipment ? SHIPMENT_STATUS_LABELS[shipment.status] : null,
      courierPartner: shipment?.courierPartner.name ?? null,
      trackingNumber: shipment?.trackingNumber ?? null,
      deliveryInstructions: order.notes,
      customerName,
      customerPhone: order.shippingAddress.phone ?? order.user.phone,
      shippingAddress: {
        recipientName: customerName,
        phone: order.shippingAddress.phone ?? order.user.phone,
        street: order.shippingAddress.street,
        city: order.shippingAddress.city,
        state: order.shippingAddress.state,
        postalCode: order.shippingAddress.zipCode,
        country: order.shippingAddress.country,
      },
      currentStatus: {
        orderNumber: order.orderNumber,
        currentStatus: currentStep?.label ?? ORDER_STATUS_LABELS[order.status],
        statusDescription: currentStep?.description ?? 'Tracking updates will appear here',
        estimatedDelivery: shipment?.estimatedDelivery.toISOString() ?? null,
        lastUpdated: (latestTracking?.eventAt ?? latestHistory?.createdAt ?? order.updatedAt).toISOString(),
        currentLocation: latestTracking?.location ?? latestHistory?.location ?? null,
        progressPercent: calculateProgressPercent(currentStep?.key ?? 'ORDER_PLACED'),
      },
      shipment: shipment
        ? {
            id: shipment.id,
            shipmentNumber: shipment.shipmentNumber,
            courierPartner: shipment.courierPartner.name,
            trackingNumber: shipment.trackingNumber,
            trackingUrl: trackingRepository.buildTrackingUrlForShipment(shipment),
            packageWeight: null,
            packageDimensions: null,
            estimatedDelivery: shipment.estimatedDelivery.toISOString(),
            shippingMethod: inferShippingMethod(Number(order.shippingAmount)),
            warehouse: latestHistory?.location ?? 'Ayari Fulfillment Center',
            status: shipment.status,
            statusLabel: SHIPMENT_STATUS_LABELS[shipment.status],
          }
        : null,
      summary: {
        items: order.items.map((item) => ({
          id: item.id,
          productName: item.productName,
          productSku: item.productSku,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          totalPrice: Number(item.totalPrice),
        })),
        subtotal: Number(order.subtotal),
        discount: Number(order.discountAmount),
        tax: Number(order.taxAmount),
        shippingCharges: Number(order.shippingAmount),
        grandTotal: Number(order.totalAmount),
      },
      payment: {
        method: payment?.paymentMethod ?? PaymentMethod.RAZORPAY,
        methodLabel: PAYMENT_METHOD_LABELS[payment?.paymentMethod ?? PaymentMethod.RAZORPAY],
        status: payment?.status ?? PaymentStatus.PENDING,
        statusLabel: PAYMENT_STATUS_LABELS[payment?.status ?? PaymentStatus.PENDING],
        transactionId: payment?.transactionId ?? null,
        paidAmount: Number(payment?.amount ?? order.totalAmount),
        paymentDate: payment?.paidAt?.toISOString() ?? null,
      },
      timeline,
    };
  }

  async getShipmentHistory(
    shipmentId: string,
    userId: string,
    role: UserRole,
    params: TrackingHistoryPaginationInput,
  ): Promise<TrackingHistoryResponseDto> {
    await trackingRepository.assertShipmentAccess(shipmentId, userId, role);

    const { events, total } = await trackingRepository.getShipmentTrackingHistory(
      shipmentId,
      params.page,
      params.limit,
    );

    const items = events.map((event) =>
      formatHistoryItem({
        id: event.id,
        status: event.status,
        statusLabel: SHIPMENT_STATUS_LABELS[event.status],
        description: event.description,
        location: event.location,
        updatedBy: 'Logistics',
        eventAt: event.eventAt,
      }),
    );

    return {
      items,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }

  async getOrderStatusHistory(
    orderId: string,
    userId: string,
    role: UserRole,
    params: TrackingHistoryPaginationInput,
  ): Promise<OrderStatusHistoryResponseDto> {
    await trackingRepository.assertOrderAccess(orderId, userId, role);

    const order = await trackingRepository.findOrderForTracking(orderId);
    if (!order) throw new NotFoundError('Order not found');

    const { events, total } = await trackingRepository.getOrderStatusHistoryRecords(
      orderId,
      params.page,
      params.limit,
    );

    const labelMap = await trackingRepository.resolveUpdatedByLabels(
      events.map((e) => e.createdBy ?? ''),
    );

    const items = events.map((event) =>
      formatHistoryItem({
        id: event.id,
        status: event.status,
        statusLabel: SHIPMENT_STATUS_LABELS[event.status],
        description: event.note,
        location: event.location,
        updatedBy: event.createdBy ? labelMap.get(event.createdBy) ?? 'Logistics' : 'System',
        eventAt: event.createdAt,
      }),
    );

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      items,
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        totalPages: Math.ceil(total / params.limit),
      },
    };
  }
}

export const trackingService = new TrackingService();
