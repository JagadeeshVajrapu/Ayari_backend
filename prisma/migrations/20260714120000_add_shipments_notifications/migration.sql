-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PACKING', 'PACKED', 'READY_FOR_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'REACHED_HUB', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED');
-- CreateEnum
CREATE TYPE "ShippingMethod" AS ENUM ('STANDARD', 'EXPRESS', 'SAME_DAY', 'NEXT_DAY');
-- CreateEnum
CREATE TYPE "ShipmentNoteType" AS ENUM ('GENERAL', 'DELIVERY_INSTRUCTION', 'SPECIAL_INSTRUCTION', 'PACKAGE_DAMAGED', 'CUSTOMER_DELAY', 'ADDRESS_UPDATED', 'DELIVERY_FAILED');
-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('USER_REGISTERED', 'EMAIL_VERIFIED', 'PASSWORD_CHANGED', 'LOGIN_NEW_DEVICE', 'PRODUCT_BACK_IN_STOCK', 'WISHLIST_DISCOUNT', 'COUPON_AVAILABLE', 'ORDER_CREATED', 'ORDER_CONFIRMED', 'PAYMENT_SUCCESSFUL', 'PAYMENT_FAILED', 'PAYMENT_REFUNDED', 'SHIPMENT_CONFIRMED', 'PACKING_STARTED', 'PACKED', 'COURIER_ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'REACHED_HUB', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RETURNED', 'RETURN_REQUESTED', 'RETURN_APPROVED', 'REFUND_INITIATED', 'REFUND_COMPLETED', 'NEWSLETTER', 'SYSTEM_BROADCAST');
-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('ORDER', 'PAYMENT', 'SHIPMENT', 'DELIVERY', 'RETURN', 'REFUND', 'COUPON', 'WISHLIST', 'OFFER', 'ACCOUNT', 'SECURITY', 'SYSTEM');
-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
-- CreateEnum
CREATE TYPE "NotificationRecordStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'PUSH');
-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'RAZORPAY';
-- AlterTable
ALTER TABLE "product_images" ADD COLUMN     "cloudinary_public_id" TEXT;
-- CreateTable
CREATE TABLE "featured_images" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "cloudinary_public_id" TEXT,
    "alt_text" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "featured_images_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "courier_partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "logo_url" TEXT,
    "tracking_url_template" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "courier_partners_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "shipment_number" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "courier_partner_id" TEXT NOT NULL,
    "tracking_number" TEXT NOT NULL,
    "estimated_delivery" TIMESTAMP(3) NOT NULL,
    "shipping_method" "ShippingMethod" NOT NULL DEFAULT 'STANDARD',
    "warehouse" TEXT DEFAULT 'Ayari Fulfillment Center',
    "package_weight" TEXT,
    "package_dimensions" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "shipment_status_history" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "note" TEXT,
    "location" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shipment_status_history_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "shipment_tracking" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "event_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shipment_tracking_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "shipment_notes" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "type" "ShipmentNoteType" NOT NULL DEFAULT 'GENERAL',
    "content" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shipment_notes_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "delivery_attempts" (
    "id" TEXT NOT NULL,
    "shipment_id" TEXT NOT NULL,
    "attempt_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "location" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "notification_queue" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "order_id" TEXT,
    "shipment_id" TEXT,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "sent_at" TIMESTAMP(3),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_queue_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "status" "NotificationRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "icon" TEXT,
    "action_url" TEXT,
    "metadata" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "order_id" TEXT,
    "shipment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "tracking_number_sequences" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "tracking_number_sequences_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "featured_images_product_id_sort_order_idx" ON "featured_images"("product_id", "sort_order");
-- CreateIndex
CREATE UNIQUE INDEX "courier_partners_code_key" ON "courier_partners"("code");
-- CreateIndex
CREATE INDEX "courier_partners_is_active_idx" ON "courier_partners"("is_active");
-- CreateIndex
CREATE UNIQUE INDEX "shipments_shipment_number_key" ON "shipments"("shipment_number");
-- CreateIndex
CREATE UNIQUE INDEX "shipments_order_id_key" ON "shipments"("order_id");
-- CreateIndex
CREATE UNIQUE INDEX "shipments_tracking_number_key" ON "shipments"("tracking_number");
-- CreateIndex
CREATE INDEX "shipments_status_idx" ON "shipments"("status");
-- CreateIndex
CREATE INDEX "shipments_courier_partner_id_idx" ON "shipments"("courier_partner_id");
-- CreateIndex
CREATE INDEX "shipments_tracking_number_idx" ON "shipments"("tracking_number");
-- CreateIndex
CREATE INDEX "shipments_created_at_idx" ON "shipments"("created_at");
-- CreateIndex
CREATE INDEX "shipments_status_created_at_idx" ON "shipments"("status", "created_at");
-- CreateIndex
CREATE INDEX "shipment_status_history_shipment_id_created_at_idx" ON "shipment_status_history"("shipment_id", "created_at");
-- CreateIndex
CREATE INDEX "shipment_tracking_shipment_id_event_at_idx" ON "shipment_tracking"("shipment_id", "event_at");
-- CreateIndex
CREATE INDEX "shipment_notes_shipment_id_created_at_idx" ON "shipment_notes"("shipment_id", "created_at");
-- CreateIndex
CREATE INDEX "delivery_attempts_shipment_id_attempt_at_idx" ON "delivery_attempts"("shipment_id", "attempt_at");
-- CreateIndex
CREATE INDEX "notification_queue_user_id_status_idx" ON "notification_queue"("user_id", "status");
-- CreateIndex
CREATE INDEX "notification_queue_shipment_id_idx" ON "notification_queue"("shipment_id");
-- CreateIndex
CREATE INDEX "notification_queue_status_created_at_idx" ON "notification_queue"("status", "created_at");
-- CreateIndex
CREATE INDEX "notification_queue_created_at_idx" ON "notification_queue"("created_at");
-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_created_at_idx" ON "notifications"("user_id", "is_read", "created_at");
-- CreateIndex
CREATE INDEX "notifications_user_id_category_idx" ON "notifications"("user_id", "category");
-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");
-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");
-- CreateIndex
CREATE UNIQUE INDEX "tracking_number_sequences_year_key" ON "tracking_number_sequences"("year");
-- AddForeignKey
ALTER TABLE "featured_images" ADD CONSTRAINT "featured_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_courier_partner_id_fkey" FOREIGN KEY ("courier_partner_id") REFERENCES "courier_partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "shipment_status_history" ADD CONSTRAINT "shipment_status_history_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "shipment_tracking" ADD CONSTRAINT "shipment_tracking_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "shipment_notes" ADD CONSTRAINT "shipment_notes_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
