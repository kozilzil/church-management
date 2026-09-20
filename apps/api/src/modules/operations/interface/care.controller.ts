import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Inject,
  Req,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Permission, type AuthRequest } from '../../identity/interface/access.guard';
import { ValidatedBody, ValidatedQuery } from '../../../platform/http/validated';
import { CareService } from '../application/care.service';
import {
  PageDto,
  JourneyListDto,
  CareDto,
  CareChangeDto,
  CarePolicyDto,
  CareNoteDto,
} from './operations.dto';
@Controller('churches/:churchId/operations')
export class CareController {
  constructor(@Inject(CareService) private readonly s: CareService) {}
  @Get('care') @Permission('care.read') list(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @ValidatedQuery(JourneyListDto) q: JourneyListDto,
  ) {
    return this.s.list(r.actor, c, q);
  }
  @Post('care') @Permission('care.write') create(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @ValidatedBody(CareDto) d: CareDto,
  ) {
    return this.s.create(r.actor, c, d);
  }
  @Patch('care/:id') @Permission('care.write') change(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidatedBody(CareChangeDto) d: CareChangeDto,
  ) {
    return this.s.change(r.actor, c, id, d);
  }
  @Get('care/:id/history') @Permission('care.read') history(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidatedQuery(PageDto) q: PageDto,
  ) {
    return this.s.history(r.actor, c, id, q);
  }
  @Get('care-policy') @Permission('care.read') policy(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
  ) {
    return this.s.policy(r.actor, c);
  }
  @Put('care-policy') @Permission('care.policy') setPolicy(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @ValidatedBody(CarePolicyDto) d: CarePolicyDto,
  ) {
    return this.s.setPolicy(r.actor, c, d);
  }
  @Get('care-roles') @Permission('care.notes') roles(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
  ) {
    return this.s.roles(r.actor, c);
  }
  @Get('care/:id/notes') @Permission('care.notes') notes(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidatedQuery(PageDto) q: PageDto,
  ) {
    return this.s.notes(r.actor, c, id, q);
  }
  @Post('care/:id/notes') @Permission('care.notes') note(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @ValidatedBody(CareNoteDto) d: CareNoteDto,
  ) {
    return this.s.note(r.actor, c, id, d);
  }
}
