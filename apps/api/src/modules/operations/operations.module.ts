import { CareService } from './application/care.service';
import { CareController } from './interface/care.controller';
import { NewcomerService } from './application/newcomer.service';
import { NewcomerController } from './interface/newcomer.controller';
import { Module } from '@nestjs/common';
import { OperationsPolicy } from './application/operations-policy.service';
import { AttendanceService } from './application/attendance.service';
import { AttendanceController } from './interface/attendance.controller';
@Module({
  providers: [OperationsPolicy, AttendanceService, NewcomerService, CareService],
  controllers: [AttendanceController, NewcomerController, CareController],
})
export class OperationsModule {}
