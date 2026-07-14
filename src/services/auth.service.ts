import { User, UserRole } from '@prisma/client';

import { env } from '../config/env';

import { authRepository } from '../repositories/auth.repository';

import { AuthTokens, SafeUser } from '../types/auth.types';

import {

  ConflictError,

  NotFoundError,

  UnauthorizedError,

  BadRequestError,

} from '../utils/appError.util';

import {

  parseDurationToMs,

  signAccessToken,

  signRefreshToken,

  verifyRefreshToken,

} from '../utils/jwt.util';

import { comparePassword, hashPassword } from '../utils/password.util';

import { generateOtp, hashToken } from '../utils/token.util';

import { toSafeUser } from '../utils/user.util';

import { emailService } from './email.service';
import { notificationService } from './notification.service';
import { NotificationType } from '@prisma/client';

import {

  ForgotPasswordInput,

  LoginInput,

  RegisterInput,

  ResendOtpInput,

  ResetPasswordInput,

} from '../validators/auth.validator';



export class AuthService {

  private buildTokens(user: User): AuthTokens {

    const payload = {

      sub: user.id,

      email: user.email,

      role: user.role,

    };



    return {

      accessToken: signAccessToken(payload),

      refreshToken: signRefreshToken(payload),

    };

  }



  private async persistRefreshToken(userId: string, refreshToken: string): Promise<void> {

    const expiresAt = new Date(Date.now() + parseDurationToMs(env.JWT_REFRESH_EXPIRES_IN));



    await authRepository.createRefreshToken(userId, refreshToken, expiresAt);

  }



  private assertUserIsActive(user: User): void {

    if (!user.isActive) {

      throw new UnauthorizedError('Account has been deactivated');

    }

  }



  private async sendPasswordResetOtp(user: User): Promise<void> {

    const otp = generateOtp();

    const hashedOtp = hashToken(otp);

    const expiresAt = new Date(Date.now() + parseDurationToMs(env.OTP_EXPIRES_IN));



    await authRepository.createPasswordResetToken(user.id, hashedOtp, expiresAt);



    try {

      await emailService.sendPasswordResetOtp(user.email, user.firstName, otp);

    } catch (error) {

      console.error('Password reset OTP delivery failed:', error);

      if (env.NODE_ENV === 'development') {

        console.log(`\n>>> Password reset OTP for ${user.email}: ${otp} <<<\n`);

        return;

      }

      throw error;

    }

  }



  async register(input: RegisterInput): Promise<{ user: SafeUser }> {

    const existingUser = await authRepository.findUserByEmail(input.email);

    if (existingUser) {

      throw new ConflictError('Email is already registered');

    }



    const passwordHash = await hashPassword(input.password);

    const user = await authRepository.createUser({

      email: input.email,

      passwordHash,

      firstName: input.firstName,

      lastName: input.lastName,

      phone: input.phone,

      role: UserRole.CUSTOMER,

    });



    void notificationService.create({
      userId: user.id,
      type: NotificationType.USER_REGISTERED,
      message: 'Welcome to AYARI! Start exploring our curated collection.',
      sendEmail: true,
    });

    return { user: toSafeUser(user) };

  }



  async login(input: LoginInput): Promise<{ user: SafeUser; tokens: AuthTokens }> {

    const user = await authRepository.findUserByEmail(input.email);

    if (!user) {

      throw new UnauthorizedError('Invalid email or password');

    }



    this.assertUserIsActive(user);



    const isPasswordValid = await comparePassword(input.password, user.passwordHash);

    if (!isPasswordValid) {

      throw new UnauthorizedError('Invalid email or password');

    }



    const tokens = this.buildTokens(user);

    await this.persistRefreshToken(user.id, tokens.refreshToken);



    void notificationService.create({
      userId: user.id,
      type: NotificationType.LOGIN_NEW_DEVICE,
      message: 'A new login to your AYARI account was detected.',
      metadata: { email: user.email },
    });

    return { user: toSafeUser(user), tokens };

  }



  async logout(refreshToken: string): Promise<void> {

    const storedToken = await authRepository.findRefreshToken(refreshToken);

    if (storedToken && !storedToken.revokedAt) {

      await authRepository.revokeRefreshToken(refreshToken);

    }

  }



  async refreshTokens(refreshToken: string): Promise<AuthTokens> {

    let payload;

    try {

      payload = verifyRefreshToken(refreshToken);

    } catch {

      throw new UnauthorizedError('Invalid or expired refresh token');

    }



    const storedToken = await authRepository.findRefreshToken(refreshToken);

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {

      throw new UnauthorizedError('Invalid or expired refresh token');

    }



    if (storedToken.userId !== payload.sub) {

      throw new UnauthorizedError('Invalid refresh token');

    }



    this.assertUserIsActive(storedToken.user);



    await authRepository.revokeRefreshToken(refreshToken);



    const tokens = this.buildTokens(storedToken.user);

    await this.persistRefreshToken(storedToken.user.id, tokens.refreshToken);



    return tokens;

  }



  async forgotPassword(input: ForgotPasswordInput): Promise<void> {

    const user = await authRepository.findUserByEmail(input.email);



    // Always return success to prevent email enumeration

    if (!user || !user.isActive) {

      return;

    }



    await this.sendPasswordResetOtp(user);

  }



  async resetPassword(input: ResetPasswordInput): Promise<void> {

    const user = await authRepository.findUserByEmail(input.email);

    if (!user || !user.isActive) {

      throw new BadRequestError('Invalid or expired verification code');

    }



    const hashedOtp = hashToken(input.otp);

    const resetToken = await authRepository.findPasswordResetTokenForUser(user.id, hashedOtp);



    if (!resetToken || resetToken.expiresAt < new Date()) {

      throw new BadRequestError('Invalid or expired verification code');

    }



    const passwordHash = await hashPassword(input.password);



    await authRepository.updatePassword(resetToken.userId, passwordHash);

    await authRepository.markPasswordResetTokenUsed(hashedOtp);

    await authRepository.revokeAllUserRefreshTokens(resetToken.userId);

    void notificationService.create({
      userId: resetToken.userId,
      type: NotificationType.PASSWORD_CHANGED,
      message: 'Your AYARI account password was changed successfully.',
      sendEmail: true,
    });

  }



  async resendOtp(input: ResendOtpInput): Promise<void> {

    const user = await authRepository.findUserByEmail(input.email);

    if (!user || !user.isActive) {

      return;

    }



    await this.sendPasswordResetOtp(user);

  }



  async getProfile(userId: string): Promise<SafeUser> {

    const user = await authRepository.findUserById(userId);

    if (!user) {

      throw new NotFoundError('User not found');

    }



    return toSafeUser(user);

  }

}



export const authService = new AuthService();

