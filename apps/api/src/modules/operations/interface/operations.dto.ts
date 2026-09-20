import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  Length,
  IsUUID,
  ValidateIf,
  IsInt,
  Min,
  Max,
  IsIn,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  IsDefined,
  Matches,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
const Optional = () => ValidateIf((_o, v) => v !== undefined);
export class PageDto {
  @ApiProperty({ type: String, required: false }) @Optional() @IsUUID() cursor?: string;
  @ApiProperty({ type: Number, required: false })
  @Optional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
export class GatheringDto {
  @ApiProperty({ type: String }) @IsString() @Length(1, 100) @Matches(/\S/) name!: string;
  @ApiProperty({ type: String }) @IsString() @Length(1, 200) schedule!: string;
  @ApiProperty({ type: String, required: false }) @Optional() @IsUUID() organizationId?: string;
}
export class SessionDto {
  @ApiProperty({ type: String })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/)
  startsAt!: string;
}
export class AttendanceEntry {
  @ApiProperty({ type: String }) @IsUUID() memberId!: string;
  @ApiProperty({ type: String })
  @IsIn(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'UNKNOWN'])
  status!: string;
  @ApiProperty({ type: Number }) @IsInt() @Min(0) version!: number;
}
export class AttendanceDto {
  @ApiProperty({ type: String }) @IsIn(['MANUAL', 'BULK']) source!: string;
  @ApiProperty({ type: [AttendanceEntry] })
  @IsDefined()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntry)
  records!: AttendanceEntry[];
}
export class RangeDto {
  @ApiProperty({ type: String }) @Matches(/^\d{4}-\d{2}-\d{2}$/) from!: string;
  @ApiProperty({ type: String }) @Matches(/^\d{4}-\d{2}-\d{2}$/) to!: string;
  @ApiProperty({ type: String, required: false }) @Optional() @IsUUID() gatheringId?: string;
}
export class StageDto {
  @ApiProperty({ type: String }) @IsString() @Length(1, 80) @Matches(/\S/) name!: string;
  @ApiProperty({ type: Number }) @IsInt() @Min(0) @Max(10000) sortOrder!: number;
  @ApiProperty({ type: Boolean }) @IsBoolean() terminal!: boolean;
  @ApiProperty({ type: Boolean }) @IsBoolean() active!: boolean;
}
export class JourneyDto {
  @ApiProperty({ type: String }) @IsUUID() memberId!: string;
  @ApiProperty({ type: String }) @IsUUID() stageId!: string;
  @ApiProperty({ type: String }) @IsUUID() assigneeId!: string;
  @ApiProperty({ type: String, nullable: true })
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueOn!: string | null;
}
export class JourneyChangeDto {
  @ApiProperty({ type: String }) @IsUUID() stageId!: string;
  @ApiProperty({ type: String }) @IsUUID() assigneeId!: string;
  @ApiProperty({ type: String, nullable: true })
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueOn!: string | null;
  @ApiProperty({ type: Number }) @IsInt() @Min(1) version!: number;
}
export class JourneyListDto extends PageDto {
  @ApiProperty({ type: String, required: false })
  @Optional()
  @IsIn(['open', 'completed', 'overdue', 'all'])
  state?: string;
  @ApiProperty({ type: String, required: false }) @Optional() @IsUUID() assigneeId?: string;
}
export class CareDto {
  @ApiProperty({ type: String, required: false }) @Optional() @IsUUID() memberId?: string;
  @ApiProperty({ type: String, required: false }) @Optional() @IsUUID() householdId?: string;
  @ApiProperty({ type: String }) @IsUUID() assigneeId!: string;
  @ApiProperty({ type: String }) @IsIn(['VISIT', 'CALL', 'MESSAGE', 'MEETING']) kind!: string;
  @ApiProperty({ type: String })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/)
  occurredAt!: string;
  @ApiProperty({ type: String, nullable: true })
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  followUpOn!: string | null;
}
export class CareChangeDto {
  @ApiProperty({ type: String }) @IsUUID() assigneeId!: string;
  @ApiProperty({ type: String, nullable: true })
  @ValidateIf((_o, v) => v !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  followUpOn!: string | null;
  @ApiProperty({ type: Boolean }) @IsBoolean() completed!: boolean;
  @ApiProperty({ type: Number }) @IsInt() @Min(1) version!: number;
}
export class CarePolicyDto {
  @ApiProperty({ type: Boolean }) @IsBoolean() enabled!: boolean;
  @ApiProperty({ type: Number }) @IsInt() @Min(1) @Max(3650) retentionDays!: number;
  @ApiProperty({ type: String }) @IsString() @Length(5, 500) @Matches(/\S/) reference!: string;
}
export class CareNoteDto {
  @ApiProperty({ type: String }) @IsString() @Length(1, 5000) @Matches(/\S/) text!: string;
  @ApiProperty({ type: String }) @IsIn(['ASSIGNEE', 'ROLE']) visibility!: string;
  @ApiProperty({ type: String, required: false }) @Optional() @IsUUID() roleId?: string;
}
