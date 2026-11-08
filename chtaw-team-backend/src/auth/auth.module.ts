import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";
import { AccessService } from "../common/access";
import { RefreshCookie } from "./refresh-cookie";
@Global()
@Module({
  imports: [PassportModule, JwtModule.register({})],
  providers: [AuthService, JwtStrategy, AccessService, RefreshCookie],
  controllers: [AuthController],
  exports: [AuthService, AccessService],
})
export class AuthModule {}
