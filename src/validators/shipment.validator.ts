import { z } from 'zod';
import { ShipmentNoteType, ShipmentStatus } from '@prisma/client';

export const shipmentPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  status: z.nativeEnum(ShipmentStatus).optional(),
  courierPartnerId: z.string().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  sortBy: z.enum(['createdAt', 'estimatedDelivery', 'status', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const createCourierPartnerSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  code: z.string().min(1).max(50).trim().toUpperCase(),
  contactPerson: z.string().max(100).trim().optional(),
  phone: z.string().max(20).trim().optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
  trackingUrlTemplate: z.string().max(500).trim().optional(),
  isActive: z.boolean().default(true),
});

export const updateCourierPartnerSchema = createCourierPartnerSchema.partial();

export const updateShipmentSchema = z.object({
  courierPartnerId: z.string().min(1).optional(),
  trackingNumber: z.string().min(1).max(100).trim().optional(),
  estimatedDelivery: z.coerce.date().optional(),
  warehouse: z.string().max(200).trim().optional(),
  packageWeight: z.string().max(50).trim().optional(),
  packageDimensions: z.string().max(100).trim().optional(),
});

export const updateShipmentStatusSchema = z.object({
  status: z.nativeEnum(ShipmentStatus),
  note: z.string().max(500).trim().optional(),
  location: z.string().max(200).trim().optional(),
  warehouse: z.string().max(200).trim().optional(),
});

export const addShipmentTrackingEventSchema = z.object({
  status: z.nativeEnum(ShipmentStatus),
  location: z.string().max(200).trim().optional(),
  description: z.string().max(500).trim().optional(),
  eventAt: z.coerce.date().optional(),
});

export const addShipmentNoteSchema = z.object({
  type: z.nativeEnum(ShipmentNoteType).default(ShipmentNoteType.GENERAL),
  content: z.string().min(1).max(1000).trim(),
});

export const assignCourierSchema = z.object({
  courierPartnerId: z.string().min(1),
  location: z.string().max(200).trim().optional(),
});

export const adminActionSchema = z.object({
  action: z.enum([
    'ACCEPT_ORDER',
    'REJECT_ORDER',
    'START_PACKING',
    'MARK_PACKED',
    'READY_FOR_PICKUP',
    'ASSIGN_COURIER',
    'GENERATE_TRACKING',
    'PICKED_UP',
    'IN_TRANSIT',
    'REACHED_HUB',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCEL',
    'RETURN',
    'APPROVE_RETURN',
    'REJECT_RETURN',
    'INITIATE_REFUND',
    'COMPLETE_REFUND',
  ]),
  courierPartnerId: z.string().optional(),
  note: z.string().max(500).optional(),
  location: z.string().max(200).optional(),
});

export type ShipmentPaginationInput = z.infer<typeof shipmentPaginationSchema>;
export type CreateCourierPartnerInput = z.infer<typeof createCourierPartnerSchema>;
export type UpdateCourierPartnerInput = z.infer<typeof updateCourierPartnerSchema>;
export type UpdateShipmentInput = z.infer<typeof updateShipmentSchema>;
export type UpdateShipmentStatusInput = z.infer<typeof updateShipmentStatusSchema>;
export type AddShipmentTrackingEventInput = z.infer<typeof addShipmentTrackingEventSchema>;
export type AddShipmentNoteInput = z.infer<typeof addShipmentNoteSchema>;
export type AssignCourierInput = z.infer<typeof assignCourierSchema>;
export type AdminActionInput = z.infer<typeof adminActionSchema>;
