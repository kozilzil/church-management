import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsString, Length, ValidateNested, ValidateIf, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
export class MappingDto {
  @ApiProperty({ type: String }) @IsString() @Length(1, 100) memberNumber!: string;
  @ApiProperty({ type: String }) @IsString() @Length(1, 100) name!: string;
  @ApiProperty({ type: String }) @IsString() @Length(1, 100) registeredOn!: string;
  @ApiProperty({ type: String }) @IsString() @Length(1, 100) status!: string;
  @ApiProperty({ type: String, required: false })
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @Length(1, 100)
  phone?: string;
  @ApiProperty({ type: String, required: false })
  @ValidateIf((_o, v) => v !== undefined)
  @IsString()
  @Length(1, 100)
  address?: string;
}
export class ImportDto {
  @ApiProperty({ type: String }) @IsString() @Length(1, 500000) csv!: string;
  @ApiProperty({ type: MappingDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => MappingDto)
  mapping!: MappingDto;
}
export class ExportDto {
  @ApiProperty({ type: String }) @IsString() @Length(0, 100) q!: string;
  @ApiProperty({ type: String, required: false })
  @ValidateIf((_o, v) => v !== undefined)
  @IsUUID()
  organizationId?: string;
}
