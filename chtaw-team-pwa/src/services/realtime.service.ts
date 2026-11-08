import { io, type Socket } from "socket.io-client";
import { api } from "./api-client";
import type { Message, Poll, Group, User } from "@/types";
export interface RealtimeHandlers {
  notification?: () => void;
  message: (message: Message) => void;
  poll: (poll: Poll) => void;
  pollDeleted?: (id: string) => void;
  group: (group: Group) => void;
  removed: (id: string) => void;
  membership: () => void;
  reviewed: (user: User) => void;
  deleted?: (id: string) => void;
  reconnected: () => Promise<void>;
  status: (state: "connecting" | "online" | "offline") => void;
}
export class RealtimeService {
  private socket: Socket | null = null;
  private wanted = new Set<string>();
  private joined = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;
  private unsubscribeToken?: () => void;
  private reconcileFlight: Promise<void> | null = null;
  private reconcileAgain = false;
  constructor(
    private handlers: RealtimeHandlers,
    private origin = process.env.NEXT_PUBLIC_SOCKET_URL ?? (process.env.NODE_ENV === "production" ? "" : "http://127.0.0.1:3002"),
  ) {}
  start() {
    this.stopped = false;
    this.handlers.status("connecting");
    const socket = io(`${this.origin.replace(/\/$/, "")}/community`, {
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
      auth: (callback) => {
        void api
          .accessToken()
          .then((token) => callback({ token }))
          .catch(() => callback({ token: "" }));
      },
    });
    this.socket = socket;
    this.unsubscribeToken = api.onToken(() => {
      if (!this.stopped && !socket.connected && !socket.active) socket.connect();
    });
    socket.on("session:ready", () => {
      this.joined.clear();
      void this.reconcile()
        .then(() => this.handlers.reconnected())
        .then(() => this.handlers.status("online"))
        .catch(() => this.handlers.status("offline"));
    });
    socket.on("message:created", this.handlers.message);
    socket.on("poll:created", this.handlers.poll);
    socket.on("poll:updated", this.handlers.poll);
    socket.on("poll:deleted", (event: { pollId: string }) => this.handlers.pollDeleted?.(event.pollId));
    socket.on("group:updated", this.handlers.group);
    socket.on("group:member-added", this.handlers.membership);
    socket.on("group:member-removed", (event: { groupId: string }) => {
      this.joined.delete(event.groupId);
      this.wanted.delete(event.groupId);
      this.handlers.removed(event.groupId);
      this.handlers.membership();
    });
    socket.on("group:removed", (event: { groupId: string }) => {
      this.handlers.removed(event.groupId);
      this.wanted.delete(event.groupId);
      this.joined.delete(event.groupId);
    });
    socket.on("user:reviewed", this.handlers.reviewed);
    socket.on("user:deleted", (event: { userId: string }) => {
      this.handlers.deleted?.(event.userId);
      this.handlers.membership();
    });
    socket.on("notification:changed", () => this.handlers.notification?.());
    socket.on("connect_error", () => this.handlers.status("offline"));
    socket.on("disconnect", (reason) => {
      this.joined.clear();
      this.handlers.status("offline");
      if (reason === "io server disconnect")
        this.timer = setTimeout(() => {
          if (!this.stopped)
            void api
              .refresh()
              .then(() => {
                if (!this.stopped) socket.connect();
              })
              .catch(() => {});
        }, 300);
    });
    socket.connect();
  }
  setGroups(ids: string[]) {
    this.wanted = new Set(ids);
    if (this.socket?.connected)
      void this.reconcile()
        .then(() => this.handlers.reconnected())
        .catch(() => this.handlers.status("offline"));
  }
  private async reconcile() {
    if (this.reconcileFlight) {
      this.reconcileAgain = true;
      return this.reconcileFlight;
    }
    this.reconcileFlight = this.joinWanted().finally(() => {
      this.reconcileFlight = null;
      if (this.reconcileAgain) {
        this.reconcileAgain = false;
        void this.reconcile().catch(() => this.handlers.status("offline"));
      }
    });
    return this.reconcileFlight;
  }
  private async joinWanted() {
    const socket = this.socket;
    if (!socket?.connected) return;
    for (const id of [...this.joined])
      if (!this.wanted.has(id)) {
        socket.emit("group:leave", { groupId: id });
        this.joined.delete(id);
      }
    for (const id of this.wanted) {
      if (this.joined.has(id)) continue;
      const result = (await socket.timeout(5000).emitWithAck("group:join", { groupId: id })) as {
        ok: boolean;
      };
      if (result.ok) this.joined.add(id);
    }
  }
  stop() {
    this.stopped = true;
    this.unsubscribeToken?.();
    clearTimeout(this.timer);
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.joined.clear();
  }
  reconnect() {
    this.socket?.io.engine?.close();
  }
}
