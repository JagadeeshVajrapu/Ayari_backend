import { ShipmentStatus, ShippingMethod } from '@prisma/client';

export interface CourierPartnerDto {
  id: string;
  name: string;
  code: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logoUrl: string | null;
  trackingUrlTemplate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentStatusHistoryDto {
  id: string;
  status: ShipmentStatus;
  note: string | null;
  location: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface ShipmentTrackingDto {
  id: string;
  status: ShipmentStatus;
  location: string | null;
  description: string | null;
  eventAt: string;
  createdAt: string;
}

export interface ShipmentDto {
  id: string;
  shipmentNumber: string;
  orderId: string;
  orderNumber: string;
  courierPartnerId: string;
  courierName: string;
  trackingNumber: string;
  trackingUrl: string | null;
  estimatedDelivery: string;
  status: ShipmentStatus;
  createdAt: string;
  updatedAt: string;
  shiprocketOrderId?: string | null;
  shiprocketShipmentId?: string | null;
  awbNumber?: string | null;
  shippingLabelUrl?: string | null;
  pickupStatus?: string | null;
  deliveryStatus?: string | null;
  deliveredAt?: string | null;
  invoiceUrl?: string | null;
  statusHistory?: ShipmentStatusHistoryDto[];
  trackingEvents?: ShipmentTrackingDto[];
}

export interface ShipmentListItemDto {
  id: string;
  shipmentNumber: string;
  orderId: string;
  orderNumber: string;
  courierName: string;
  courierPartnerId: string;
  trackingNumber: string;
  estimatedDelivery: string;
  status: ShipmentStatus;
  customerName: string;
  customerPhone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentDashboardStatsDto {
  total: number;
  pending: number;
  confirmed: number;
  packing: number;
  packed: number;
  readyForPickup: number;
  pickedUp: number;
  inTransit: number;
  reachedHub: number;
  outForDelivery: number;
  delivered: number;
  cancelled: number;
  returned: number;
  refundPending: number;
  refundCompleted: number;
}

export interface ShipmentNoteDto {
  id: string;
  type: string;
  content: string;
  createdBy: string | null;
  createdByLabel: string | null;
  createdAt: string;
}

export interface AdminShipmentDetailDto extends ShipmentDto {
  shippingMethod: ShippingMethod;
  warehouse: string | null;
  packageWeight: string | null;
  packageDimensions: string | null;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string;
  shippingAddress: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  order: {
    status: string;
    placedAt: string | null;
    subtotal: number;
    discount: number;
    tax: number;
    shippingCharges: number;
    total: number;
    notes: string | null;
    items: Array<{
      id: string;
      productName: string;
      productSku: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }>;
    payment: {
      method: string;
      status: string;
      transactionId: string | null;
      amount: number;
      paidAt: string | null;
    } | null;
  };
  notes: ShipmentNoteDto[];
  deliveryAttempts: Array<{
    id: string;
    attemptAt: string;
    status: string;
    reason: string | null;
    location: string | null;
  }>;
}

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  PACKING: 'Packing',
  PACKED: 'Packed',
  READY_FOR_PICKUP: 'Ready For Pickup',
  PICKED_UP: 'Picked Up',
  IN_TRANSIT: 'In Transit',
  REACHED_HUB: 'Reached Hub',
  OUT_FOR_DELIVERY: 'Out For Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};
