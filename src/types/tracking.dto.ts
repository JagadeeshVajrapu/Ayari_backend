import { OrderStatus, PaymentMethod, PaymentStatus, ShipmentStatus } from '@prisma/client';

export type TimelineStepKey =
  | 'ORDER_PLACED'
  | 'PAYMENT_SUCCESSFUL'
  | 'ORDER_CONFIRMED'
  | 'SELLER_ACCEPTED'
  | 'PACKING_STARTED'
  | 'PACKED'
  | 'READY_FOR_PICKUP'
  | 'COURIER_ASSIGNED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'REACHED_DESTINATION_HUB'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED'
  | 'REFUND_INITIATED'
  | 'REFUND_COMPLETED';

export type TimelineStepState = 'completed' | 'current' | 'upcoming' | 'skipped';

export interface TrackingTimelineStepDto {
  key: TimelineStepKey;
  label: string;
  description: string;
  state: TimelineStepState;
  date: string | null;
  time: string | null;
  location: string | null;
  updatedBy: string | null;
  icon: string;
}

export interface TrackingHistoryItemDto {
  id: string;
  status: string;
  statusLabel: string;
  description: string | null;
  location: string | null;
  updatedBy: string | null;
  eventAt: string;
  date: string;
  time: string;
}

export interface OrderTrackingAddressDto {
  recipientName: string;
  phone: string | null;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface OrderTrackingPaymentDto {
  method: PaymentMethod;
  methodLabel: string;
  status: PaymentStatus;
  statusLabel: string;
  transactionId: string | null;
  paidAmount: number;
  paymentDate: string | null;
}

export interface OrderTrackingItemDto {
  id: string;
  productName: string;
  productSku: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface OrderTrackingSummaryDto {
  items: OrderTrackingItemDto[];
  subtotal: number;
  discount: number;
  tax: number;
  shippingCharges: number;
  grandTotal: number;
}

export interface ShipmentTrackingDetailsDto {
  id: string;
  shipmentNumber: string;
  courierPartner: string;
  trackingNumber: string;
  trackingUrl: string | null;
  packageWeight: string | null;
  packageDimensions: string | null;
  estimatedDelivery: string;
  shippingMethod: string;
  warehouse: string | null;
  status: ShipmentStatus;
  statusLabel: string;
}

export interface CurrentStatusCardDto {
  orderNumber: string;
  currentStatus: string;
  statusDescription: string;
  estimatedDelivery: string | null;
  lastUpdated: string | null;
  currentLocation: string | null;
  progressPercent: number;
}

export interface OrderTrackingDto {
  orderId: string;
  orderNumber: string;
  orderDate: string;
  estimatedDelivery: string | null;
  orderStatus: OrderStatus;
  orderStatusLabel: string;
  paymentStatus: PaymentStatus;
  paymentStatusLabel: string;
  shipmentStatus: ShipmentStatus | null;
  shipmentStatusLabel: string | null;
  courierPartner: string | null;
  trackingNumber: string | null;
  deliveryInstructions: string | null;
  customerName: string;
  customerPhone: string | null;
  shippingAddress: OrderTrackingAddressDto;
  currentStatus: CurrentStatusCardDto;
  shipment: ShipmentTrackingDetailsDto | null;
  summary: OrderTrackingSummaryDto;
  payment: OrderTrackingPaymentDto;
  timeline: TrackingTimelineStepDto[];
}

export interface TrackingHistoryResponseDto {
  items: TrackingHistoryItemDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface OrderStatusHistoryResponseDto {
  orderId: string;
  orderNumber: string;
  items: TrackingHistoryItemDto[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
