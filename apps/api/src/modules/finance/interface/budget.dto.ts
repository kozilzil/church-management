import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  Min,
  Max,
  IsUUID,
  ValidateIf,
  Matches,
  IsString,
  Length,
  IsIn,
} from 'class-validator';
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

export class BudgetChangesQuery extends BudgetQuery {
  @ApiProperty({ type: String, required: false }) @Optional() @IsUUID() cursor?: string;
}
export class BudgetDecisionDto {
  @ApiProperty({ type: String }) @IsIn(['APPROVED', 'REJECTED']) decision!: 'APPROVED' | 'REJECTED';
  @ApiProperty({ type: String }) @IsString() @Length(1, 300) @Matches(/\S/) reason!: string;
}
export class BudgetCancelDto {
  @ApiProperty({ type: String }) @IsString() @Length(1, 300) @Matches(/\S/) reason!: string;
}
export class BudgetPolicyDto extends BudgetCancelDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(0) @Max(2147483646) version!: number;
  @ApiProperty({ type: String }) @IsIn(['WARN', 'BLOCK']) mode!: 'WARN' | 'BLOCK';
}
