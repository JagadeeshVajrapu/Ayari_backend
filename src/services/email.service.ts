import nodemailer from 'nodemailer';
import { env, isSmtpConfigured } from '../config/env';
import { emailTemplates } from '../templates/email/templates';

function resolveFromAddress(): string {
  const from = env.SMTP_FROM?.trim();
  const user = env.SMTP_USER?.trim();

  if (!from) {
    return user ? `"AYARI" <${user}>` : 'noreply@ayari.com';
  }

  // Gmail must send from the authenticated account (or a configured alias).
  if (user && from.includes('@') && !from.toLowerCase().includes(user.toLowerCase())) {
    return `"AYARI" <${user}>`;
  }

  if (from.includes('<') && from.includes('>')) {
    return from;
  }

  if (user && !from.includes('@')) {
    return `"${from}" <${user}>`;
  }

  return user ? `"AYARI" <${user}>` : from;
}

export class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private verified = false;

  private getTransporter(): nodemailer.Transporter | null {
    if (!isSmtpConfigured()) {
      return null;
    }

    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE,
        requireTLS: !env.SMTP_SECURE,
        auth: {
          user: env.SMTP_USER,
          pass: env.SMTP_PASS,
        },
        tls: {
          minVersion: 'TLSv1.2',
        },
      });
    }

    return this.transporter;
  }

  private async ensureVerified(): Promise<void> {
    if (this.verified) return;

    const transporter = this.getTransporter();
    if (!transporter) return;

    await transporter.verify();
    this.verified = true;
    console.log(`SMTP ready (${env.SMTP_HOST}:${env.SMTP_PORT}) as ${env.SMTP_USER}`);
  }

  private async deliver(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    const transporter = this.getTransporter();

    if (!transporter) {
      if (env.NODE_ENV === 'production') {
        // Never dump email contents (OTPs, reset codes) into production logs.
        throw new Error('SMTP is not configured — cannot deliver email in production');
      }
      this.logToConsole(to, subject, text);
      return;
    }

    await this.ensureVerified();

    const from = resolveFromAddress();
    const info = await transporter.sendMail({ from, to, subject, text, html });
    console.log(`Email sent to ${to} (messageId: ${info.messageId})`);
  }

  private logToConsole(to: string, subject: string, text: string): void {
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║  EMAIL (SMTP not configured)                     ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  To: ${to.padEnd(40)}║`);
    console.log(`║  Subject: ${subject.slice(0, 34).padEnd(34)}║`);
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(text.split('\n').map((line) => `║  ${line.padEnd(48)}║`).join('\n'));
    console.log('╚══════════════════════════════════════════════════╝\n');
  }

  async sendRaw(to: string, subject: string, text: string, html: string): Promise<void> {
    await this.deliver(to, subject, text, html);
  }

  async sendVerificationOtp(email: string, firstName: string, otp: string): Promise<void> {
    const { subject, text, html } = emailTemplates.emailVerification(firstName, otp);
    await this.deliver(email, subject, text, html);
  }

  async sendPasswordResetOtp(email: string, firstName: string, otp: string): Promise<void> {
    const { subject, text, html } = emailTemplates.passwordReset(firstName, otp);
    await this.deliver(email, subject, text, html);
  }

  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const subject = 'Reset your AYARI password';
    const text = [
      'You requested a password reset.',
      '',
      `Reset link: ${resetUrl}`,
      '',
      `Or use this token: ${resetToken}`,
      '',
      'This link expires in 1 hour. If you did not request this, ignore this email.',
    ].join('\n');

    const html = `
      <p>You requested a password reset.</p>
      <p><a href="${resetUrl}">Click here to reset your password</a></p>
      <p>Or copy this link: ${resetUrl}</p>
      <p>This link expires in 1 hour.</p>
    `;

    await this.deliver(email, subject, text, html);
  }
}

export const emailService = new EmailService();
