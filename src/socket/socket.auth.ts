import type { Socket } from 'socket.io';
import { UserRole } from '@prisma/client';
import { prisma } from '../database/prisma';
import { verifyAccessToken } from '../utils/jwt.util';
import type { SocketUser } from './socket.types';

export interface AuthenticatedSocket extends Socket {
  data: {
    user: SocketUser;
  };
}

export async function authenticateSocket(socket: Socket, next: (err?: Error) => void) {
  try {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');

    if (!token) {
      next(new Error('Authentication required'));
      return;
    }

    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      next(new Error('Invalid or inactive user'));
      return;
    }

    (socket as AuthenticatedSocket).data = {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };

    next();
  } catch {
    next(new Error('Invalid token'));
  }
}

export function isAdmin(socket: AuthenticatedSocket): boolean {
  return socket.data.user.role === UserRole.ADMIN;
}
