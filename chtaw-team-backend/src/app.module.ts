import { Controller, Get, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { ApiTags } from "@nestjs/swagger";
import { validateEnvironment } from "./config/environment";
import { PrismaModule, PrismaService } from "./prisma/prisma.module";
import { EventsModule } from "./common/events";
import { AuthModule } from "./auth/auth.module";
import { JwtGuard, PermissionsGuard, Public } from "./auth/security";
import { UsersModule } from "./users/users.module";
import { ApprovalsModule } from "./approvals/approvals.module";
import { GroupsModule } from "./groups/groups.module";
import { MessagesModule } from "./messages/messages.module";
import { PollsModule } from "./polls/polls.module";
import { AttendanceModule } from "./polls/attendance.controller";
import { UploadsModule } from "./uploads/uploads.module";
import { StorageModule } from "./uploads/storage.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ExecutionContext, Injectable } from "@nestjs/common";
@Injectable()
class HttpThrottleGuard extends ThrottlerGuard {
  override canActivate(ctx: ExecutionContext) {
    return ctx.getType() === "http" ? super.canActivate(ctx) : Promise.resolve(true);
  }
}
@ApiTags("Health")
@Controller("health")
class HealthController {
  constructor(private db: PrismaService) {}
  @Public() @Get() async health() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: "ok" };
  }
}
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    PrismaModule,
    EventsModule,
    AuthModule,
    UsersModule,
    ApprovalsModule,
    GroupsModule,
    MessagesModule,
    StorageModule,
    UploadsModule,
    PollsModule,
    AttendanceModule,
    RealtimeModule,
    NotificationsModule,
    ThrottlerModule.forRoot([{ name: "default", ttl: 60000, limit: 120 }]),
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: HttpThrottleGuard },
    { provide: APP_GUARD, useClass: JwtGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
