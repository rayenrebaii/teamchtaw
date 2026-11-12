import { Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { PageDto } from "../common/query.dto";
export class NotificationQueryDto extends PageDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(["fr", "en"]) language?: "fr" | "en";
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(["true", "false"])
  unread?: string;
}
export class NotificationPreferenceDto {
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsBoolean() enabled?: boolean;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  messagesEnabled?: boolean;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsBoolean() pollsEnabled?: boolean;
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  sessionRemindersEnabled?: boolean;
}
class PushKeysDto {
  @IsString() @MaxLength(150) @Matches(/^[A-Za-z0-9_-]+={0,2}$/) p256dh!: string;
  @IsString() @MaxLength(100) @Matches(/^[A-Za-z0-9_-]+={0,2}$/) auth!: string;
}
export class SubscribePushDto {
  @IsString() @MaxLength(2048) endpoint!: string;
  @ValidateNested() @Type(() => PushKeysDto) keys!: PushKeysDto;
  @IsIn(["fr", "en"]) language: "fr" | "en" = "fr";
}
