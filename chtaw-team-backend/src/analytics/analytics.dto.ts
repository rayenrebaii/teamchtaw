import { Type } from "class-transformer";
import { IsDateString, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

export class AnalyticsQuery {
  @IsOptional() @IsIn(["week", "month", "quarter", "year", "custom"])
  period: "week" | "month" | "quarter" | "year" | "custom" = "month";
  @IsOptional() @IsDateString({ strict: true }) from?: string;
  @IsOptional() @IsDateString({ strict: true }) to?: string;
  @IsOptional() @IsUUID() groupId?: string;
  @IsOptional() @IsIn(["day", "week", "month"])
  interval: "day" | "week" | "month" = "day";
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000)
  page = 1;
}
