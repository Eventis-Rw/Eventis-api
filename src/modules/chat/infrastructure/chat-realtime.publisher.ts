import { Injectable } from "@nestjs/common";
import type { Server } from "socket.io";

@Injectable()
export class ChatRealtimePublisher {
  private server: Server | null = null;
  private readonly socketsByUser = new Map<string, Set<string>>();
  private readonly userBySocket = new Map<string, string>();

  attach(server: Server): void {
    this.server = server;
  }

  register(userId: string, socketId: string): void {
    this.userBySocket.set(socketId, userId);
    const sockets = this.socketsByUser.get(userId) ?? new Set<string>();
    sockets.add(socketId);
    this.socketsByUser.set(userId, sockets);
  }

  unregister(socketId: string): void {
    const userId = this.userBySocket.get(socketId);
    this.userBySocket.delete(socketId);
    if (!userId) return;
    const sockets = this.socketsByUser.get(userId);
    sockets?.delete(socketId);
    if (sockets && sockets.size === 0) {
      this.socketsByUser.delete(userId);
    }
  }

  userIdFor(socketId: string): string | undefined {
    return this.userBySocket.get(socketId);
  }

  emitToUser(userId: string, event: string, payload: unknown): void {
    const server = this.server;
    const sockets = this.socketsByUser.get(userId);
    if (!server || !sockets) return;
    for (const socketId of sockets) {
      server.to(socketId).emit(event, payload);
    }
  }

  emitToUsers(userIds: string[], event: string, payload: unknown): void {
    const unique = new Set(userIds);
    for (const userId of unique) {
      this.emitToUser(userId, event, payload);
    }
  }

  isOnline(userId: string): boolean {
    return (this.socketsByUser.get(userId)?.size ?? 0) > 0;
  }
}
