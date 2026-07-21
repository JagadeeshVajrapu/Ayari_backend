-- CreateEnum
CREATE TYPE "VariantType" AS ENUM ('COLOR', 'SIZE', 'SET', 'STORAGE', 'RAM', 'WEIGHT', 'MATERIAL', 'BUNDLE', 'EDITION', 'OTHER');

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color_hex" TEXT,
    "variant_type" "VariantType" NOT NULL DEFAULT 'COLOR',
    "price" DECIMAL(10,2),
    "compare_at_price" DECIMAL(10,2),
    "stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_images" (
    "id" TEXT NOT NULL,
    "variant_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "cloudinary_public_id" TEXT,
    "folder" TEXT,
    "alt_text" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "image_type" TEXT NOT NULL DEFAULT 'product',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variant_images_pkey" PRIMARY KEY ("id")
);

-- AlterTable cart_items
ALTER TABLE "cart_items" ADD COLUMN "variant_id" TEXT;

-- AlterTable order_items
ALTER TABLE "order_items" ADD COLUMN "variant_id" TEXT;
ALTER TABLE "order_items" ADD COLUMN "variant_name" TEXT;
ALTER TABLE "order_items" ADD COLUMN "variant_image_url" TEXT;

-- Drop old cart unique constraint
DROP INDEX IF EXISTS "cart_items_cart_id_product_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "product_variants"("sku");
CREATE INDEX "product_variants_product_id_sort_order_idx" ON "product_variants"("product_id", "sort_order");
CREATE INDEX "product_variants_product_id_is_default_idx" ON "product_variants"("product_id", "is_default");
CREATE INDEX "variant_images_variant_id_sort_order_idx" ON "variant_images"("variant_id", "sort_order");
CREATE INDEX "variant_images_variant_id_is_primary_idx" ON "variant_images"("variant_id", "is_primary");
CREATE INDEX "cart_items_variant_id_idx" ON "cart_items"("variant_id");
CREATE UNIQUE INDEX "cart_items_cart_id_product_id_variant_id_key" ON "cart_items"("cart_id", "product_id", "variant_id");
CREATE INDEX "order_items_variant_id_idx" ON "order_items"("variant_id");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "variant_images" ADD CONSTRAINT "variant_images_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
