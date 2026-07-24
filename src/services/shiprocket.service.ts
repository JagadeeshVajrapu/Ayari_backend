import { PickupStatus, Prisma, ShipmentStatus } from '@prisma/client';
import { prisma } from '../database/prisma';
import {
  env,
  getShiprocketApiBase,
  isShiprocketConfigured,
} from '../config/env';
import { BadRequestError, NotFoundError } from '../utils/appError.util';
import { realtimeService } from './realtime.service';

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

type ShiprocketJson = Record<string, unknown>;

function mapShiprocketStatusToInternal(raw: string): ShipmentStatus | null {
  const status = String(raw).toLowerCase();
  if (status.includes('delivered')) return ShipmentStatus.DELIVERED;
  if (status.includes('out for delivery') || status.includes('ofd')) return ShipmentStatus.OUT_FOR_DELIVERY;
  if (status.includes('reached') || status.includes('hub')) return ShipmentStatus.REACHED_HUB;
  if (status.includes('in transit') || status.includes('transit') || status.includes('shipped')) {
    return ShipmentStatus.IN_TRANSIT;
  }
  if (status.includes('picked')) return ShipmentStatus.PICKED_UP;
  if (status.includes('pickup') || status.includes('ready')) return ShipmentStatus.READY_FOR_PICKUP;
  if (status.includes('cancel')) return ShipmentStatus.CANCELLED;
  if (status.includes('rto') || status.includes('return')) return ShipmentStatus.RETURNED;
  return null;
}

async function shiprocketFetch(
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<ShiprocketJson> {
  const base = getShiprocketApiBase().replace(/\/$/, '');
  const response = await fetch(`${base}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let json: ShiprocketJson = {};
  try {
    json = text ? (JSON.parse(text) as ShiprocketJson) : {};
  } catch {
    json = { message: text };
  }

  if (!response.ok) {
    const message =
      (typeof json.message === 'string' && json.message) ||
      (typeof json.error === 'string' && json.error) ||
      `Shiprocket API error (${response.status})`;
    throw new BadRequestError(message);
  }

  return json;
}

export class ShiprocketService {
  isConfigured(): boolean {
    return isShiprocketConfigured();
  }

  async getAccessToken(forceRefresh = false): Promise<string> {
    if (!isShiprocketConfigured()) {
      throw new BadRequestError(
        'Shiprocket is not configured. Set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD.',
      );
    }

    if (!forceRefresh && tokenCache && tokenCache.expiresAt > Date.now()) {
      return tokenCache.token;
    }

    if (!forceRefresh && env.SHIPROCKET_TOKEN?.trim()) {
      tokenCache = {
        token: env.SHIPROCKET_TOKEN.trim(),
        expiresAt: Date.now() + 8 * 60 * 60 * 1000,
      };
      return tokenCache.token;
    }

    const data = await shiprocketFetch('/auth/login', {
      method: 'POST',
      body: {
        email: env.SHIPROCKET_EMAIL!.trim(),
        password: env.SHIPROCKET_PASSWORD!.trim(),
      },
    });

    const token = typeof data.token === 'string' ? data.token : null;
    if (!token) throw new BadRequestError('Shiprocket login did not return a token');

    tokenCache = {
      token,
      expiresAt: Date.now() + 9 * 24 * 60 * 60 * 1000, // Shiprocket tokens last ~10 days
    };
    return token;
  }

  private async withToken<T>(fn: (token: string) => Promise<T>): Promise<T> {
    try {
      return await fn(await this.getAccessToken());
    } catch (error) {
      // Retry once with fresh login on auth failure
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('token') || message.includes('unauthorized') || message.includes('401')) {
        tokenCache = null;
        return fn(await this.getAccessToken(true));
      }
      throw error;
    }
  }

  /**
   * Create Shiprocket order + assign courier/AWB + generate label for an existing local shipment.
   * Safe to call when Shiprocket is not configured (no-op).
   */
  async fulfillShipmentWithShiprocket(shipmentId: string): Promise<void> {
    if (!isShiprocketConfigured()) return;

    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        order: {
          include: {
            items: true,
            shippingAddress: true,
            user: { select: { email: true, phone: true } },
            payment: true,
          },
        },
        courierPartner: true,
      },
    });

    if (!shipment?.order) return;
    if (shipment.shiprocketOrderId && shipment.awbNumber) return;

    const order = shipment.order;
    const address = order.shippingAddress;
    const paymentMethod =
      order.payment?.paymentMethod === 'COD' ? 'COD' : 'Prepaid';

    const weightKg = Math.max(
      0.5,
      Number.parseFloat(shipment.packageWeight ?? '0.5') || 0.5,
    );

    const orderItems = order.items.map((item) => ({
      name: item.productName,
      sku: item.productSku,
      units: item.quantity,
      selling_price: Number(item.unitPrice),
      discount: 0,
      tax: 0,
      hsn: 0,
    }));

    const createPayload = {
      order_id: order.orderNumber,
      order_date: (order.placedAt ?? order.createdAt).toISOString().slice(0, 19).replace('T', ' '),
      pickup_location: env.SHIPROCKET_PICKUP_LOCATION?.trim() || 'Primary',
      billing_customer_name: address.firstName,
      billing_last_name: address.lastName,
      billing_address: address.street,
      billing_city: address.city,
      billing_pincode: address.zipCode,
      billing_state: address.state,
      billing_country: address.country || 'India',
      billing_email: order.user.email,
      billing_phone: (address.phone ?? order.user.phone ?? '9999999999').replace(/\D/g, '').slice(-10),
      shipping_is_billing: true,
      order_items: orderItems,
      payment_method: paymentMethod,
      sub_total: Number(order.totalAmount),
      length: 10,
      breadth: 10,
      height: 10,
      weight: weightKg,
    };

    const created = await this.withToken((token) =>
      shiprocketFetch('/orders/create/adhoc', {
        method: 'POST',
        token,
        body: createPayload,
      }),
    );

    const shiprocketOrderId = String(
      created.order_id ?? (created as { order_id?: string | number }).order_id ?? '',
    );
    const shiprocketShipmentId = String(
      created.shipment_id ??
        (created as { shipment_id?: string | number }).shipment_id ??
        '',
    );

    if (!shiprocketOrderId || !shiprocketShipmentId) {
      console.error('[shiprocket] create order response missing ids', created);
      return;
    }

    await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        shiprocketOrderId,
        shiprocketShipmentId,
        pickupStatus: PickupStatus.NOT_REQUESTED,
      },
    });

    // Assign courier / AWB
    try {
      const assigned = await this.withToken((token) =>
        shiprocketFetch('/courier/assign/awb', {
          method: 'POST',
          token,
          body: { shipment_id: Number(shiprocketShipmentId) },
        }),
      );

      const response = (assigned.response ?? assigned) as ShiprocketJson;
      const data = (response.data ?? response) as ShiprocketJson;
      const awb =
        (typeof data.awb_code === 'string' && data.awb_code) ||
        (typeof assigned.awb_code === 'string' && assigned.awb_code) ||
        null;
      const courierName =
        (typeof data.courier_name === 'string' && data.courier_name) ||
        (typeof assigned.courier_name === 'string' && assigned.courier_name) ||
        shipment.courierPartner.name;

      if (awb) {
        const trackingUrl = `https://shiprocket.co/tracking/${awb}`;
        await prisma.shipment.update({
          where: { id: shipmentId },
          data: {
            awbNumber: awb,
            trackingNumber: awb,
            courierName,
            trackingUrl,
          },
        });
      }
    } catch (error) {
      console.error('[shiprocket] AWB assign failed:', error);
    }

    // Generate shipping label
    try {
      await this.generateLabel(shipmentId);
    } catch (error) {
      console.error('[shiprocket] label generate failed:', error);
    }
  }

  async generateLabel(shipmentId: string) {
    const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment?.shiprocketShipmentId) {
      throw new BadRequestError('Shiprocket shipment is not created yet');
    }

    const result = await this.withToken((token) =>
      shiprocketFetch('/courier/generate/label', {
        method: 'POST',
        token,
        body: { shipment_id: [Number(shipment.shiprocketShipmentId)] },
      }),
    );

    const labelUrl =
      (typeof result.label_url === 'string' && result.label_url) ||
      (typeof (result as { label_url?: string }).label_url === 'string' &&
        (result as { label_url?: string }).label_url) ||
      (Array.isArray(result.label_url) ? String(result.label_url[0]) : null) ||
      (typeof (result as { payload?: { label_url?: string } }).payload?.label_url === 'string'
        ? (result as { payload: { label_url: string } }).payload.label_url
        : null);

    if (!labelUrl) {
      throw new BadRequestError('Shiprocket did not return a shipping label URL');
    }

    return prisma.shipment.update({
      where: { id: shipmentId },
      data: { shippingLabelUrl: labelUrl },
    });
  }

  async requestPickup(shipmentId: string) {
    const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment?.shiprocketShipmentId) {
      throw new BadRequestError('Shiprocket shipment is not created yet');
    }

    await this.withToken((token) =>
      shiprocketFetch('/courier/generate/pickup', {
        method: 'POST',
        token,
        body: { shipment_id: [Number(shipment.shiprocketShipmentId)] },
      }),
    );

    const updated = await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        pickupStatus: PickupStatus.REQUESTED,
        status: shipment.status === ShipmentStatus.PACKED || shipment.status === ShipmentStatus.CONFIRMED
          ? ShipmentStatus.READY_FOR_PICKUP
          : shipment.status,
      },
      include: { order: { select: { orderNumber: true, userId: true } } },
    });

    await prisma.shipmentStatusHistory.create({
      data: {
        shipmentId,
        status: updated.status,
        note: 'Pickup requested via Shiprocket',
      },
    });

    await prisma.shipmentTracking.create({
      data: {
        shipmentId,
        status: updated.status,
        description: 'Pickup requested with courier',
        eventAt: new Date(),
      },
    });

    return updated;
  }

  async refreshTracking(shipmentId: string) {
    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { order: { select: { orderNumber: true, userId: true } } },
    });
    if (!shipment) throw new NotFoundError('Shipment not found');

    const awb = shipment.awbNumber ?? shipment.trackingNumber;
    if (!awb) throw new BadRequestError('No AWB / tracking number available');

    const tracked = await this.withToken((token) =>
      shiprocketFetch(`/courier/track/awb/${encodeURIComponent(awb)}`, { token }),
    );

    const trackingData =
      ((tracked.tracking_data as ShiprocketJson | undefined) ?? tracked) as ShiprocketJson;
    const shipmentTrack =
      (trackingData.shipment_track as ShiprocketJson[] | undefined) ??
      (trackingData.track_status as ShiprocketJson[] | undefined) ??
      [];

    const currentStatusRaw = String(
      trackingData.shipment_status ??
        trackingData.track_status ??
        (shipmentTrack[0] as ShiprocketJson | undefined)?.current_status ??
        '',
    );

    const mapped = mapShiprocketStatusToInternal(currentStatusRaw);
    const deliveryStatus = currentStatusRaw || shipment.deliveryStatus;

    let deliveredAt = shipment.deliveredAt;
    if (mapped === ShipmentStatus.DELIVERED && !deliveredAt) {
      deliveredAt = new Date();
    }

    const data: Prisma.ShipmentUpdateInput = {
      deliveryStatus: deliveryStatus || null,
      deliveredAt,
      ...(mapped ? { status: mapped } : {}),
    };

    const updated = await prisma.shipment.update({
      where: { id: shipmentId },
      data,
    });

    // Sync recent scan activities
    const activities =
      (trackingData.shipment_track_activities as Array<ShiprocketJson> | undefined) ?? [];
    for (const activity of activities.slice(0, 10)) {
      const description = String(activity.activity ?? activity.status ?? 'Tracking update');
      const location = activity.location ? String(activity.location) : null;
      const eventAt = activity.date
        ? new Date(String(activity.date))
        : new Date();
      const status = mapShiprocketStatusToInternal(String(activity.status ?? description)) ??
        updated.status;

      const exists = await prisma.shipmentTracking.findFirst({
        where: {
          shipmentId,
          description,
          eventAt,
        },
      });
      if (!exists) {
        await prisma.shipmentTracking.create({
          data: {
            shipmentId,
            status,
            description,
            location,
            eventAt: Number.isNaN(eventAt.getTime()) ? new Date() : eventAt,
          },
        });
      }
    }

    if (shipment.order) {
      void realtimeService.emitShipmentStatusChange({
        orderId: shipment.orderId,
        orderNumber: shipment.order.orderNumber,
        shipmentId,
        userId: shipment.order.userId,
        status: updated.status,
      });
    }

    return updated;
  }

  async cancelShipment(shipmentId: string) {
    const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment?.shiprocketOrderId) {
      throw new BadRequestError('Shiprocket order is not created yet');
    }

    await this.withToken((token) =>
      shiprocketFetch('/orders/cancel', {
        method: 'POST',
        token,
        body: { ids: [Number(shipment.shiprocketOrderId)] },
      }),
    );

    return prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        status: ShipmentStatus.CANCELLED,
        pickupStatus: PickupStatus.CANCELLED,
        deliveryStatus: 'CANCELLED',
      },
    });
  }

  async createReturn(shipmentId: string) {
    const shipment = await prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: {
        order: {
          include: { items: true, shippingAddress: true, user: true },
        },
      },
    });
    if (!shipment?.order) throw new NotFoundError('Shipment not found');
    if (!shipment.awbNumber) {
      throw new BadRequestError('AWB is required before creating a return');
    }

    // Shiprocket return API varies by account; mark local state and leave channel open for ops.
    const updated = await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        status: ShipmentStatus.RETURNED,
        deliveryStatus: 'RETURN_INITIATED',
      },
    });

    await prisma.shipmentStatusHistory.create({
      data: {
        shipmentId,
        status: ShipmentStatus.RETURNED,
        note: 'Return initiated from admin panel',
      },
    });

    return updated;
  }

  async handleWebhook(payload: ShiprocketJson, apiKeyHeader?: string) {
    // Public endpoint: when SHIPROCKET_WEBHOOK_SECRET is set, require it (header or body).
    // No JWT / user access token is required.
    const expected = env.SHIPROCKET_WEBHOOK_SECRET?.trim();
    if (expected) {
      const provided =
        (typeof apiKeyHeader === 'string' && apiKeyHeader.trim()) ||
        (typeof payload.token === 'string' && payload.token.trim()) ||
        (typeof payload.secret === 'string' && payload.secret.trim()) ||
        '';
      if (!provided || provided !== expected) {
        throw new BadRequestError('Invalid Shiprocket webhook secret');
      }
    }

    const awb = String(
      payload.awb ?? payload.awb_code ?? payload.awb_number ?? '',
    );
    const srShipmentId = String(payload.sr_shipment_id ?? payload.shipment_id ?? '');
    const currentStatus = String(
      payload.current_status ?? payload.shipment_status ?? payload.status ?? '',
    );

    const shipment = await prisma.shipment.findFirst({
      where: {
        OR: [
          ...(awb ? [{ awbNumber: awb }, { trackingNumber: awb }] : []),
          ...(srShipmentId ? [{ shiprocketShipmentId: srShipmentId }] : []),
        ],
      },
      include: { order: { select: { orderNumber: true, userId: true } } },
    });

    if (!shipment) {
      return { handled: false, reason: 'shipment_not_found' };
    }

    const mapped = mapShiprocketStatusToInternal(currentStatus);
    const updated = await prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        deliveryStatus: currentStatus || shipment.deliveryStatus,
        ...(mapped ? { status: mapped } : {}),
        ...(mapped === ShipmentStatus.DELIVERED
          ? { deliveredAt: shipment.deliveredAt ?? new Date() }
          : {}),
        ...(mapped === ShipmentStatus.PICKED_UP
          ? { pickupStatus: PickupStatus.PICKED_UP }
          : {}),
      },
    });

    await prisma.shipmentTracking.create({
      data: {
        shipmentId: shipment.id,
        status: mapped ?? shipment.status,
        description: currentStatus || 'Shiprocket status update',
        location: payload.current_status_location
          ? String(payload.current_status_location)
          : null,
        eventAt: new Date(),
      },
    });

    if (shipment.order) {
      void realtimeService.emitShipmentStatusChange({
        orderId: shipment.orderId,
        orderNumber: shipment.order.orderNumber,
        shipmentId: shipment.id,
        userId: shipment.order.userId,
        status: updated.status,
      });
    }

    return { handled: true, shipmentId: shipment.id, status: updated.status };
  }
}

export const shiprocketService = new ShiprocketService();
