import { z } from 'zod';
import { OrderStatus } from '@prisma/client';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
});

const imageUrlSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      value.startsWith('/uploads/') ||
      value.startsWith('http://') ||
      value.startsWith('https://'),
    { message: 'Image URL must be absolute or an /uploads path' },
  );

const imageInputSchema = z.object({
  id: z.string().optional(),
  url: imageUrlSchema,
  cloudinaryPublicId: z.string().min(1).optional(),
  folder: z.string().max(300).trim().optional(),
  altText: z.string().max(200).trim().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isPrimary: z.boolean().optional(),
});

const colorVariantSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(80).trim(),
  hex: z.string().max(20).trim().optional(),
  imageUrl: z.string().min(1).optional(),
  price: z.coerce.number().positive().optional(),
  compareAtPrice: z.coerce.number().positive().optional(),
});

const setVariantSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(100).trim(),
  label: z.string().max(200).trim().optional(),
  price: z.coerce.number().positive().optional(),
  compareAtPrice: z.coerce.number().positive().optional(),
});

const variantTypeSchema = z.enum([
  'COLOR',
  'SIZE',
  'SET',
  'STORAGE',
  'RAM',
  'WEIGHT',
  'MATERIAL',
  'BUNDLE',
  'EDITION',
  'OTHER',
]);

const productVariantInputSchema = z.object({
  id: z.string().min(1).optional(),
  sku: z.string().min(1).max(50).trim(),
  name: z.string().min(1).max(80).trim(),
  colorHex: z.string().max(20).trim().optional(),
  variantType: variantTypeSchema.default('COLOR'),
  price: z.coerce.number().positive().optional(),
  compareAtPrice: z.coerce.number().positive().optional(),
  stockQuantity: z.coerce.number().int().min(0).default(0),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  productImages: z.array(imageInputSchema).min(1).max(10),
  galleryImages: z.array(imageInputSchema).max(20).default([]),
});

const productBaseSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  description: z.string().max(5000).trim().optional(),
  sku: z.string().min(1).max(50).trim(),
  price: z.coerce.number().positive(),
  compareAtPrice: z.coerce.number().positive().optional(),
  stockQuantity: z.coerce.number().int().min(0).default(0),
  lowStockThreshold: z.coerce.number().int().min(0).default(5),
  categoryId: z.string().min(1),
  sizes: z.array(z.string().min(1).max(30).trim()).max(20).default([]),
  colorVariants: z.array(colorVariantSchema).max(20).default([]),
  setVariants: z.array(setVariantSchema).max(20).default([]),
  variants: z.array(productVariantInputSchema).max(30).default([]),
  productImages: z.array(imageInputSchema).max(10).default([]),
  featuredImages: z.array(imageInputSchema).max(20).default([]),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
});

function validateProductImagesOrVariants(
  data: { productImages?: { url: string }[]; variants?: { productImages: { url: string }[] }[] },
  ctx: z.RefinementCtx,
) {
  const hasProductImages = (data.productImages?.length ?? 0) > 0;
  const hasVariantImages = (data.variants ?? []).some((v) => v.productImages.length > 0);
  if (!hasProductImages && !hasVariantImages) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Add at least one product image or variant images',
      path: ['productImages'],
    });
  }
}

function validateMrpAbovePrice(
  data: { price?: number; compareAtPrice?: number },
  ctx: z.RefinementCtx,
) {
  if (data.compareAtPrice != null && data.price != null && data.compareAtPrice <= data.price) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'M.R.P. must be higher than discount price',
      path: ['compareAtPrice'],
    });
  }
}

export const createProductSchema = productBaseSchema
  .superRefine(validateMrpAbovePrice)
  .superRefine(validateProductImagesOrVariants);

export const updateProductSchema = productBaseSchema
  .partial()
  .superRefine(validateMrpAbovePrice)
  .superRefine(validateProductImagesOrVariants);

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100).trim(),
  description: z.string().max(500).trim().optional(),
  imageUrl: z.string().url().optional(),
  sortOrder: z.coerce.number().int().default(0),
  isActive: z.boolean().default(true),
});

export const updateCategorySchema = createCategorySchema.partial();

export const updateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
});

export const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

export const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(50).trim().optional(),
  lastName: z.string().min(1).max(50).trim().optional(),
  phone: z.string().max(20).trim().nullable().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductImageInput = z.infer<typeof imageInputSchema>;
export type ColorVariantInput = z.infer<typeof colorVariantSchema>;
export type SetVariantInput = z.infer<typeof setVariantSchema>;
export type ProductVariantInput = z.infer<typeof productVariantInputSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
