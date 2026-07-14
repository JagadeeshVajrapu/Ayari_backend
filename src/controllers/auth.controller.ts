import { Request, Response } from 'express';

import { UserRole } from '@prisma/client';

import { authService } from '../services/auth.service';

import { asyncHandler } from '../utils/asyncHandler.util';

import { sendSuccess } from '../utils/apiResponse.util';

import {

  clearRefreshTokenCookie,

  getRefreshTokenFromCookie,

  setRefreshTokenCookie,

} from '../utils/cookie.util';

import {

  ForgotPasswordInput,

  LoginInput,

  RegisterInput,

  ResetPasswordInput,

  ResendOtpInput,

} from '../validators/auth.validator';



export class AuthController {

  register = asyncHandler(async (req: Request, res: Response) => {

    const input = req.body as RegisterInput;

    const { user } = await authService.register(input);



    sendSuccess(res, 'Account created successfully. You can sign in now.', { user }, 201);

  });



  login = asyncHandler(async (req: Request, res: Response) => {

    const input = req.body as LoginInput;

    const { user, tokens } = await authService.login(input);



    setRefreshTokenCookie(res, tokens.refreshToken);



    sendSuccess(res, 'Login successful', {

      user,

      accessToken: tokens.accessToken,

    });

  });



  logout = asyncHandler(async (req: Request, res: Response) => {

    const refreshToken = getRefreshTokenFromCookie(req.cookies as Record<string, string>);



    if (refreshToken) {

      await authService.logout(refreshToken);

    }



    clearRefreshTokenCookie(res);

    sendSuccess(res, 'Logout successful', null);

  });



  refreshToken = asyncHandler(async (req: Request, res: Response) => {

    const cookieToken = getRefreshTokenFromCookie(req.cookies as Record<string, string>);

    const bodyToken = req.body?.refreshToken as string | undefined;

    const refreshToken = cookieToken ?? bodyToken;



    if (!refreshToken) {

      res.status(401).json({ success: false, message: 'Refresh token is required' });

      return;

    }



    const tokens = await authService.refreshTokens(refreshToken);



    setRefreshTokenCookie(res, tokens.refreshToken);



    sendSuccess(res, 'Token refreshed successfully', {

      accessToken: tokens.accessToken,

    });

  });



  forgotPassword = asyncHandler(async (req: Request, res: Response) => {

    const input = req.body as ForgotPasswordInput;

    await authService.forgotPassword(input);



    sendSuccess(

      res,

      'If an account with that email exists, a password reset code has been sent',

      null,

    );

  });



  resetPassword = asyncHandler(async (req: Request, res: Response) => {

    const input = req.body as ResetPasswordInput;

    await authService.resetPassword(input);



    sendSuccess(res, 'Password reset successful', null);

  });



  resendOtp = asyncHandler(async (req: Request, res: Response) => {

    const input = req.body as ResendOtpInput;

    await authService.resendOtp(input);



    sendSuccess(res, 'If an account with that email exists, a new reset code has been sent', null);

  });



  getProfile = asyncHandler(async (req: Request, res: Response) => {

    const user = await authService.getProfile(req.user!.id);

    sendSuccess(res, 'Profile retrieved successfully', { user });

  });



  adminOnly = asyncHandler(async (req: Request, res: Response) => {

    sendSuccess(res, 'Admin access granted', {

      user: req.user,

      role: UserRole.ADMIN,

    });

  });

}



export const authController = new AuthController();

