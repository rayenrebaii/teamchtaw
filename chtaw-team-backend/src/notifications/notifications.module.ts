import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Module,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client } from "pg";
import { Actor } from "../common/access";
import { CurrentUser } from "../auth/security";
import { DomainEvents } from "../common/events";
import { NotificationsService } from "./notifications.service";
import { NotificationsWorker } from "./notifications.worker";
import {
  NotificationPreferenceDto,
  NotificationQueryDto,
  SubscribePushDto,
} from "./notifications.dto";
import { PushTransport } from "./push.transport";
@Controller("notifications")
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}
  @Get() list(@CurrentUser() actor: Actor, @Query() query: NotificationQueryDto) {
    return this.notifications.list(actor, query);
  }
  @Get("preferences") preferences(@CurrentUser() actor: Actor) {
    return this.notifications.settings(actor);
  }
  @Patch("preferences") settings(
    @CurrentUser() actor: Actor,
    @Body() dto: NotificationPreferenceDto,
  ) {
    return this.notifications.updateSettings(actor, dto);
  }
  @Get("push-config") configuration() {
    return this.notifications.configuration();
  }
  @Get("subscriptions") subscriptions(@CurrentUser() actor: Actor) {
    return this.notifications.subscriptions(actor);
  }
  @Post("subscriptions") subscribe(@CurrentUser() actor: Actor, @Body() dto: SubscribePushDto) {
    return this.notifications.subscribe(actor, dto);
  }
  @Delete("subscriptions/:id") @HttpCode(204) unsubscribe(
    @CurrentUser() actor: Actor,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.notifications.unsubscribe(actor, id);
  }
  @Patch("read-all") readAll(@CurrentUser() actor: Actor) {
    return this.notifications.read(actor);
  }
  @Patch(":id/read") read(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string) {
    return this.notifications.read(actor, id);
  }
  @Get(":id/target") target(@CurrentUser() actor: Actor, @Param("id", ParseUUIDPipe) id: string) {
    return this.notifications.target(actor, id);
  }
}
@Injectable()
export class NotificationFeed implements OnModuleInit, OnModuleDestroy {
  private client?: Client;
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;
  private logger = new Logger(NotificationFeed.name);
  constructor(
    private config: ConfigService,
    private events: DomainEvents,
  ) {}
  async onModuleInit() {
    await this.connect();
  }
  private async connect() {
    if (this.closed) return;
    const previous = this.client;
    const client = new Client({
      connectionString: this.config.getOrThrow<string>("DATABASE_URL"),
      connectionTimeoutMillis: 5000,
    });
    this.client = client;
    void previous?.end().catch(() => undefined);
    const retry = () => {
      if (this.closed || this.timer || this.client !== client) return;
      this.timer = setTimeout(() => {
        this.timer = undefined;
        void this.connect();
      }, 3000);
      this.timer.unref();
    };
    client.on("error", retry);
    client.on("end", retry);
    client.on("notification", (event) => {
      if (event.channel === "chtaw_notifications" && /^[a-f0-9-]{36}$/i.test(event.payload ?? "")) {
        void this.events.publish({
          name: "notification:changed",
          userId: event.payload,
          payload: {},
        });
      }
    });
    try {
      await client.connect();
      await client.query("LISTEN chtaw_notifications");
    } catch {
      this.logger.warn("Notification feed reconnecting; HTTP history remains available.");
      await client.end().catch(() => undefined);
      retry();
    }
  }
  async onModuleDestroy() {
    this.closed = true;
    clearTimeout(this.timer);
    await this.client?.end().catch(() => undefined);
  }
}
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsWorker, PushTransport, NotificationFeed],
  exports: [NotificationsService, NotificationsWorker, PushTransport],
})
export class NotificationsModule {}
