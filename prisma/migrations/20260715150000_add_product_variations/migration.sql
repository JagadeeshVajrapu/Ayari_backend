-- AlterTable
ALTER TABLE "products" ADD COLUMN "color_variants" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "products" ADD COLUMN "set_variants" JSONB NOT NULL DEFAULT '[]';
