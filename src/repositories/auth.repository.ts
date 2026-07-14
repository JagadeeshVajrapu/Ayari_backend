import {
  EmailVerificationToken,
  PasswordResetToken,
  Prisma,
  RefreshToken,
  User,
  UserRole,
} from '@prisma/client';
import { prisma } from '../database/prisma';

type RefreshTokenWithUser = Prisma.RefreshTokenGetPayload<{ include: { user: true } }>;
type PasswordResetTokenWithUser = Prisma.PasswordResetTokenGetPayload<{ include: { user: true } }>;
type EmailVerificationTokenWithUser = Prisma.EmailVerificationTokenGetPayload<{
  include: { user: true };
}>;

export class AuthRepository {
  async findUserByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }

  async findUserById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async createUser(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    phone?: string;
    role?: UserRole;
  }): Promise<User> {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash: data.passwordHash,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          role: data.role ?? UserRole.CUSTOMER,
          emailVerified: true,
        },
      });

      await tx.cart.create({
        data: { userId: user.id },
      });

      return user;
    });
  }

  async updatePassword(userId: string, passwordHash: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  async markEmailVerified(userId: string): Promise<User> {
    return prisma.user.update({
      where: { id: userId },
      data: { emailVerified: true },
    });
  }

  async createRefreshToken(
    userId: string,
    token: string,
    expiresAt: Date,
  ): Promise<RefreshToken> {
    return prisma.refreshToken.create({
      data: { userId, token, expiresAt },
    });
  }

  async findRefreshToken(token: string): Promise<RefreshTokenWithUser | null> {
    return prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });
  }

  async revokeRefreshToken(token: string): Promise<RefreshToken> {
    return prisma.refreshToken.update({
      where: { token },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllUserRefreshTokens(userId: string): Promise<Prisma.BatchPayload> {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async createPasswordResetToken(
    userId: string,
    token: string,
    expiresAt: Date,
  ): Promise<PasswordResetToken> {
    await prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    return prisma.passwordResetToken.create({
      data: { userId, token, expiresAt },
    });
  }

  async findPasswordResetToken(token: string): Promise<PasswordResetTokenWithUser | null> {
    return prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });
  }

  async findPasswordResetTokenForUser(
    userId: string,
    token: string,
  ): Promise<PasswordResetTokenWithUser | null> {
    return prisma.passwordResetToken.findFirst({
      where: { userId, token, usedAt: null },
      include: { user: true },
    });
  }

  async markPasswordResetTokenUsed(token: string): Promise<PasswordResetToken> {
    return prisma.passwordResetToken.update({
      where: { token },
      data: { usedAt: new Date() },
    });
  }

  async createEmailVerificationToken(
    userId: string,
    code: string,
    expiresAt: Date,
  ): Promise<EmailVerificationToken> {
    await prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    return prisma.emailVerificationToken.create({
      data: { userId, code, expiresAt },
    });
  }

  async findEmailVerificationToken(
    userId: string,
    code: string,
  ): Promise<EmailVerificationTokenWithUser | null> {
    return prisma.emailVerificationToken.findFirst({
      where: { userId, code, usedAt: null },
      include: { user: true },
    });
  }

  async markEmailVerificationTokenUsed(id: string): Promise<EmailVerificationToken> {
    return prisma.emailVerificationToken.update({
      where: { id },
      data: { usedAt: new Date() },
    });
  }
}

export const authRepository = new AuthRepository();
