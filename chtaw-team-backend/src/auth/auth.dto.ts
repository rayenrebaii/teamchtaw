import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from "class-validator";
import { normalizeTunisianPhone } from "./phone";
import { ApiProperty } from "@nestjs/swagger";
export class LoginDto {
  @ApiProperty({ example: "membre@example.com" })
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  email!: string;
  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
export class RegisterDto extends LoginDto {
  @Transform(({ value }: { value: unknown }) => normalizeTunisianPhone(value))
  @IsString() @Matches(/^\+216\d{8}$/, { message: "Saisissez un numéro tunisien de 8 chiffres (+216)." })
  phone!: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsUUID()
  establishmentId?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() @MaxLength(120)
  proposedEstablishmentName?: string;
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  firstName!: string;
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value))
  lastName!: string;
}
export class RefreshDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(20)
  @MaxLength(2048)
  refreshToken?: string;
}
export class FirebaseLoginDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => normalizeTunisianPhone(value))
  @IsString() @Matches(/^\+216\d{8}$/, { message: "Saisissez un numéro tunisien de 8 chiffres (+216)." })
  phone?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsUUID()
  establishmentId?: string;
  @ValidateIf((_object, value: unknown) => value !== undefined) @IsString() @MaxLength(120)
  proposedEstablishmentName?: string;
  @IsString() @MinLength(100) @MaxLength(8192)
  idToken!: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60)
  @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value)
  firstName?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60)
  @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value)
  lastName?: string;
}
