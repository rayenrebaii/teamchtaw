import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsOptional,
  ValidateIf,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
export class CreateGroupDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  name!: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(500)
  description?: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;
}
export class UpdateGroupDto extends PartialType(CreateGroupDto, { skipNullProperties: false }) {
  @ApiPropertyOptional({ description: "ID of an image uploaded to this group" })
  @IsOptional()
  @IsUUID()
  imageMediaId?: string | null;
}
export class MoveMemberDto {
  @ApiProperty() @IsUUID() fromGroupId!: string;
  @ApiProperty() @IsUUID() toGroupId!: string;
}
