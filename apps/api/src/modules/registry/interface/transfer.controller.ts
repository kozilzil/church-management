import { Controller, Post, Req, Param, ParseUUIDPipe, Inject } from '@nestjs/common';
import { Permission, type AuthRequest } from '../../identity/interface/access.guard';
import { ValidatedBody } from '../../../platform/http/validated';
import { TransferService } from '../application/transfer.service';
import { ImportDto, ExportDto } from './transfer.dto';
@Controller('churches/:churchId/transfers')
export class TransferController {
  constructor(@Inject(TransferService) private readonly service: TransferService) {}
  @Post('imports/preview') @Permission('membership.import') preview(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @ValidatedBody(ImportDto) d: ImportDto,
  ) {
    return this.service.preview(r.actor, c, d);
  }
  @Post('imports/:id/apply') @Permission('membership.import') apply(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.apply(r.actor, c, id);
  }
  @Post('exports') @Permission('membership.export') request(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @ValidatedBody(ExportDto) d: ExportDto,
  ) {
    return this.service.requestExport(r.actor, c, d);
  }
  @Post('exports/:id/download') @Permission('membership.export') download(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.download(r.actor, c, id);
  }
}
