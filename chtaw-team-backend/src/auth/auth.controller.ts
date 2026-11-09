import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { RefreshCookie } from "./refresh-cookie";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Actor } from "../common/access";
import { AuthService } from "./auth.service";
import { FirebaseLoginDto, LoginDto, RefreshDto, RegisterDto } from "./auth.dto";
import { AllowUnapproved, CurrentUser, Public } from "./security";
@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(
    private auth: AuthService,
    private cookie: RefreshCookie,
  ) {}
  @Public() @Throttle({ default: { limit: 5, ttl: 60000 } }) @Post("register") register(
    @Body() dto: RegisterDto,
  ) {
    return this.auth.register(dto);
  }
  @Public() @Throttle({ default: { limit: 5, ttl: 60000 } }) @Post("login") @HttpCode(200) login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.loginResponse(dto, request, response);
  }
  private async loginResponse(dto: LoginDto, request: Request, response: Response) {
    const browser = this.cookie.browser(request);
    if (browser) this.cookie.assertOrigin(request);
    const result = await this.auth.login(dto);
    response.setHeader("Cache-Control", "no-store");
    if (!browser) return result;
    this.cookie.set(response, result.refreshToken);
    const { refreshToken: _, ...safe } = result;
    return safe;
  }
  @Public() @Throttle({ default: { limit: 5, ttl: 60000 } }) @Post("firebase") @HttpCode(200)
  async firebaseLogin(@Body() dto: FirebaseLoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const browser = this.cookie.browser(request);
    if (browser) this.cookie.assertOrigin(request);
    response.setHeader("Cache-Control", "no-store");
    const result = await this.auth.firebaseLogin(dto);
    if (!browser) return result;
    this.cookie.set(response, result.refreshToken);
    const { refreshToken: _, ...safe } = result;
    return safe;
  }
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const browser = this.cookie.browser(request);
    if (browser) this.cookie.assertOrigin(request);
    response.setHeader("Cache-Control", "no-store");
    try {
      const raw = browser ? this.cookie.read(request) : dto.refreshToken;
      if (!raw) throw new UnauthorizedException("Refresh token requis.");
      const result = await this.auth.refresh(raw);
      if (!browser) return result;
      this.cookie.set(response, result.refreshToken);
      const { refreshToken: _, ...safe } = result;
      return safe;
    } catch (error) {
      if (browser && error instanceof UnauthorizedException) this.cookie.clear(response);
      throw error;
    }
  }
  @Public() @Post("logout-browser") @HttpCode(204)
  async logoutBrowser(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    this.cookie.assertOrigin(request);
    let raw: string | undefined;
    try { raw = this.cookie.read(request); }
    catch (error) { if (!(error instanceof UnauthorizedException)) throw error; }
    await this.auth.logoutBrowser(raw);
    this.cookie.clear(response);
  }
  @ApiBearerAuth() @AllowUnapproved() @Post("logout") @HttpCode(204) logout(
    @CurrentUser() actor: Actor,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (this.cookie.browser(request)) {
      this.cookie.assertOrigin(request);
      this.cookie.clear(response);
    }
    return this.auth.logout(actor);
  }
  @ApiBearerAuth() @AllowUnapproved() @Get("me") me(@CurrentUser() actor: Actor) {
    const { sessionId: _, ...user } = actor;
    return user;
  }
}
