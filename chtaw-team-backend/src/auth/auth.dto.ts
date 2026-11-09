import { Transform } from "class-transformer";
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
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
  @IsString() @MinLength(100) @MaxLength(8192)
  idToken!: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60)
  @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value)
  firstName?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60)
  @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value)
  lastName?: string;
}
