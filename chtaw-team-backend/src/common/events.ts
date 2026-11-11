import { Global, Injectable, Logger, Module } from "@nestjs/common";
export interface DomainEvent {
  name:
    | "message:created"
    | "message:deleted"
    | "poll:created"
    | "poll:updated"
    | "poll:deleted"
    | "group:updated"
    | "group:removed"
    | "group:member-added"
    | "group:member-removed"
    | "user:reviewed"
    | "user:deleted"
    | "session:revoked"
    | "notification:changed";
  groupId?: string;
  userId?: string;
  sessionId?: string;
  payload: unknown;
}
@Injectable()
export class DomainEvents {
  private readonly logger = new Logger(DomainEvents.name);
  private listeners = new Set<(event: DomainEvent) => Promise<void>>();
  subscribe(listener: (event: DomainEvent) => Promise<void>) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  async publish(event: DomainEvent) {
    const results = await Promise.allSettled(
      [...this.listeners].map((listener) => listener(event)),
    );
    if (results.some((r) => r.status === "rejected"))
      this.logger.warn(`Delivery failed: ${event.name}`);
  }
}
@Global()
@Module({ providers: [DomainEvents], exports: [DomainEvents] })
export class EventsModule {}
