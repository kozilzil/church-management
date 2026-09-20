import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsIn,
  Length,
  Matches,
  IsUUID,
  IsInt,
  Min,
  Max,
  IsArray,
  ArrayMaxSize,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';
const Optional = () => ValidateIf((_o, v) => v !== undefined);
export class FinancePageDto {
  @ApiProperty({ type: String, required: false }) @Optional() @IsUUID() cursor?: string;
  @ApiProperty({ type: Number, required: false })
  @Optional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
  @ApiProperty({ type: String, required: false })
  @Optional()
  @IsIn([
    'all',
    'mine',
    'review',
    'pay',
    'DRAFT',
    'IN_REVIEW',
    'RETURNED',
    'APPROVED',
    'PAID',
    'CANCELLED',
  ])
  state?: string;
}
export class AccountDto {
  @ApiProperty({ type: String }) @Matches(/^[A-Z0-9_-]{1,30}$/) code!: string;
  @ApiProperty({ type: String }) @IsString() @Length(1, 80) @Matches(/\S/) name!: string;
  @ApiProperty({ type: String })
  @IsIn(['ASSET', 'LIABILITY', 'NET_ASSETS', 'REVENUE', 'EXPENSE'])
  kind!: string;
}
export class FundDto {
  @ApiProperty({ type: String }) @IsString() @Length(1, 80) @Matches(/\S/) name!: string;
}
export class PeriodDto extends FundDto {
  @ApiProperty({ type: String }) @Matches(/^\d{4}-\d{2}-\d{2}$/) startsOn!: string;
  @ApiProperty({ type: String }) @Matches(/^\d{4}-\d{2}-\d{2}$/) endsOn!: string;
}
export class ExpenseDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(1900) @Max(9999) budgetYear!: number;
  @ApiProperty({ type: String }) @IsString() @Length(1, 120) @Matches(/\S/) title!: string;
  @ApiProperty({ type: String }) @IsString() @Length(1, 2000) @Matches(/\S/) purpose!: string;
  @ApiProperty({ type: String }) @IsString() @Length(1, 100) @Matches(/\S/) payee!: string;
  @ApiProperty({ type: Number }) @IsInt() @Min(1) @Max(999999999999) amount!: number;
  @ApiProperty({ type: String }) @IsUUID() accountId!: string;
  @ApiProperty({ type: String }) @IsUUID() fundId!: string;
  @ApiProperty({ type: String }) @IsString() @Length(0, 300) evidenceReference!: string;
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID(undefined, { each: true })
  approverIds!: string[];
}
export class VersionDto {
  @ApiProperty({ type: Number }) @Type(() => Number) @IsInt() @Min(1) version!: number;
}
export class UpdateExpenseDto extends ExpenseDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(1) version!: number;
}
export class ReasonDto extends VersionDto {
  @ApiProperty({ type: String }) @IsString() @Length(1, 500) @Matches(/\S/) reason!: string;
}
export class DecisionDto extends ReasonDto {
  @ApiProperty({ type: String }) @IsIn(['APPROVED', 'REJECTED']) decision!: string;
}
export class PaymentDto extends VersionDto {
  @ApiProperty({ type: String }) @Matches(/^\d{4}-\d{2}-\d{2}$/) paidOn!: string;
  @ApiProperty({ type: String }) @IsUUID() accountId!: string;
  @ApiProperty({ type: String }) @IsIn(['BANK', 'CASH', 'CARD']) method!: string;
  @ApiProperty({ type: String }) @IsString() @Length(1, 100) @Matches(/\S/) reference!: string;
}
export class ReverseDto {
  @ApiProperty({ type: String }) @Matches(/^\d{4}-\d{2}-\d{2}$/) postedOn!: string;
  @ApiProperty({ type: String }) @IsString() @Length(1, 500) @Matches(/\S/) reason!: string;
}
