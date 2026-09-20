import { Controller, Get, Post, Patch, Inject, Req, Param, ParseUUIDPipe } from '@nestjs/common';
import { Permission, type AuthRequest } from '../../identity/interface/access.guard';
import { ValidatedBody, ValidatedQuery } from '../../../platform/http/validated';
import { NewcomerService } from '../application/newcomer.service';
import { PageDto, StageDto, JourneyDto, JourneyChangeDto, JourneyListDto } from './operations.dto';
@Controller('churches/:churchId/operations')
export class NewcomerController {
  constructor(@Inject(NewcomerService) private readonly service: NewcomerService) {}
  @Get('assignees') @Permission('membership.read') assignees(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
  ) {
    return this.service.assignees(r.actor, c);
  }
  @Get('newcomer-stages') @Permission('newcomer.read') stages(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @ValidatedQuery(PageDto) q: PageDto,
  ) {
    return this.service.stages(r.actor, c, q);
  }
  @Post('newcomer-stages') @Permission('newcomer.write') stage(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @ValidatedBody(StageDto) d: StageDto,
  ) {
    return this.service.stage(r.actor, c, d);
  }
  @Patch('newcomer-stages/:id') @Permission('newcomer.write') configure(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidatedBody(StageDto) d: StageDto,
  ) {
    return this.service.stage(r.actor, c, d, id);
  }
  @Get('newcomers') @Permission('newcomer.read') list(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @ValidatedQuery(JourneyListDto) q: JourneyListDto,
  ) {
    return this.service.journeys(r.actor, c, q);
  }
  @Post('newcomers') @Permission('newcomer.write') create(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @ValidatedBody(JourneyDto) d: JourneyDto,
  ) {
    return this.service.create(r.actor, c, d);
  }
  @Patch('newcomers/:id') @Permission('newcomer.write') change(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidatedBody(JourneyChangeDto) d: JourneyChangeDto,
  ) {
    return this.service.change(r.actor, c, id, d);
  }
  @Get('newcomers/:id/history') @Permission('newcomer.read') history(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidatedQuery(PageDto) q: PageDto,
  ) {
    return this.service.history(r.actor, c, id, q);
  }
}
