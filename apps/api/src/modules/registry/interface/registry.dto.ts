import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  Length,
  Matches,
  IsUUID,
  ValidateIf,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
const Optional = () => ValidateIf((_o, value) => value !== undefined);
export class MemberDto {
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Matches(/^[a-zA-Z0-9-]{1,40}$/)
  memberNumber!: string;
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Length(1, 100)
  name!: string;
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  registeredOn!: string;
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Matches(/^[A-Z_]{1,30}$/)
  status!: string;
  @ApiProperty({ type: String, required: false })
  @Optional()
  @IsString()
  @Length(0, 30)
  phone?: string;
  @ApiProperty({ type: String, required: false })
  @Optional()
  @IsString()
  @Length(0, 300)
  address?: string;
}
export class ProfileDto {
  @ApiProperty({ type: Number, required: true })
  @IsInt()
  @Min(1)
  version!: number;
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Length(1, 100)
  name!: string;
  @ApiProperty({ type: String, required: false })
  @Optional()
  @IsString()
  @Length(0, 30)
  phone?: string;
  @ApiProperty({ type: String, required: false })
  @Optional()
  @IsString()
  @Length(0, 300)
  address?: string;
}
export class StatusChangeDto {
  @ApiProperty({ type: Number, required: true })
  @IsInt()
  @Min(1)
  version!: number;
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Matches(/^[A-Z_]{1,30}$/)
  status!: string;
  @ApiProperty({ type: String, required: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom!: string;
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Length(1, 300)
  reason!: string;
}
export class ListDto {
  @ApiProperty({ type: String, required: false })
  @Optional()
  @IsString()
  @Length(0, 100)
  q?: string;
  @ApiProperty({ type: String, required: false })
  @Optional()
  @IsUUID()
  cursor?: string;
  @ApiProperty({ type: Number, required: false })
  @Optional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
  @ApiProperty({ type: String, required: false })
  @Optional()
  @IsUUID()
  organizationId?: string;
}
export class HouseholdDto {
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Length(1, 100)
  name!: string;
  @ApiProperty({ type: String, required: false })
  @Optional()
  @IsString()
  @Length(0, 30)
  phone?: string;
  @ApiProperty({ type: String, required: false })
  @Optional()
  @IsString()
  @Length(0, 300)
  address?: string;
}
export class MoveDto {
  @ApiProperty({ type: String, required: true })
  @IsUUID()
  memberId!: string;
  @ApiProperty({ type: String, required: true })
  @IsUUID()
  householdId!: string;
  @ApiProperty({ type: String, required: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom!: string;
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Length(1, 30)
  relationship!: string;
}
export class RepresentativeDto {
  @ApiProperty({ type: String, required: true })
  @IsUUID()
  memberId!: string;
}
export class OrganizationDto {
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Length(1, 100)
  name!: string;
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Matches(/^[A-Z_]{1,30}$/)
  type!: string;
  @ApiProperty({ type: String, required: false })
  @Optional()
  @IsUUID()
  parentId?: string;
}
export class ParentDto {
  @ApiProperty({ type: String, required: true, nullable: true })
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  parentId!: string | null;
}
export class EndDto {
  @ApiProperty({ type: String, required: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveTo!: string;
}
export class AffiliationDto {
  @ApiProperty({ type: String, required: true })
  @IsUUID()
  memberId!: string;
  @ApiProperty({ type: String, required: true })
  @IsUUID()
  organizationId!: string;
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Length(1, 50)
  role!: string;
  @ApiProperty({ type: Boolean, required: true })
  @IsBoolean()
  primary!: boolean;
  @ApiProperty({ type: String, required: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom!: string;
}
export class PositionDto {
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Length(1, 100)
  name!: string;
  @ApiProperty({ type: Number, required: true })
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder!: number;
  @ApiProperty({ type: Boolean, required: true })
  @IsBoolean()
  allowConcurrent!: boolean;
  @ApiProperty({ type: Boolean, required: true })
  @IsBoolean()
  active!: boolean;
}
export class AppointmentDto {
  @ApiProperty({ type: String, required: true })
  @IsUUID()
  memberId!: string;
  @ApiProperty({ type: String, required: true })
  @IsUUID()
  positionId!: string;
  @ApiProperty({ type: String, required: false })
  @Optional()
  @IsUUID()
  organizationId?: string;
  @ApiProperty({ type: String, required: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom!: string;
}
export class CodeDto {
  @ApiProperty({ type: String, required: true })
  @Matches(/^[A-Z_]{1,30}$/)
  code!: string;
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Length(1, 100)
  name!: string;
}
export class StatusDefinitionDto extends CodeDto {
  @ApiProperty({ type: [String], required: true })
  @IsArray()
  @ArrayMaxSize(50)
  @Matches(/^[A-Z_]{1,30}$/, { each: true })
  allowedNext!: string[];
}
export class AtDateDto {
  @ApiProperty({ type: String, required: false })
  @Optional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  at?: string;
}

export class RelationDto {
  @ApiProperty({ type: String, required: true })
  @IsUUID()
  relatedMemberId!: string;
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Matches(/\S/)
  @Length(1, 30)
  relationship!: string;
  @ApiProperty({ type: String, required: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom!: string;
}
