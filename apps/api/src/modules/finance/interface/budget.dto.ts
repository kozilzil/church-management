import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min, Max, IsUUID, ValidateIf, Matches, IsString, Length } from 'class-validator';
const Optional = () => ValidateIf((_o, v) => v !== undefined);
export class BudgetYearDto {
  @ApiProperty({ type: Number }) @Type(() => Number) @IsInt() @Min(1900) @Max(9999) year!: number;
}
export class BudgetQuery extends BudgetYearDto {
  @ApiProperty({ type: String, required: false }) @Optional() @IsUUID() fundId?: string;
}
export class BudgetLineDto extends BudgetYearDto {
  @ApiProperty({ type: String }) @IsUUID() accountId!: string;
  @ApiProperty({ type: String }) @IsUUID() fundId!: string;
}
export class BudgetRevisionDto extends BudgetLineDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(0) @Max(2147483646) version!: number;
  @ApiProperty({ type: String }) @Matches(/^(0|[1-9][0-9]{0,14})$/) amount!: string;
  @ApiProperty({ type: String }) @IsString() @Length(1, 300) @Matches(/\S/) reason!: string;
}
export class BudgetHistoryQuery extends BudgetLineDto {
  @ApiProperty({ type: Number, required: false })
  @Optional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  beforeVersion?: number;
}
