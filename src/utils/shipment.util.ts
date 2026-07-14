import { ShipmentStatus, ShippingMethod } from '@prisma/client';
import type { Prisma } from '@prisma/client';

const DEFAULT_ESTIMATED_DELIVERY_DAYS = 5;

const SHIPPING_METHOD_DAYS: Record<ShippingMethod, number> = {
  STANDARD: 5,
  EXPRESS: 2,
  SAME_DAY: 0,
  NEXT_DAY: 1,
};

export function generateShipmentNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SHP-${timestamp}-${random}`;
}

export async function generateAyariTrackingNumber(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const year = new Date().getFullYear();
  const sequence = await tx.trackingNumberSequence.upsert({
    where: { year },
    create: { year, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `AYR-${year}-${String(sequence.lastNumber).padStart(6, '0')}`;
}

export function generateTrackingNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 999999) + 1;
  return `AYR-${year}-${String(random).padStart(6, '0')}`;
}

export function inferShippingMethod(shippingAmount: number): ShippingMethod {
  if (shippingAmount >= 499) return ShippingMethod.EXPRESS;
  if (shippingAmount === 0) return ShippingMethod.STANDARD;
  return ShippingMethod.STANDARD;
}

export function calculateEstimatedDelivery(
  fromDate = new Date(),
  method: ShippingMethod = ShippingMethod.STANDARD,
): Date {
  const days = SHIPPING_METHOD_DAYS[method] ?? DEFAULT_ESTIMATED_DELIVERY_DAYS;
  const eta = new Date(fromDate);
  eta.setDate(eta.getDate() + days);
  eta.setHours(18, 0, 0, 0);
  return eta;
}

export function buildTrackingUrl(template: string | null, trackingNumber: string): string | null {
  if (!template) return null;
  return template.replace('{trackingNumber}', encodeURIComponent(trackingNumber));
}

const TERMINAL_STATUSES: ShipmentStatus[] = [ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED, ShipmentStatus.RETURNED];

const ALLOWED_TRANSITIONS: Record<ShipmentStatus, ShipmentStatus[]> = {
  [ShipmentStatus.PENDING]: [ShipmentStatus.CONFIRMED, ShipmentStatus.CANCELLED],
  [ShipmentStatus.CONFIRMED]: [ShipmentStatus.PACKING, ShipmentStatus.CANCELLED],
  [ShipmentStatus.PACKING]: [ShipmentStatus.PACKED, ShipmentStatus.CANCELLED],
  [ShipmentStatus.PACKED]: [ShipmentStatus.READY_FOR_PICKUP, ShipmentStatus.CANCELLED],
  [ShipmentStatus.READY_FOR_PICKUP]: [ShipmentStatus.PICKED_UP, ShipmentStatus.CANCELLED],
  [ShipmentStatus.PICKED_UP]: [ShipmentStatus.IN_TRANSIT, ShipmentStatus.CANCELLED],
  [ShipmentStatus.IN_TRANSIT]: [ShipmentStatus.REACHED_HUB, ShipmentStatus.CANCELLED],
  [ShipmentStatus.REACHED_HUB]: [ShipmentStatus.OUT_FOR_DELIVERY, ShipmentStatus.CANCELLED],
  [ShipmentStatus.OUT_FOR_DELIVERY]: [
    ShipmentStatus.DELIVERED,
    ShipmentStatus.RETURNED,
    ShipmentStatus.CANCELLED,
  ],
  [ShipmentStatus.DELIVERED]: [ShipmentStatus.RETURNED],
  [ShipmentStatus.CANCELLED]: [],
  [ShipmentStatus.RETURNED]: [],
};

export function isTerminalShipmentStatus(status: ShipmentStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function canTransitionShipmentStatus(from: ShipmentStatus, to: ShipmentStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getShipmentStatusDescription(status: ShipmentStatus): string {
  return {
    PENDING: 'Shipment created and awaiting confirmation',
    CONFIRMED: 'Shipment confirmed and queued for packing',
    PACKING: 'Order is being packed',
    PACKED: 'Order has been packed',
    READY_FOR_PICKUP: 'Package is ready for courier pickup',
    PICKED_UP: 'Package picked up by courier',
    IN_TRANSIT: 'Package is in transit',
    REACHED_HUB: 'Package reached sorting hub',
    OUT_FOR_DELIVERY: 'Package is out for delivery',
    DELIVERED: 'Package delivered successfully',
    CANCELLED: 'Shipment cancelled',
    RETURNED: 'Package returned',
  }[status];
}
