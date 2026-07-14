import { env } from '../../config/env';

const BRAND = {
  name: 'AYARI',
  primary: '#C9A962',
  dark: '#1A1A1A',
  muted: '#6B7280',
  bg: '#FAF9F7',
  supportEmail: 'support@ayari.com',
};

function layout(content: string, preheader = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AYARI</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};font-family:Georgia,'Times New Roman',serif;color:${BRAND.dark};">
  <span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,${BRAND.dark} 0%,#2d2d2d 100%);padding:28px 32px;text-align:center;">
          <h1 style="margin:0;color:${BRAND.primary};font-size:28px;letter-spacing:6px;font-weight:400;">AYARI</h1>
          <p style="margin:8px 0 0;color:#d1d5db;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Luxury Fashion</p>
        </td></tr>
        <tr><td style="padding:32px;">${content}</td></tr>
        <tr><td style="background:#f9fafb;padding:24px 32px;border-top:1px solid #eee;text-align:center;">
          <p style="margin:0 0 8px;font-size:12px;color:${BRAND.muted};">Need help? Contact us at
            <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.primary};text-decoration:none;">${BRAND.supportEmail}</a>
          </p>
          <p style="margin:0;font-size:11px;color:#9ca3af;">© ${new Date().getFullYear()} AYARI. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function cta(href: string, label: string) {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td>
    <a href="${href}" style="display:inline-block;background:${BRAND.primary};color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.5px;">${label}</a>
  </td></tr></table>`;
}

export const emailTemplates = {
  welcome(firstName: string) {
    const content = `
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:400;">Welcome, ${firstName}!</h2>
      <p style="line-height:1.7;color:#374151;">Thank you for joining AYARI. Discover curated luxury fashion crafted for the modern you.</p>
      ${cta(`${env.FRONTEND_URL}/shop`, 'Start Shopping')}
    `;
    return { subject: 'Welcome to AYARI', html: layout(content, 'Welcome to AYARI'), text: `Welcome ${firstName}! Start shopping at ${env.FRONTEND_URL}/shop` };
  },

  emailVerification(firstName: string, otp: string) {
    const content = `
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:400;">Verify your email</h2>
      <p style="line-height:1.7;color:#374151;">Hi ${firstName}, use the code below to verify your email address.</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:bold;text-align:center;color:${BRAND.primary};margin:24px 0;">${otp}</p>
      <p style="font-size:13px;color:${BRAND.muted};">This code expires in 10 minutes.</p>
    `;
    return { subject: 'Verify your AYARI email', html: layout(content), text: `Your verification code is ${otp}` };
  },

  passwordReset(firstName: string, otp: string) {
    const content = `
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:400;">Password reset</h2>
      <p style="line-height:1.7;color:#374151;">Hi ${firstName}, we received a request to reset your password.</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:bold;text-align:center;color:${BRAND.primary};margin:24px 0;">${otp}</p>
      <p style="font-size:13px;color:${BRAND.muted};">If you didn't request this, you can safely ignore this email.</p>
    `;
    return { subject: 'Reset your AYARI password', html: layout(content), text: `Password reset code: ${otp}` };
  },

  orderConfirmation(firstName: string, orderNumber: string, total: string) {
    const content = `
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:400;">Order Confirmed</h2>
      <p style="line-height:1.7;color:#374151;">Hi ${firstName}, your order <strong>#${orderNumber}</strong> has been placed successfully.</p>
      <table width="100%" style="background:#f9fafb;border-radius:8px;padding:16px;margin:16px 0;">
        <tr><td style="font-size:14px;color:#374151;">Order Total</td><td align="right" style="font-size:18px;font-weight:bold;color:${BRAND.primary};">${total}</td></tr>
      </table>
      ${cta(`${env.FRONTEND_URL}/account/orders`, 'View Order')}
    `;
    return { subject: `Order #${orderNumber} confirmed`, html: layout(content, `Order ${orderNumber} confirmed`), text: `Order ${orderNumber} confirmed. Total: ${total}` };
  },

  paymentSuccessful(firstName: string, orderNumber: string, amount: string) {
    const content = `
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:400;">Payment Successful</h2>
      <p style="line-height:1.7;color:#374151;">Hi ${firstName}, we received your payment of <strong>${amount}</strong> for order <strong>#${orderNumber}</strong>.</p>
      ${cta(`${env.FRONTEND_URL}/account/orders`, 'Track Order')}
    `;
    return { subject: `Payment received for #${orderNumber}`, html: layout(content), text: `Payment of ${amount} received for order ${orderNumber}` };
  },

  paymentFailed(firstName: string, orderNumber: string) {
    const content = `
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:400;">Payment Failed</h2>
      <p style="line-height:1.7;color:#374151;">Hi ${firstName}, your payment for order <strong>#${orderNumber}</strong> could not be processed.</p>
      ${cta(`${env.FRONTEND_URL}/checkout`, 'Try Again')}
    `;
    return { subject: `Payment failed for #${orderNumber}`, html: layout(content), text: `Payment failed for order ${orderNumber}` };
  },

  shipmentConfirmed(firstName: string, orderNumber: string) {
    const content = `
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:400;">Shipment Confirmed</h2>
      <p style="line-height:1.7;color:#374151;">Hi ${firstName}, your order <strong>#${orderNumber}</strong> is being prepared for shipment.</p>
      ${cta(`${env.FRONTEND_URL}/account/orders`, 'Track Shipment')}
    `;
    return { subject: `Shipment confirmed for #${orderNumber}`, html: layout(content), text: `Shipment confirmed for order ${orderNumber}` };
  },

  packed(firstName: string, orderNumber: string) {
    const content = `
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:400;">Your order is packed</h2>
      <p style="line-height:1.7;color:#374151;">Hi ${firstName}, great news! Order <strong>#${orderNumber}</strong> has been packed and is ready to ship.</p>
    `;
    return { subject: `Order #${orderNumber} packed`, html: layout(content), text: `Order ${orderNumber} has been packed` };
  },

  outForDelivery(firstName: string, orderNumber: string) {
    const content = `
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:400;">Out for delivery</h2>
      <p style="line-height:1.7;color:#374151;">Hi ${firstName}, your order <strong>#${orderNumber}</strong> is out for delivery today!</p>
    `;
    return { subject: `Order #${orderNumber} is out for delivery`, html: layout(content), text: `Order ${orderNumber} is out for delivery` };
  },

  delivered(firstName: string, orderNumber: string) {
    const content = `
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:400;">Delivered!</h2>
      <p style="line-height:1.7;color:#374151;">Hi ${firstName}, your order <strong>#${orderNumber}</strong> has been delivered. We hope you love it!</p>
      ${cta(`${env.FRONTEND_URL}/shop`, 'Shop Again')}
    `;
    return { subject: `Order #${orderNumber} delivered`, html: layout(content), text: `Order ${orderNumber} delivered` };
  },

  returnApproved(firstName: string, orderNumber: string) {
    const content = `
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:400;">Return Approved</h2>
      <p style="line-height:1.7;color:#374151;">Hi ${firstName}, your return request for order <strong>#${orderNumber}</strong> has been approved.</p>
    `;
    return { subject: `Return approved for #${orderNumber}`, html: layout(content), text: `Return approved for order ${orderNumber}` };
  },

  refundCompleted(firstName: string, orderNumber: string, amount: string) {
    const content = `
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:400;">Refund Completed</h2>
      <p style="line-height:1.7;color:#374151;">Hi ${firstName}, a refund of <strong>${amount}</strong> for order <strong>#${orderNumber}</strong> has been processed.</p>
    `;
    return { subject: `Refund completed for #${orderNumber}`, html: layout(content), text: `Refund of ${amount} completed for order ${orderNumber}` };
  },

  newsletter(firstName: string, headline: string, body: string) {
    const content = `
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:400;">${headline}</h2>
      <p style="line-height:1.7;color:#374151;">Hi ${firstName},</p>
      <p style="line-height:1.7;color:#374151;">${body}</p>
      ${cta(`${env.FRONTEND_URL}/shop`, 'Explore Collection')}
    `;
    return { subject: headline, html: layout(content, headline), text: body };
  },
};
