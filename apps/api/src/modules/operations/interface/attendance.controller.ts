import { Controller, Get, Post, Inject, Req, Param, ParseUUIDPipe } from '@nestjs/common';
import { Permission, type AuthRequest } from '../../identity/interface/access.guard';
import { ValidatedBody, ValidatedQuery } from '../../../platform/http/validated';
import { AttendanceService } from '../application/attendance.service';
import { PageDto, GatheringDto, SessionDto, AttendanceDto, RangeDto } from './operations.dto';
@Controller('churches/:churchId/operations')
export class AttendanceController {
  constructor(@Inject(AttendanceService) private readonly service: AttendanceService) {}
  @Get('gatherings') @Permission('attendance.read') gatherings(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @ValidatedQuery(PageDto) d: PageDto,
  ) {
    return this.service.gatherings(r.actor, c, d);
  }
  @Post('gatherings') @Permission('attendance.write') createGathering(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @ValidatedBody(GatheringDto) d: GatheringDto,
  ) {
    return this.service.createGathering(r.actor, c, d);
  }
  @Get('gatherings/:id/sessions') @Permission('attendance.read') sessions(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidatedQuery(PageDto) d: PageDto,
  ) {
    return this.service.sessions(r.actor, c, id, d);
  }
  @Post('gatherings/:id/sessions') @Permission('attendance.write') createSession(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidatedBody(SessionDto) d: SessionDto,
  ) {
    return this.service.createSession(r.actor, c, id, d);
  }
  @Get('sessions/:id/attendance') @Permission('attendance.read') records(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidatedQuery(PageDto) d: PageDto,
  ) {
    return this.service.records(r.actor, c, id, d);
  }
  @Post('sessions/:id/attendance') @Permission('attendance.write') record(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidatedBody(AttendanceDto) d: AttendanceDto,
  ) {
    return this.service.record(r.actor, c, id, d);
  }
  @Get('attendance/:id/history') @Permission('attendance.read') history(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidatedQuery(PageDto) d: PageDto,
  ) {
    return this.service.history(r.actor, c, id, d);
  }
  @Get('attendance-summary') @Permission('attendance.read') summary(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @ValidatedQuery(RangeDto) d: RangeDto,
  ) {
    return this.service.summary(r.actor, c, d);
  }
}
