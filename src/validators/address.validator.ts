import { z } from 'zod';

export const addressInputSchema = z.object({
  firstName: z.string().min(1).max(80).trim(),
  lastName: z.string().min(1).max(80).trim(),
  street: z.string().min(5).max(200).trim(),
  city: z.string().min(2).max(80).trim(),
  state: z.string().min(1).max(80).trim(),
  zipCode: z.string().regex(/^\d{6}$/),
  country: z.string().min(2).max(2).default('IN'),
  phone: z.string().min(10).max(15).trim().optional(),
  isDefault: z.boolean().optional(),
  type: z.enum(['SHIPPING', 'BILLING']).optional(),
});

export const updateAddressSchema = addressInputSchema.partial();

export type AddressInput = z.infer<typeof addressInputSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
