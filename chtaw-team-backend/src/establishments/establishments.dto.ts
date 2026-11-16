import { ApiProperty } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsString, MaxLength, MinLength } from "class-validator";

export class EstablishmentDto {
  @ApiProperty({ maxLength: 120, description: "High school name" })
  @Transform(({ value }: { value: unknown }) => typeof value === "string" ? value.trim() : value)
  @IsString({ message: "Le nom du lycée est obligatoire." })
  @MinLength(1, { message: "Le nom du lycée est obligatoire." })
  @MaxLength(120, { message: "Le nom du lycée ne doit pas dépasser 120 caractères." })
  name!: string;
}
