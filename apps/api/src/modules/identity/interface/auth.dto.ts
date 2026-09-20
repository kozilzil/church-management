import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length, Matches, IsOptional } from 'class-validator';
export class LoginDto {
  @ApiProperty({ type: String, required: true })
  @IsUUID()
  churchId!: string;
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Length(1, 80)
  username!: string;
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Length(1, 128)
  password!: string;
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @Matches(/^\d{6}$/)
  code?: string;
}
export class PasswordDto {
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Length(1, 128)
  currentPassword!: string;
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Length(12, 128)
  password!: string;
}
export class TotpDto {
  @ApiProperty({ type: String, required: true })
  @Matches(/^\d{6}$/)
  code!: string;
}
export class UserDto {
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Matches(/^[a-z0-9._@+-]{1,80}$/)
  username!: string;
  @ApiProperty({ type: String, required: true })
  @IsString()
  @Length(12, 128)
  password!: string;
}
