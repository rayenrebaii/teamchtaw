import { Module, OnModuleDestroy } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { IsUUID } from "class-validator";
import { plainToInstance } from "class-transformer";
import { validateOrReject } from "class-validator";
import type { Server, Socket } from "socket.io";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.module";
import { AccessService } from "../common/access";
import { DomainEvent, DomainEvents } from "../common/events";
import { MessagesModule, MessagesService, SendMessageDto } from "../messages/messages.module";
export class GroupEventDto {
  @IsUUID() groupId!: string;
}
export class SendEventDto extends SendMessageDto {
  @IsUUID() groupId!: string;
}
async function validated<T extends object>(type: new () => T, input: unknown): Promise<T> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw Error("Données invalides.");
  const dto = plainToInstance(type, input);
  await validateOrReject(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
    validationError: { target: false, value: false },
  });
  return dto;
}
@WebSocketGateway({ namespace: "/community" })
export class CommunityGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, OnModuleDestroy
{
  @WebSocketServer() private server!: Server;
  private unsubscribe?: () => void;
  private timers = new Map<string, NodeJS.Timeout>();
  constructor(
    private auth: AuthService,
    private db: PrismaService,
    private access: AccessService,
    private events: DomainEvents,
    private messages: MessagesService,
    private jwt: JwtService,
  ) {}
  afterInit() {
    this.unsubscribe = this.events.subscribe((event) => this.deliver(event));
  }
  onModuleDestroy() {
    this.unsubscribe?.();
    for (const timer of this.timers.values()) clearTimeout(timer);
  }
  async handleConnection(socket: Socket) {
    try {
      const raw: unknown = socket.handshake.auth?.token;
      if (typeof raw !== "string" || raw.length > 2048) throw Error();
      const actor = await this.auth.verifyAccess(raw);
      socket.data.token = raw;
      socket.data.actor = actor;
      socket.data.count = 0;
      socket.data.window = Date.now();
      await socket.join([`user:${actor.id}`, `session:${actor.sessionId}`]);
      const claims = this.jwt.decode<{ exp: number }>(raw);
      this.timers.set(
        socket.id,
        setTimeout(() => socket.disconnect(true), Math.max(0, claims.exp * 1000 - Date.now())),
      );
      socket.use((_packet, next) => {
        void this.checkPacket(socket)
          .then(() => next())
          .catch(() => socket.disconnect(true));
      });
      socket.emit("session:ready", { userId: actor.id, status: actor.status });
    } catch {
      socket.disconnect(true);
    }
  }
  handleDisconnect(socket: Socket) {
    const timer = this.timers.get(socket.id);
    if (timer) clearTimeout(timer);
    this.timers.delete(socket.id);
  }
  private async checkPacket(socket: Socket) {
    const now = Date.now();
    if (now - Number(socket.data.window) > 60000) {
      socket.data.window = now;
      socket.data.count = 0;
    }
    socket.data.count = Number(socket.data.count) + 1;
    if (Number(socket.data.count) > 60) throw Error();
    socket.data.actor = await this.auth.verifyAccess(String(socket.data.token));
  }
  @SubscribeMessage("group:join") async join(
    @ConnectedSocket() socket: Socket,
    @MessageBody() input: unknown,
  ) {
    try {
      const dto = await validated(GroupEventDto, input);
      const actor = await this.auth.verifyAccess(String(socket.data.token));
      await this.db.$transaction(async (tx) => {
        await this.access.group(tx, actor, dto.groupId);
        await socket.join(`group:${dto.groupId}`);
      });
      return { ok: true, groupId: dto.groupId };
    } catch {
      return {
        ok: false,
        error: { code: "FORBIDDEN", message: "Groupe inaccessible ou données invalides." },
      };
    }
  }
  @SubscribeMessage("group:leave") async leave(
    @ConnectedSocket() socket: Socket,
    @MessageBody() input: unknown,
  ) {
    try {
      const dto = await validated(GroupEventDto, input);
      await this.auth.verifyAccess(String(socket.data.token));
      await socket.leave(`group:${dto.groupId}`);
      return { ok: true };
    } catch {
      return { ok: false, error: { code: "INVALID_REQUEST", message: "Requête invalide." } };
    }
  }
  @SubscribeMessage("message:send") async send(
    @ConnectedSocket() socket: Socket,
    @MessageBody() input: unknown,
  ) {
    try {
      const dto = await validated(SendEventDto, input);
      const actor = await this.auth.verifyAccess(String(socket.data.token));
      const message = await this.messages.send(actor, dto.groupId, { text: dto.text });
      return { ok: true, message };
    } catch {
      return {
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Envoi refusé : vérifiez votre session, le groupe et le message.",
        },
      };
    }
  }
  private async deliver(event: DomainEvent) {
    if (event.name === "user:deleted" && event.userId) {
      const sockets = await this.server.fetchSockets();
      await Promise.all(sockets.map(async (socket) => {
        try {
          await this.auth.verifyAccess(String(socket.data.token));
          socket.emit(event.name, event.payload);
        } catch { socket.disconnect(true); }
      }));
      return;
    }
    if (event.name === "notification:changed" && event.userId) {
      const sockets = await this.server.in(`user:${event.userId}`).fetchSockets();
      await Promise.all(sockets.map(async (socket) => {
        try {
          const actor = await this.auth.verifyAccess(String(socket.data.token));
          if (actor.id === event.userId && actor.status === "APPROVED") socket.emit("notification:changed", {});
        } catch { socket.disconnect(true); }
      }));
      return;
    }
    if (event.name === "session:revoked" && event.sessionId) {
      this.server.in(`session:${event.sessionId}`).disconnectSockets(true);
      return;
    }
    if (event.name === "user:reviewed" && event.userId) {
      this.server.to(`user:${event.userId}`).emit(event.name, event.payload);
      return;
    }
    if (event.name === "group:removed" && event.groupId) {
      this.server.to(`group:${event.groupId}`).emit(event.name, event.payload);
      this.server.in(`group:${event.groupId}`).socketsLeave(`group:${event.groupId}`);
      return;
    }
    if (event.name === "group:member-removed" && event.userId && event.groupId) {
      const sockets = await this.server.in(`user:${event.userId}`).fetchSockets();
      for (const socket of sockets) await socket.leave(`group:${event.groupId}`);
      this.server.to(`user:${event.userId}`).emit(event.name, event.payload);
      return;
    }
    if (event.name === "group:member-added" && event.userId && event.groupId) {
      this.server.to(`user:${event.userId}`).emit(event.name, event.payload);
      return;
    }
    if (event.groupId) {
      const sockets = await this.server.in(`group:${event.groupId}`).fetchSockets();
      await Promise.all(
        sockets.map(async (socket) => {
          try {
            const actor = await this.auth.verifyAccess(String(socket.data.token));
            await this.db.$transaction(async (tx) => {
              await this.access.group(tx, actor, event.groupId!);
              socket.emit(event.name, event.payload);
            });
          } catch {
            await socket.leave(`group:${event.groupId}`);
          }
        }),
      );
    }
  }
}
@Module({ imports: [MessagesModule], providers: [CommunityGateway, JwtService] })
export class RealtimeModule {}
