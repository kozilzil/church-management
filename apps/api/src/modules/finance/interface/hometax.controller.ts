import { Controller, Get, Post, Inject, Req, Param, ParseUUIDPipe, Header } from '@nestjs/common';
import { Permission, type AuthRequest } from '../../identity/interface/access.guard';
import { ValidatedBody as Body, ValidatedQuery as Query } from '../../../platform/http/validated';
import { HometaxService } from '../application/hometax.service';
import { OfferingQuery } from './offering.dto';
import { HometaxPrepareDto, HometaxDownloadDto, HometaxResultDto } from './hometax.dto';
@Controller('churches/:churchId/finance/hometax-submissions')
export class HometaxController {
  constructor(@Inject(HometaxService) private readonly service: HometaxService) {}
  @Get()
  @Permission('receipt.read')
  @Header('Cache-Control', 'private, no-store')
  list(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Query(OfferingQuery) q: OfferingQuery,
  ) {
    return this.service.list(r.actor, c, q);
  }
  @Post()
  @Permission('receipt.export')
  @Header('Cache-Control', 'private, no-store')
  prepare(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(HometaxPrepareDto) d: HometaxPrepareDto,
  ) {
    return this.service.prepare(r.actor, c, d);
  }
  @Get(':id')
  @Permission('receipt.read')
  @Header('Cache-Control', 'private, no-store')
  detail(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(r.actor, c, id);
  }
  @Post(':id/download')
  @Permission('receipt.export')
  @Header('Cache-Control', 'private, no-store')
  download(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(HometaxDownloadDto) _d: HometaxDownloadDto,
  ) {
    void _d;
    return this.service.download(r.actor, c, id);
  }
  @Post(':id/items/:itemId/results')
  @Permission('receipt.reconcile')
  @Header('Cache-Control', 'private, no-store')
  reconcile(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body(HometaxResultDto) d: HometaxResultDto,
  ) {
    return this.service.reconcile(r.actor, c, id, itemId, d);
  }
}
