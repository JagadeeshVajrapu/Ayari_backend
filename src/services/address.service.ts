import { AddressType } from '@prisma/client';
import { prisma } from '../database/prisma';
import { BadRequestError, NotFoundError } from '../utils/appError.util';

export interface AddressInput {
  firstName: string;
  lastName: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country?: string;
  phone?: string;
  isDefault?: boolean;
  type?: AddressType;
}

function serializeAddress(address: {
  id: string;
  type: AddressType;
  firstName: string;
  lastName: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  phone: string | null;
  isDefault: boolean;
}) {
  return {
    id: address.id,
    label: address.type === 'BILLING' ? 'Billing' : 'Shipping',
    type: address.type,
    firstName: address.firstName,
    lastName: address.lastName,
    street: address.street,
    city: address.city,
    state: address.state,
    zipCode: address.zipCode,
    country: address.country,
    phone: address.phone ?? '',
    isDefault: address.isDefault,
  };
}

export class AddressService {
  async list(userId: string) {
    const addresses = await prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
    return addresses.map(serializeAddress);
  }

  async create(userId: string, input: AddressInput) {
    const makeDefault = Boolean(input.isDefault);

    if (makeDefault) {
      await prisma.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const existingCount = await prisma.address.count({ where: { userId } });
    const address = await prisma.address.create({
      data: {
        userId,
        type: input.type ?? AddressType.SHIPPING,
        firstName: input.firstName,
        lastName: input.lastName,
        street: input.street,
        city: input.city,
        state: input.state,
        zipCode: input.zipCode,
        country: input.country ?? 'IN',
        phone: input.phone,
        isDefault: makeDefault || existingCount === 0,
      },
    });

    return serializeAddress(address);
  }

  async update(userId: string, addressId: string, input: Partial<AddressInput>) {
    const existing = await prisma.address.findFirst({
      where: { id: addressId, userId },
    });
    if (!existing) throw new NotFoundError('Address not found');

    if (input.isDefault === true) {
      await prisma.address.updateMany({
        where: { userId, isDefault: true, NOT: { id: addressId } },
        data: { isDefault: false },
      });
    }

    const address = await prisma.address.update({
      where: { id: addressId },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
        ...(input.street !== undefined ? { street: input.street } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.state !== undefined ? { state: input.state } : {}),
        ...(input.zipCode !== undefined ? { zipCode: input.zipCode } : {}),
        ...(input.country !== undefined ? { country: input.country } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
      },
    });

    return serializeAddress(address);
  }

  async setDefault(userId: string, addressId: string) {
    const existing = await prisma.address.findFirst({
      where: { id: addressId, userId },
    });
    if (!existing) throw new NotFoundError('Address not found');

    await prisma.address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });

    const address = await prisma.address.update({
      where: { id: addressId },
      data: { isDefault: true },
    });

    return serializeAddress(address);
  }

  async remove(userId: string, addressId: string) {
    const existing = await prisma.address.findFirst({
      where: { id: addressId, userId },
      include: { _count: { select: { shippingOrders: true } } },
    });
    if (!existing) throw new NotFoundError('Address not found');

    if (existing._count.shippingOrders > 0) {
      throw new BadRequestError(
        'This address is linked to an order and cannot be deleted. You can add a new address instead.',
      );
    }

    await prisma.address.delete({ where: { id: addressId } });
    return { id: addressId };
  }
}

export const addressService = new AddressService();
