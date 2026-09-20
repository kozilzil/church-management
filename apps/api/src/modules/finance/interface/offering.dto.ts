import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  Length,
  Matches,
  IsUUID,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsIn,
  ValidateIf,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ArrayUnique,
  Equals,
} from 'class-validator';
import { VersionDto } from './finance.dto';
const Optional = () => ValidateIf((_o, v) => v !== undefined);
export class OfferingTypeDto {
  @ApiProperty({ type: String }) @IsString() @Length(1, 80) @Matches(/\S/) name!: string;
  @ApiProperty({ type: String }) @IsUUID() revenueAccountId!: string;
  @ApiProperty({ type: String }) @IsUUID() fundId!: string;
  @ApiProperty({ type: Boolean }) @IsBoolean() receiptEligible!: boolean;
}
export class DonorDto {
  @ApiProperty({ type: String, required: false }) @Optional() @IsUUID() memberId?: string;
  @ApiProperty({ type: String }) @IsString() @Length(1, 100) @Matches(/\S/) name!: string;
  @ApiProperty({ type: String }) @IsString() @Length(0, 300) address!: string;
}
export class DonorUpdateDto extends VersionDto {
  @ApiProperty({ type: String }) @IsString() @Length(1, 100) @Matches(/\S/) name!: string;
  @ApiProperty({ type: String }) @IsString() @Length(0, 300) address!: string;
}
export class OfferingDto {
  @ApiProperty({ type: String, required: false }) @Optional() @IsUUID() donorId?: string;
  @ApiProperty({ type: String }) @IsUUID() typeId!: string;
  @ApiProperty({ type: String }) @IsUUID() assetAccountId!: string;
  @ApiProperty({ type: String }) @Matches(/^\d{4}-\d{2}-\d{2}$/) givenOn!: string;
  @ApiProperty({ type: Number }) @IsInt() @Min(1) @Max(999999999999) amount!: number;
  @ApiProperty({ type: String }) @IsString() @Length(1, 100) @Matches(/\S/) reference!: string;
  @ApiProperty({ type: String }) @IsIn(['CASH', 'BANK']) source!: string;
}
export class OfferingUpdateDto extends OfferingDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(1) version!: number;
}
export class OfferingQuery {
  @ApiProperty({ type: String, required: false }) @Optional() @IsUUID() cursor?: string;
  @ApiProperty({ type: Number, required: false })
  @Optional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
  @ApiProperty({ type: String, required: false }) @Optional() @IsUUID() donorId?: string;
  @ApiProperty({ type: String, required: false })
  @Optional()
  @IsIn(['DRAFT', 'REVIEWED', 'POSTED', 'CANCELLED'])
  state?: string;
  @ApiProperty({ type: Number, required: false })
  @Optional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(9999)
  taxYear?: number;
  @ApiProperty({ type: String, required: false })
  @Optional()
  @IsString()
  @Length(0, 100)
  search?: string;
}
export class ReceiptIssuerDto {
  @ApiProperty({ type: String }) @IsString() @Length(1, 100) @Matches(/\S/) name!: string;
  @ApiProperty({ type: String }) @Matches(/^\d{3}-\d{2}-\d{5}$/) registrationNumber!: string;
  @ApiProperty({ type: String }) @IsString() @Length(1, 300) @Matches(/\S/) address!: string;
  @ApiProperty({ type: String }) @IsString() @Length(1, 100) @Matches(/\S/) representative!: string;
  @ApiProperty({ type: String }) @IsString() @Length(1, 300) @Matches(/\S/) legalBasis!: string;
  @ApiProperty({ type: String })
  @IsString()
  @Length(1, 300)
  @Matches(/\S/)
  qualificationReference!: string;
  @ApiProperty({ type: Boolean }) @IsBoolean() electronicRequired!: boolean;
  @ApiProperty({ type: Boolean }) @Equals(true) eligibilityConfirmed!: boolean;
  @ApiProperty({ type: Number }) @IsInt() @Min(0) version!: number;
}
export class ReceiptPreviewDto {
  @ApiProperty({ type: String }) @IsUUID() donorId!: string;
  @ApiProperty({ type: Number })
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(9999)
  taxYear!: number;
}
export class ReceiptIssueDto extends ReceiptPreviewDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  offeringIds!: string[];
  @ApiProperty({ type: Number }) @IsInt() @Min(1) donorVersion!: number;
  @ApiProperty({ type: Number }) @IsInt() @Min(1) issuerVersion!: number;
  @ApiProperty({ type: Boolean }) @Equals(true) identityConfirmed!: boolean;
}
export class ReceiptCancelDto {
  @ApiProperty({ type: String }) @IsString() @Length(1, 500) @Matches(/\S/) reason!: string;
}
