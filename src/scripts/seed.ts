import 'dotenv/config';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '../database/prisma';

type CourierSeed = {
  name: string;
  code: string;
  trackingUrlTemplate: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
};

const DEFAULT_COURIERS: CourierSeed[] = [
  {
    name: 'Ayari Logistics',
    code: 'AYARI',
    trackingUrlTemplate: 'https://track.ayari.com/{trackingNumber}',
    contactPerson: 'Ayari Fulfillment',
    phone: '+91 1800-AYARI-00',
    email: 'logistics@ayari.com',
  },
  {
    name: 'BlueDart',
    code: 'BLUEDART',
    trackingUrlTemplate: 'https://www.bluedart.com/tracking/{trackingNumber}',
  },
  {
    name: 'Delhivery',
    code: 'DELHIVERY',
    trackingUrlTemplate: 'https://www.delhivery.com/track/package/{trackingNumber}',
  },
  {
    name: 'DTDC',
    code: 'DTDC',
    trackingUrlTemplate: 'https://www.dtdc.in/tracking/{trackingNumber}',
  },
  {
    name: 'Xpressbees',
    code: 'XPRESSBEES',
    trackingUrlTemplate: 'https://www.xpressbees.com/track/{trackingNumber}',
  },
  {
    name: 'Shiprocket',
    code: 'SHIPROCKET',
    trackingUrlTemplate: 'https://shiprocket.co/tracking/{trackingNumber}',
  },
  {
    name: 'Ekart',
    code: 'EKART',
    trackingUrlTemplate: 'https://ekartlogistics.com/track/{trackingNumber}',
  },
];

/** Clear catalog and transactional data in FK-safe order. */
async function clearTransactionalData() {
  await prisma.notificationQueue.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.deliveryAttempt.deleteMany();
  await prisma.shipmentNote.deleteMany();
  await prisma.shipmentTracking.deleteMany();
  await prisma.shipmentStatusHistory.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.review.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.wishlist.deleteMany();
  await prisma.featuredImage.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.coupon.deleteMany();
}

async function seedCourierPartners() {
  for (const courier of DEFAULT_COURIERS) {
    await prisma.courierPartner.upsert({
      where: { code: courier.code },
      update: {
        name: courier.name,
        trackingUrlTemplate: courier.trackingUrlTemplate,
        contactPerson: courier.contactPerson,
        phone: courier.phone,
        email: courier.email,
        isActive: true,
      },
      create: {
        name: courier.name,
        code: courier.code,
        trackingUrlTemplate: courier.trackingUrlTemplate,
        contactPerson: courier.contactPerson,
        phone: courier.phone,
        email: courier.email,
        isActive: true,
      },
    });
  }
}

async function ensureCart(userId: string) {
  const existing = await prisma.cart.findUnique({ where: { userId } });
  if (!existing) {
    await prisma.cart.create({ data: { userId } });
  }
}

async function main() {
  console.log('Clearing catalog and transactional data...');
  await clearTransactionalData();

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@ayari.com';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123456';
  const customerEmail = process.env.SEED_CUSTOMER_EMAIL ?? 'customer@ayari.com';
  const customerPassword = process.env.SEED_CUSTOMER_PASSWORD ?? 'Customer@123456';

  const adminHash = await bcrypt.hash(adminPassword, 12);
  const customerHash = await bcrypt.hash(customerPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: UserRole.ADMIN,
      emailVerified: true,
      isActive: true,
      passwordHash: adminHash,
    },
    create: {
      email: adminEmail,
      passwordHash: adminHash,
      firstName: 'Admin',
      lastName: 'AYARI',
      role: UserRole.ADMIN,
      emailVerified: true,
      isActive: true,
      cart: { create: {} },
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: customerEmail },
    update: {
      emailVerified: true,
      isActive: true,
      passwordHash: customerHash,
    },
    create: {
      email: customerEmail,
      passwordHash: customerHash,
      firstName: 'Customer',
      lastName: 'User',
      phone: '+91 9876543210',
      role: UserRole.CUSTOMER,
      emailVerified: true,
      isActive: true,
      cart: { create: {} },
    },
  });

  await ensureCart(admin.id);
  await ensureCart(customer.id);
  await seedCourierPartners();

  console.log('Seed complete.');
  console.log(`  Admin:    ${adminEmail} / ${adminPassword}`);
  console.log(`  Customer: ${customerEmail} / ${customerPassword}`);
  console.log(`  Couriers: ${DEFAULT_COURIERS.length} partners seeded (default: Ayari Logistics)`);
  console.log('  Catalog is empty — add categories and products via Admin.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
