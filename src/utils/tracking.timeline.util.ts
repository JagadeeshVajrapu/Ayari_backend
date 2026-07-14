import { OrderStatus, PaymentStatus, ShipmentStatus } from '@prisma/client';
import type { TimelineStepKey, TimelineStepState, TrackingTimelineStepDto } from '../types/tracking.dto';

interface TimelineBuildInput {
  orderCreatedAt: Date;
  orderPlacedAt: Date | null;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentPaidAt: Date | null;
  shipmentStatus: ShipmentStatus | null;
  shipmentCreatedAt: Date | null;
  courierAssignedAt: Date | null;
  statusHistory: Array<{
    status: ShipmentStatus;
    note: string | null;
    location: string | null;
    createdBy: string | null;
    createdAt: Date;
    updatedByLabel: string | null;
  }>;
}

const TIMELINE_FLOW: TimelineStepKey[] = [
  'ORDER_PLACED',
  'PAYMENT_SUCCESSFUL',
  'ORDER_CONFIRMED',
  'SELLER_ACCEPTED',
  'PACKING_STARTED',
  'PACKED',
  'READY_FOR_PICKUP',
  'COURIER_ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'REACHED_DESTINATION_HUB',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

const STEP_META: Record<
  TimelineStepKey,
  { label: string; description: string; icon: string; shipmentStatus?: ShipmentStatus }
> = {
  ORDER_PLACED: { label: 'Order Placed', description: 'Your order has been placed successfully', icon: 'shopping-bag' },
  PAYMENT_SUCCESSFUL: { label: 'Payment Successful', description: 'Payment has been received', icon: 'credit-card' },
  ORDER_CONFIRMED: { label: 'Order Confirmed', description: 'Your order has been confirmed', icon: 'check-circle' },
  SELLER_ACCEPTED: { label: 'Seller Accepted', description: 'Seller has accepted your order', icon: 'store' },
  PACKING_STARTED: { label: 'Packing Started', description: 'Your items are being packed', icon: 'package-open', shipmentStatus: 'PACKING' },
  PACKED: { label: 'Packed', description: 'Your order has been packed', icon: 'package', shipmentStatus: 'PACKED' },
  READY_FOR_PICKUP: { label: 'Ready For Pickup', description: 'Package is ready for courier pickup', icon: 'clock', shipmentStatus: 'READY_FOR_PICKUP' },
  COURIER_ASSIGNED: { label: 'Courier Assigned', description: 'Courier partner has been assigned', icon: 'truck' },
  PICKED_UP: { label: 'Picked Up', description: 'Package picked up by courier', icon: 'truck', shipmentStatus: 'PICKED_UP' },
  IN_TRANSIT: { label: 'In Transit', description: 'Package is on the way', icon: 'navigation', shipmentStatus: 'IN_TRANSIT' },
  REACHED_DESTINATION_HUB: { label: 'Reached Destination Hub', description: 'Package arrived at destination hub', icon: 'building', shipmentStatus: 'REACHED_HUB' },
  OUT_FOR_DELIVERY: { label: 'Out For Delivery', description: 'Package is out for delivery', icon: 'map-pin', shipmentStatus: 'OUT_FOR_DELIVERY' },
  DELIVERED: { label: 'Delivered', description: 'Package delivered successfully', icon: 'check', shipmentStatus: 'DELIVERED' },
  CANCELLED: { label: 'Cancelled', description: 'Order has been cancelled', icon: 'x-circle' },
  RETURNED: { label: 'Returned', description: 'Package has been returned', icon: 'rotate-ccw', shipmentStatus: 'RETURNED' },
  REFUND_INITIATED: { label: 'Refund Initiated', description: 'Refund process has been initiated', icon: 'refresh-cw' },
  REFUND_COMPLETED: { label: 'Refund Completed', description: 'Refund has been completed', icon: 'wallet' },
};

const SHIPMENT_STATUS_ORDER: ShipmentStatus[] = [
  'PENDING',
  'CONFIRMED',
  'PACKING',
  'PACKED',
  'READY_FOR_PICKUP',
  'PICKED_UP',
  'IN_TRANSIT',
  'REACHED_HUB',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

function formatDateParts(date: Date) {
  return {
    date: date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
    iso: date.toISOString(),
  };
}

function shipmentRank(status: ShipmentStatus | null): number {
  if (!status) return -1;
  return SHIPMENT_STATUS_ORDER.indexOf(status);
}

function resolveCurrentStepKey(input: TimelineBuildInput): TimelineStepKey {
  if (input.orderStatus === OrderStatus.CANCELLED) return 'CANCELLED';
  if (input.orderStatus === OrderStatus.REFUNDED) return 'REFUND_COMPLETED';
  if (input.paymentStatus === PaymentStatus.REFUNDED || input.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED) {
    return 'REFUND_INITIATED';
  }
  if (input.shipmentStatus === ShipmentStatus.RETURNED) return 'RETURNED';
  if (input.shipmentStatus === ShipmentStatus.DELIVERED) return 'DELIVERED';
  if (input.shipmentStatus === ShipmentStatus.CANCELLED) return 'CANCELLED';

  if (input.shipmentStatus) {
    const entry = Object.entries(STEP_META).find(([, meta]) => meta.shipmentStatus === input.shipmentStatus);
    if (entry) return entry[0] as TimelineStepKey;
    if (input.shipmentStatus === ShipmentStatus.CONFIRMED) return 'SELLER_ACCEPTED';
  }

  if (input.orderStatus === OrderStatus.CONFIRMED || input.orderStatus === OrderStatus.PROCESSING) {
    return input.shipmentStatus ? 'SELLER_ACCEPTED' : 'ORDER_CONFIRMED';
  }
  if (input.paymentStatus === PaymentStatus.CAPTURED) return 'PAYMENT_SUCCESSFUL';
  return 'ORDER_PLACED';
}

function findHistoryForStatus(
  history: TimelineBuildInput['statusHistory'],
  status: ShipmentStatus,
) {
  return [...history].reverse().find((h) => h.status === status);
}

function getStepTimestamp(
  key: TimelineStepKey,
  input: TimelineBuildInput,
): { at: Date | null; location: string | null; updatedBy: string | null } {
  switch (key) {
    case 'ORDER_PLACED':
      return { at: input.orderPlacedAt ?? input.orderCreatedAt, location: null, updatedBy: 'System' };
    case 'PAYMENT_SUCCESSFUL':
      return { at: input.paymentPaidAt, location: null, updatedBy: 'Payment Gateway' };
    case 'ORDER_CONFIRMED':
      return { at: input.orderPlacedAt, location: null, updatedBy: 'System' };
    case 'SELLER_ACCEPTED': {
      const h = findHistoryForStatus(input.statusHistory, ShipmentStatus.CONFIRMED);
      return { at: h?.createdAt ?? input.shipmentCreatedAt, location: h?.location ?? null, updatedBy: h?.updatedByLabel ?? 'Seller' };
    }
    case 'COURIER_ASSIGNED':
      return { at: input.courierAssignedAt ?? input.shipmentCreatedAt, location: null, updatedBy: 'Logistics' };
    case 'CANCELLED': {
      const h = findHistoryForStatus(input.statusHistory, ShipmentStatus.CANCELLED);
      return { at: h?.createdAt ?? null, location: h?.location ?? null, updatedBy: h?.updatedByLabel ?? 'System' };
    }
    case 'RETURNED': {
      const h = findHistoryForStatus(input.statusHistory, ShipmentStatus.RETURNED);
      return { at: h?.createdAt ?? null, location: h?.location ?? null, updatedBy: h?.updatedByLabel ?? 'Logistics' };
    }
    case 'REFUND_INITIATED':
    case 'REFUND_COMPLETED':
      return { at: input.paymentPaidAt, location: null, updatedBy: 'Finance' };
    default: {
      const meta = STEP_META[key];
      if (!meta.shipmentStatus) return { at: null, location: null, updatedBy: null };
      const h = findHistoryForStatus(input.statusHistory, meta.shipmentStatus);
      return { at: h?.createdAt ?? null, location: h?.location ?? null, updatedBy: h?.updatedByLabel ?? 'Logistics' };
    }
  }
}

export function buildTrackingTimeline(input: TimelineBuildInput): TrackingTimelineStepDto[] {
  const currentKey = resolveCurrentStepKey(input);
  const currentFlowIndex = TIMELINE_FLOW.indexOf(currentKey);
  const isException = ['CANCELLED', 'RETURNED', 'REFUND_INITIATED', 'REFUND_COMPLETED'].includes(currentKey);

  const stepsToRender = isException ? [...TIMELINE_FLOW.slice(0, Math.max(currentFlowIndex, 3)), currentKey] : TIMELINE_FLOW;

  return stepsToRender.map((key, index) => {
    const meta = STEP_META[key];
    const timestamp = getStepTimestamp(key, input);
    const parts = timestamp.at ? formatDateParts(timestamp.at) : null;

    let state: TimelineStepState = 'upcoming';
    if (isException && key === currentKey) {
      state = 'current';
    } else if (!isException) {
      const stepIndex = TIMELINE_FLOW.indexOf(key);
      if (stepIndex < currentFlowIndex) state = 'completed';
      else if (stepIndex === currentFlowIndex) state = 'current';
      else state = 'upcoming';
    } else if (timestamp.at) {
      state = 'completed';
    } else if (index === stepsToRender.length - 1) {
      state = 'current';
    }

    if (key === 'PAYMENT_SUCCESSFUL' && input.paymentStatus === PaymentStatus.PENDING) {
      state = 'upcoming';
    }

    return {
      key,
      label: meta.label,
      description: meta.description,
      state,
      date: parts?.date ?? null,
      time: parts?.time ?? null,
      location: timestamp.location,
      updatedBy: timestamp.updatedBy,
      icon: meta.icon,
    };
  });
}

export function calculateProgressPercent(currentKey: TimelineStepKey): number {
  const index = TIMELINE_FLOW.indexOf(currentKey);
  if (index < 0) return currentKey === 'DELIVERED' ? 100 : 0;
  return Math.round(((index + 1) / TIMELINE_FLOW.length) * 100);
}

export function inferShippingMethod(shippingAmount: number): string {
  return shippingAmount >= 400 ? 'Express Delivery' : 'Standard Delivery';
}

export { STEP_META, TIMELINE_FLOW, shipmentRank };
