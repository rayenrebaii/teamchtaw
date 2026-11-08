import { Type, Transform } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
export class AttendanceQueryDto {
  @IsOptional() @IsIn(["UPCOMING", "ONGOING", "FINISHED", "CANCELLED", "LEGACY"]) phase?: string;
  @IsOptional() @IsIn(["ACTIVE", "RESOLVED", "ALL"]) reportStatus?: string;
  @IsOptional() @IsUUID() groupId?: string;
  @IsOptional() @IsUUID() pollId?: string;
  @IsOptional()
  @IsString()
  @MaxLength(254)
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  search?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) to?: string;
  @IsOptional() @IsIn(["true", "false"]) threshold?: string;
  @IsOptional() @IsIn(["asc", "desc"]) order: "asc" | "desc" = "desc";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number = 20;
}

export class PersonalAttendanceQueryDto {
  @IsOptional() @IsUUID() pollId?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) @IsDateString({ strict: true }) to?: string;
  @IsOptional() @IsIn(["UPCOMING", "PRESENT", "ABSENT", "PENDING", "CANCELLED"]) status?: "UPCOMING" | "PRESENT" | "ABSENT" | "PENDING" | "CANCELLED";
  @IsOptional() @IsUUID() groupId?: string;
  @IsOptional() @IsIn(["recommended", "asc", "desc"]) order: "recommended" | "asc" | "desc" = "recommended";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number = 20;
  @IsOptional() @IsString() @MaxLength(100) timeZone: string = "Africa/Tunis";
}
