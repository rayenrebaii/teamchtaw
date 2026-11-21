import { Type } from "class-transformer";
import { IsEnum, IsIn, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from "class-validator";
import { AccountStatus } from "@prisma/client";

export class MembersQueryDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(1000000)
  page: number = 1;
  @IsOptional() @IsString() @MaxLength(254)
  search?: string;
  @IsOptional() @IsEnum(AccountStatus)
  status?: AccountStatus;
  @IsOptional() @IsUUID()
  groupId?: string;
  @IsOptional() @IsISO8601({ strict: true })
  from?: string;
  @IsOptional() @IsISO8601({ strict: true })
  before?: string;
  @IsIn(["recent", "oldest"])
  order: "recent" | "oldest" = "recent";
}
