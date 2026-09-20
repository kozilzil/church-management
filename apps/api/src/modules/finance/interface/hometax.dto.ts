import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsIn, IsString, IsUUID, Length, Matches } from 'class-validator';
import { ReceiptIssueDto } from './offering.dto';

export class HometaxPrepareDto extends ReceiptIssueDto {
  @ApiProperty({ type: String }) @IsUUID() requestId!: string;
  @ApiProperty({ type: String }) @IsString() @Length(1, 30) @Matches(/\S/) contactName!: string;
  @ApiProperty({ type: String }) @Matches(/^[0-9-]{9,14}$/) contactPhone!: string;
  @ApiProperty({ type: Boolean }) @Equals(true) hometaxAuthorityConfirmed!: boolean;
}
export class HometaxDownloadDto {
  @ApiProperty({ type: Boolean }) @Equals(true) notSubmittedConfirmed!: boolean;
}
export class HometaxResultDto {
  @ApiProperty({ type: String }) @IsIn(['ISSUED', 'NOT_ISSUED', 'CANCELLED']) state!: string;
  @ApiProperty({ type: String }) @IsString() @Length(1, 100) @Matches(/\S/) reference!: string;
  @ApiProperty({ type: String }) @IsString() @Length(1, 300) @Matches(/\S/) reason!: string;
  @ApiProperty({ type: Boolean }) @Equals(true) checkedInHometax!: boolean;
}
