-- AlterTable
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "shiprocket_order_id" TEXT;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "shiprocket_shipment_id" TEXT;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "awb_number" TEXT;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "courier_name" TEXT;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "shipping_label_url" TEXT;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "tracking_url" TEXT;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "pickup_status" TEXT;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "delivery_status" TEXT;
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMP(3);
ALTER TABLE "shipments" ADD COLUMN IF NOT EXISTS "invoice_url" TEXT;

-- CreateEnum (Postgres)
DO $$ BEGIN
  CREATE TYPE "PickupStatus" AS ENUM ('NOT_REQUESTED', 'REQUESTED', 'SCHEDULED', 'PICKED_UP', 'CANCELLED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Convert pickup_status to enum if still text
ALTER TABLE "shipments" ALTER COLUMN "pickup_status" DROP DEFAULT;
DO $$ BEGIN
  ALTER TABLE "shipments"
    ALTER COLUMN "pickup_status" TYPE "PickupStatus"
    USING (
      CASE
        WHEN "pickup_status" IS NULL THEN NULL
        WHEN "pickup_status" IN ('NOT_REQUESTED','REQUESTED','SCHEDULED','PICKED_UP','CANCELLED','FAILED')
          THEN "pickup_status"::"PickupStatus"
        ELSE 'NOT_REQUESTED'::"PickupStatus"
      END
    );
EXCEPTION
  WHEN others THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "shipments_awb_number_key" ON "shipments"("awb_number");
CREATE INDEX IF NOT EXISTS "shipments_shiprocket_order_id_idx" ON "shipments"("shiprocket_order_id");
