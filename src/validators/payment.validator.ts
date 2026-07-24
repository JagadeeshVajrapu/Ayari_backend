import { z } from 'zod';

const shippingSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(10),
  street: z.string().min(5),
  city: z.string().min(2),
  state: z.string().min(1),
  zipCode: z.string().regex(/^\d{6}$/),
  country: z.string().default('IN'),
});

const lineItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  quantity: z.number().int().positive(),
});

export const createPaymentOrderSchema = z.object({
  items: z.array(lineItemSchema).min(1),
  shipping: shippingSchema,
  paymentMethod: z.enum(['razorpay', 'cod']),
  shippingMethod: z.enum(['standard', 'express']),
  orderNotes: z.string().max(500).optional(),
  couponCode: z.string().optional(),
  saveAddress: z.boolean().optional(),
});

export const verifyRazorpayPaymentSchema = z.object({
  orderId: z.string().min(1),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export type CreatePaymentOrderInput = z.infer<typeof createPaymentOrderSchema>;
export type VerifyRazorpayPaymentInput = z.infer<typeof verifyRazorpayPaymentSchema>;
