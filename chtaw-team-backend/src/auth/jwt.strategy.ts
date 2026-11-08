import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AuthService, TokenClaims } from "./auth.service";
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private auth: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      algorithms: ["HS256"],
      issuer: "chtaw-team",
      audience: "chtaw-pwa",
    });
  }
  validate(claims: TokenClaims) {
    return this.auth.resolveClaims(claims);
  }
}
