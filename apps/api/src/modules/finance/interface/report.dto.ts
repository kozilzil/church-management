import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';
export class ReportQuery {
  @ApiProperty({ type: String }) @Matches(/^\d{4}-\d{2}-\d{2}$/) from!: string;
  @ApiProperty({ type: String }) @Matches(/^\d{4}-\d{2}-\d{2}$/) to!: string;
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsUUID() fundId?: string;
}
export class ReportSnapshotDto extends ReportQuery {
  @ApiProperty({ type: String }) @Matches(/^(0|[1-9][0-9]{0,18})$/) ledgerVersion!: string;
}
export class ReportLinesQuery extends ReportSnapshotDto {
  @ApiProperty({ type: String }) @IsUUID() accountId!: string;
  @ApiProperty({ type: String, required: false }) @IsOptional() @IsUUID() cursor?: string;
}
