import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg(
        {
          connectionString: config.getOrThrow<string>("DATABASE_URL"),
          max: 10,
          connectionTimeoutMillis: 5000,
        },
        {
          schema:
            new URL(config.getOrThrow<string>("DATABASE_URL")).searchParams.get("schema") ??
            "public",
        },
      ),
      omit: { user: { passwordHash: true }, refreshSession: { tokenHash: true } },
    });
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
