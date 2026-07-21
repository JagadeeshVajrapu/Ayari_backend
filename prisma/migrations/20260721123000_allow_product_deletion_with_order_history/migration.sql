-- Preserve order-item snapshots while allowing catalog products to be deleted.
ALTER TABLE "order_items"
  DROP CONSTRAINT IF EXISTS "order_items_product_id_fkey";

ALTER TABLE "order_items"
  ALTER COLUMN "product_id" DROP NOT NULL;

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
