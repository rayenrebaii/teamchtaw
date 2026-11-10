import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";
import { AccessService } from "../common/access";
import { RefreshCookie } from "./refresh-cookie";
import { FirebaseIdentity } from "./firebase.service";
import { AccountLinksController } from "./account-links.controller";
import { AccountLinksService, AccountMailer } from "./account-links.service";
@Global()
@Module({
  imports: [PassportModule, JwtModule.register({})],
  providers: [AuthService, JwtStrategy, AccessService, RefreshCookie, FirebaseIdentity, AccountLinksService, AccountMailer],
  controllers: [AuthController, AccountLinksController],
  exports: [AuthService, AccessService, FirebaseIdentity, AccountLinksService],
})
export class AuthModule {}
