import type { AuthenticatedSocket } from './socket.auth';

export class ConnectionManager {
  private readonly connections = new Map<string, Set<string>>();
  private readonly socketOrders = new Map<string, Set<string>>();

  register(socket: AuthenticatedSocket) {
    const userId = socket.data.user.id;
    if (!this.connections.has(userId)) {
      this.connections.set(userId, new Set());
    }
    this.connections.get(userId)!.add(socket.id);
    this.socketOrders.set(socket.id, new Set());
  }

  trackOrderRoom(socketId: string, room: string) {
    const rooms = this.socketOrders.get(socketId);
    if (rooms) rooms.add(room);
  }

  untrackOrderRoom(socketId: string, room: string) {
    const rooms = this.socketOrders.get(socketId);
    if (rooms) rooms.delete(room);
  }

  remove(socket: AuthenticatedSocket) {
    const userId = socket.data.user.id;
    const userSockets = this.connections.get(userId);
    userSockets?.delete(socket.id);
    if (userSockets?.size === 0) {
      this.connections.delete(userId);
    }
    this.socketOrders.delete(socket.id);
  }

  getActiveConnections(): number {
    let total = 0;
    this.connections.forEach((set) => {
      total += set.size;
    });
    return total;
  }

  getUserConnectionCount(userId: string): number {
    return this.connections.get(userId)?.size ?? 0;
  }
}

export const connectionManager = new ConnectionManager();
