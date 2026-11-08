import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  IsEnum,
  IsInt,
  Min,
  ValidateNested,
  MaxLength,
  MinLength,
} from "class-validator";
import { Type } from "class-transformer";
import { AttendanceStatus, PollStatus, PollType } from "@prisma/client";
export class CreatePollDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  question!: string;
  @ApiProperty({ type: [String], minItems: 1, maxItems: 100 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @MinLength(1, { each: true })
  @MaxLength(200, { each: true })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value.map((v: unknown) => (typeof v === "string" ? v.trim() : v))
      : value,
  )
  options!: string[];
  @ApiProperty({ default: true }) @IsBoolean() singleChoice!: boolean;
  @ApiPropertyOptional({ format: "date-time" })
  @IsOptional()
  @IsDateString({ strict: true })
  endsAt?: string;
  @ApiPropertyOptional({ enum: PollType }) @IsOptional() @IsEnum(PollType) type?: PollType;
  @ApiPropertyOptional({ enum: PollStatus }) @IsOptional() @IsEnum(PollStatus) status?: PollStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsDateString({ strict: true }, { each: true })
  startsAt?: string[];
  @ApiPropertyOptional({
    type: Boolean,
    description:
      "Séance obligatoire avec instantané des étudiants approuvés. false conserve le suivi historique.",
  })
  @IsOptional()
  @IsBoolean()
  mandatoryAttendance?: boolean;
  @ApiPropertyOptional({
    type: [String],
    format: "date-time",
    description:
      "Fins des créneaux ISO 8601, alignées sur options et startsAt. Obligatoires pour une séance obligatoire.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsDateString({ strict: true }, { each: true })
  slotEndsAt?: string[];
}
export class VoteDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID("all", { each: true })
  optionIds!: string[];
}
export class UpdateSessionDto extends CreatePollDto {}
export class AttendanceEntryDto {
  @IsUUID() userId!: string;
  @IsUUID() optionId!: string;
  @IsEnum(AttendanceStatus) status!: AttendanceStatus;
  @IsInt() @Min(0) version!: number;
  @IsOptional() @IsInt() @Min(0) participantVersion?: number;
}
export class ConfirmAbsenceDto {
  @IsInt() @Min(0) version!: number;
}
export class SessionParticipantDto extends ConfirmAbsenceDto {
  @IsBoolean() included!: boolean;
}
export class SaveAttendanceDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  entries!: AttendanceEntryDto[];
}
