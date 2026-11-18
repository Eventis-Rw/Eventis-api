import type { Server as HttpServer } from "node:http";

import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Server, type Socket } from "socket.io";
import { z } from "zod";

import { AppError } from "../../../common/errors/app-error.js";
import { VerifyAccessTokenService } from "../../identity/index.js";
import { ChatService } from "../application/chat.service.js";
import { PolicyViolationError } from "../domain/chat.js";

const conversationIdSchema = z.object({ conversationId: z.string().uuid() });
const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  content: z.string().trim().min(1).max(4000),
  replyToId: z.string().uuid().optional(),
  clientMessageId: z.string().trim().min(1).max(80).optional(),
});
const deliveredSchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid().optional(),
});
const callSignalSchema = z.object({
  callId: z.string().uuid(),
  signal: z.record(z.string(), z.unknown()),
});

type Acknowledge = (
  result: { ok: true; data?: unknown } | { ok: false; error: string },
) => void;

@Injectable()
export class ChatRealtimeGateway implements OnModuleDestroy {
  private readonly logger = new Logger(ChatRealtimeGateway.name);
  private io: Server | null = null;
  private readonly userIdBySocketId = new Map<string, string>();

  constructor(
    private readonly verifyAccessToken: VerifyAccessTokenService,
    private readonly chat: ChatService,
  ) {}

  attach(server: HttpServer): void {
    if (this.io) throw new Error("Chat realtime gateway is already attached");

    const io = new Server(server, {
      path: "/socket.io",
      serveClient: false,
      maxHttpBufferSize: 16 * 1024,
    });
    io.use((socket, next) => {
      const token: unknown = socket.handshake.auth.token;
      if (typeof token !== "string" || token.length === 0) {
        next(new Error("UNAUTHENTICATED"));
        return;
      }
      void this.verifyAccessToken.execute(token).then(
        (claims) => {
          this.userIdBySocketId.set(socket.id, claims.sub);
          next();
        },
        () => next(new Error("UNAUTHENTICATED")),
      );
    });
    io.on("connection", (socket) => this.onConnection(socket));
    this.io = io;
    this.chat.attachRealtimeServer(io);
  }

  async close(): Promise<void> {
    const io = this.io;
    this.io = null;
    if (!io) return;
    await io.close();
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  private onConnection(socket: Socket): void {
    const userId = this.userIdBySocketId.get(socket.id);
    if (typeof userId !== "string") {
      socket.disconnect(true);
      return;
    }
    this.chat.registerRealtimeSocket(userId, socket.id);
    socket.on("disconnect", () => {
      this.userIdBySocketId.delete(socket.id);
      this.chat.unregisterRealtimeSocket(socket.id);
    });

    socket.on(
      "chat:conversation:join",
      (payload: unknown, acknowledge?: Acknowledge) => {
        void this.handle(socket, acknowledge, async () => {
          const { conversationId } = conversationIdSchema.parse(payload);
          await this.chat.getConversation(userId, conversationId);
          await socket.join(`conversation:${conversationId}`);
          return { conversationId };
        });
      },
    );
    socket.on(
      "chat:conversation:leave",
      (payload: unknown, acknowledge?: Acknowledge) => {
        void this.handle(socket, acknowledge, async () => {
          const { conversationId } = conversationIdSchema.parse(payload);
          await this.chat.getConversation(userId, conversationId);
          await socket.leave(`conversation:${conversationId}`);
          return { conversationId };
        });
      },
    );
    socket.on(
      "chat:message:send",
      (payload: unknown, acknowledge?: Acknowledge) => {
        void this.handle(socket, acknowledge, async () => {
          const input = sendMessageSchema.parse(payload);
          return this.chat.sendMessage(userId, input.conversationId, {
            content: input.content,
            ...(input.replyToId ? { replyToId: input.replyToId } : {}),
            ...(input.clientMessageId
              ? { clientMessageId: input.clientMessageId }
              : {}),
          });
        });
      },
    );
    socket.on(
      "chat:receipt:delivered",
      (payload: unknown, acknowledge?: Acknowledge) => {
        void this.handle(socket, acknowledge, async () => {
          const input = deliveredSchema.parse(payload);
          return this.chat.markDelivered(
            userId,
            input.conversationId,
            input.messageId,
          );
        });
      },
    );
    socket.on(
      "chat:receipt:read",
      (payload: unknown, acknowledge?: Acknowledge) => {
        void this.handle(socket, acknowledge, async () => {
          const { conversationId } = conversationIdSchema.parse(payload);
          return this.chat.markRead(userId, conversationId);
        });
      },
    );
    socket.on(
      "chat:call:signal",
      (payload: unknown, acknowledge?: Acknowledge) => {
        void this.handle(socket, acknowledge, async () => {
          const input = callSignalSchema.parse(payload);
          if (JSON.stringify(input.signal).length > 8_000) {
            throw AppError.validation({
              signal: ["Call signaling payload must not exceed 8 KB"],
            });
          }
          await this.chat.relayCallSignal(userId, input.callId, input.signal);
          return { callId: input.callId };
        });
      },
    );
  }

  private async handle<T>(
    socket: Socket,
    acknowledge: Acknowledge | undefined,
    action: () => Promise<T>,
  ): Promise<void> {
    try {
      const data = await action();
      acknowledge?.({ ok: true, data });
    } catch (error) {
      const message =
        error instanceof PolicyViolationError
          ? error.code
          : error instanceof AppError
            ? error.code
            : error instanceof z.ZodError
              ? "VALIDATION_FAILED"
              : "INTERNAL_ERROR";
      if (message === "INTERNAL_ERROR") {
        this.logger.error(
          { err: error, socketId: socket.id },
          "unhandled chat realtime error",
        );
      }
      acknowledge?.({ ok: false, error: message });
      socket.emit("chat:error", { error: message });
    }
  }
}
