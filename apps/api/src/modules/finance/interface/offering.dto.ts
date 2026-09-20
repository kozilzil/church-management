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
  @ApiProperty() @IsString() @Length(1, 80) @Matches(/\S/) name!: string;
  @ApiProperty() @IsUUID() revenueAccountId!: string;
  @ApiProperty() @IsUUID() fundId!: string;
  @ApiProperty() @IsBoolean() receiptEligible!: boolean;
}
export class DonorDto {
  @ApiProperty({ required: false }) @Optional() @IsUUID() memberId?: string;
  @ApiProperty() @IsString() @Length(1, 100) @Matches(/\S/) name!: string;
  @ApiProperty() @IsString() @Length(0, 300) address!: string;
}
export class DonorUpdateDto extends VersionDto {
  @ApiProperty() @IsString() @Length(1, 100) @Matches(/\S/) name!: string;
  @ApiProperty() @IsString() @Length(0, 300) address!: string;
}
export class OfferingDto {
  @ApiProperty({ required: false }) @Optional() @IsUUID() donorId?: string;
  @ApiProperty() @IsUUID() typeId!: string;
  @ApiProperty() @IsUUID() assetAccountId!: string;
  @ApiProperty() @Matches(/^\d{4}-\d{2}-\d{2}$/) givenOn!: string;
  @ApiProperty() @IsInt() @Min(1) @Max(999999999999) amount!: number;
  @ApiProperty() @IsString() @Length(1, 100) @Matches(/\S/) reference!: string;
  @ApiProperty() @IsIn(['CASH', 'BANK']) source!: string;
}
export class OfferingUpdateDto extends OfferingDto {
  @ApiProperty() @IsInt() @Min(1) version!: number;
}
export class OfferingQuery {
  @ApiProperty({ required: false }) @Optional() @IsUUID() cursor?: string;
  @ApiProperty({ required: false })
  @Optional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
  @ApiProperty({ required: false }) @Optional() @IsUUID() donorId?: string;
  @ApiProperty({ required: false })
  @Optional()
  @IsIn(['DRAFT', 'REVIEWED', 'POSTED', 'CANCELLED'])
  state?: string;
  @ApiProperty({ required: false })
  @Optional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(9999)
  taxYear?: number;
  @ApiProperty({ required: false }) @Optional() @IsString() @Length(0, 100) search?: string;
}
export class ReceiptIssuerDto {
  @ApiProperty() @IsString() @Length(1, 100) @Matches(/\S/) name!: string;
  @ApiProperty() @Matches(/^\d{3}-\d{2}-\d{5}$/) registrationNumber!: string;
  @ApiProperty() @IsString() @Length(1, 300) @Matches(/\S/) address!: string;
  @ApiProperty() @IsString() @Length(1, 100) @Matches(/\S/) representative!: string;
  @ApiProperty() @IsString() @Length(1, 300) @Matches(/\S/) legalBasis!: string;
  @ApiProperty() @IsString() @Length(1, 300) @Matches(/\S/) qualificationReference!: string;
  @ApiProperty() @IsBoolean() electronicRequired!: boolean;
  @ApiProperty() @Equals(true) eligibilityConfirmed!: boolean;
  @ApiProperty() @IsInt() @Min(0) version!: number;
}
export class ReceiptPreviewDto {
  @ApiProperty() @IsUUID() donorId!: string;
  @ApiProperty() @Type(() => Number) @IsInt() @Min(1900) @Max(9999) taxYear!: number;
}
export class ReceiptIssueDto extends ReceiptPreviewDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  offeringIds!: string[];
  @ApiProperty() @IsInt() @Min(1) donorVersion!: number;
  @ApiProperty() @IsInt() @Min(1) issuerVersion!: number;
  @ApiProperty() @Equals(true) identityConfirmed!: boolean;
}
export class ReceiptCancelDto {
  @ApiProperty() @IsString() @Length(1, 500) @Matches(/\S/) reason!: string;
}
