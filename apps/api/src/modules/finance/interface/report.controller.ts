import { Controller, Get, Post, Inject, Req, Param, ParseUUIDPipe, Header } from '@nestjs/common';
import { Permission, type AuthRequest } from '../../identity/interface/access.guard';
import { ValidatedBody as Body, ValidatedQuery as Query } from '../../../platform/http/validated';
import { ReportService } from '../application/report.service';
import { ReportQuery, ReportLinesQuery, ReportSnapshotDto } from './report.dto';
@Controller('churches/:churchId/finance/reports')
export class ReportController {
  constructor(@Inject(ReportService) private readonly service: ReportService) {}
  @Get('definitions')
  @Permission('finance.report')
  @Header('Cache-Control', 'private, no-store')
  definitions(@Req() r: AuthRequest, @Param('churchId', ParseUUIDPipe) c: string) {
    return this.service.definitions(r.actor, c);
  }
  @Get()
  @Permission('finance.report')
  @Header('Cache-Control', 'private, no-store')
  report(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Query(ReportQuery) q: ReportQuery,
  ) {
    return this.service.report(r.actor, c, q);
  }
  @Get('lines')
  @Permission('finance.report')
  @Header('Cache-Control', 'private, no-store')
  lines(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Query(ReportLinesQuery) q: ReportLinesQuery,
  ) {
    return this.service.lines(r.actor, c, q);
  }
  @Post('export')
  @Permission('finance.export')
  @Header('Cache-Control', 'private, no-store')
  export(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(ReportSnapshotDto) d: ReportSnapshotDto,
  ) {
    return this.service.export(r.actor, c, d);
  }
}
