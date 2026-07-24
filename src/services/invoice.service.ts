import { prisma } from '../database/prisma';
import { env } from '../config/env';
import { NotFoundError } from '../utils/appError.util';

function money(value: { toString(): string } | number | null | undefined): string {
  return Number(value ?? 0).toFixed(2);
}

export class InvoiceService {
  async buildOrderInvoiceHtml(orderId: string): Promise<{ html: string; orderNumber: string }> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        shippingAddress: true,
        payment: true,
        user: { select: { email: true, firstName: true, lastName: true } },
        shipment: true,
      },
    });

    if (!order) throw new NotFoundError('Order not found');

    const rows = order.items
      .map(
        (item) => `
      <tr>
        <td>${item.productName}${item.variantName ? ` (${item.variantName})` : ''}</td>
        <td>${item.productSku}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td style="text-align:right">₹${money(item.unitPrice)}</td>
        <td style="text-align:right">₹${money(item.totalPrice)}</td>
      </tr>`,
      )
      .join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoice ${order.orderNumber}</title>
  <style>
    body { font-family: Georgia, serif; color: #1a1a1a; margin: 40px; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    .muted { color: #666; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th, td { border-bottom: 1px solid #ddd; padding: 10px 6px; font-size: 14px; text-align: left; }
    th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
    .totals { margin-top: 20px; width: 280px; margin-left: auto; }
    .totals td { border: 0; padding: 4px 0; }
    .actions { margin: 24px 0; }
    @media print { .actions { display: none; } body { margin: 16px; } }
  </style>
</head>
<body>
  <div class="actions">
    <button onclick="window.print()">Print Invoice</button>
  </div>
  <h1>AYARI</h1>
  <p class="muted">Tax Invoice</p>
  <p><strong>Invoice / Order:</strong> ${order.orderNumber}</p>
  <p class="muted">Date: ${new Date(order.placedAt ?? order.createdAt).toLocaleString('en-IN')}</p>
  <p class="muted">Payment: ${order.payment?.paymentMethod ?? '—'} · ${order.payment?.status ?? '—'}</p>
  ${order.shipment?.awbNumber ? `<p class="muted">AWB: ${order.shipment.awbNumber}</p>` : ''}

  <h3>Bill To</h3>
  <p>
    ${order.shippingAddress.firstName} ${order.shippingAddress.lastName}<br/>
    ${order.shippingAddress.street}<br/>
    ${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.zipCode}<br/>
    ${order.user.email}
    ${order.shippingAddress.phone ? `<br/>${order.shippingAddress.phone}` : ''}
  </p>

  <table>
    <thead>
      <tr>
        <th>Item</th><th>SKU</th><th>Qty</th><th>Price</th><th>Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>

  <table class="totals">
    <tr><td>Subtotal</td><td style="text-align:right">₹${money(order.subtotal)}</td></tr>
    <tr><td>Discount</td><td style="text-align:right">₹${money(order.discountAmount)}</td></tr>
    <tr><td>Shipping</td><td style="text-align:right">₹${money(order.shippingAmount)}</td></tr>
    <tr><td>Tax</td><td style="text-align:right">₹${money(order.taxAmount)}</td></tr>
    <tr><td><strong>Grand Total</strong></td><td style="text-align:right"><strong>₹${money(order.totalAmount)}</strong></td></tr>
  </table>

  <p class="muted" style="margin-top:40px">Thank you for shopping at ${env.FRONTEND_URL.replace(/^https?:\/\//, '')}</p>
</body>
</html>`;

    return { html, orderNumber: order.orderNumber };
  }
}

export const invoiceService = new InvoiceService();
