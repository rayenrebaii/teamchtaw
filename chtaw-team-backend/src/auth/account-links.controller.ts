import { Body, Controller, Post } from "@nestjs/common";
import { Transform } from "class-transformer";
import { IsEmail, IsString, Length, Matches, MaxLength } from "class-validator";
import { Throttle } from "@nestjs/throttler";
import { Public } from "./security";
import { AccountLinksService } from "./account-links.service";
export class ForgotDto {
  @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(254) email!: string;
}
export class RedeemDto {
  @IsString() @Length(43, 43) @Matches(/^[A-Za-z0-9_-]+$/) token!: string;
  @IsString() @Length(12, 128) password!: string;
}
export class FirebaseInviteDto {
  @IsString() @Length(43, 43) @Matches(/^[A-Za-z0-9_-]+$/) token!: string;
  @IsString() @Length(100, 8192) idToken!: string;
}
@Public()
@Throttle({ default: { limit: 5, ttl: 60000 } })
@Controller("auth/account-links")
export class AccountLinksController {
  constructor(private links: AccountLinksService) {}
  @Post("forgot") forgot(@Body() dto: ForgotDto) { return this.links.forgot(dto.email); }
  @Post("redeem") redeem(@Body() dto: RedeemDto) { return this.links.redeem(dto.token, dto.password); }
  @Post("activate-firebase") activate(@Body() dto: FirebaseInviteDto) { return this.links.activateFirebase(dto.token, dto.idToken); }
}
