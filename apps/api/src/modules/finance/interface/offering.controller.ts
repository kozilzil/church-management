import {
  Controller,
  Get,
  Post,
  Patch,
  Inject,
  Req,
  Param,
  ParseUUIDPipe,
  Header,
} from '@nestjs/common';
import { Permission, type AuthRequest } from '../../identity/interface/access.guard';
import { ValidatedBody as Body, ValidatedQuery as Query } from '../../../platform/http/validated';
import { OfferingService } from '../application/offering.service';
import { ReceiptService } from '../application/receipt.service';
import { LedgerService } from '../application/ledger.service';
import { VersionDto, ReasonDto, ReverseDto } from './finance.dto';
import {
  OfferingTypeDto,
  DonorDto,
  DonorUpdateDto,
  OfferingDto,
  OfferingUpdateDto,
  OfferingQuery,
  ReceiptIssuerDto,
  ReceiptPreviewDto,
  ReceiptIssueDto,
  ReceiptCancelDto,
} from './offering.dto';
@Controller('churches/:churchId/finance')
export class OfferingController {
  constructor(
    @Inject(OfferingService) private readonly offerings: OfferingService,
    @Inject(ReceiptService) private readonly receipts: ReceiptService,
    @Inject(LedgerService) private readonly ledger: LedgerService,
  ) {}
  @Get('offering-definitions')
  @Permission('offering.read')
  @Header('Cache-Control', 'private, no-store')
  definitions(@Req() r: AuthRequest, @Param('churchId', ParseUUIDPipe) c: string) {
    return this.ledger.offeringDefinitions(r.actor, c);
  }
  @Get('offering-types')
  @Permission('offering.read')
  @Header('Cache-Control', 'private, no-store')
  types(@Req() r: AuthRequest, @Param('churchId', ParseUUIDPipe) c: string) {
    return this.offerings.types(r.actor, c);
  }
  @Get('offering-type-settings')
  @Permission('finance.manage')
  @Header('Cache-Control', 'private, no-store')
  typeSettings(@Req() r: AuthRequest, @Param('churchId', ParseUUIDPipe) c: string) {
    return this.offerings.types(r.actor, c, 'finance.manage');
  }
  @Post('offering-types')
  @Permission('finance.manage')
  @Header('Cache-Control', 'private, no-store')
  typeCreate(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(OfferingTypeDto) d: OfferingTypeDto,
  ) {
    return this.offerings.createType(r.actor, c, d);
  }
  @Get('offering-members')
  @Permission('offering.write')
  @Header('Cache-Control', 'private, no-store')
  members(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Query(OfferingQuery) d: OfferingQuery,
  ) {
    return this.offerings.directory.search(r.actor, c, d.search ?? '');
  }
  @Get('donors')
  @Permission('offering.read')
  @Header('Cache-Control', 'private, no-store')
  donors(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Query(OfferingQuery) d: OfferingQuery,
  ) {
    return this.offerings.donors(r.actor, c, d);
  }
  @Post('donors')
  @Permission('offering.write')
  @Header('Cache-Control', 'private, no-store')
  donorCreate(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(DonorDto) d: DonorDto,
  ) {
    return this.offerings.createDonor(r.actor, c, d);
  }
  @Patch('donors/:id')
  @Permission('offering.write')
  @Header('Cache-Control', 'private, no-store')
  donorUpdate(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(DonorUpdateDto) d: DonorUpdateDto,
  ) {
    return this.offerings.updateDonor(r.actor, c, id, d);
  }
  @Get('offerings')
  @Permission('offering.read')
  @Header('Cache-Control', 'private, no-store')
  offeringsList(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Query(OfferingQuery) d: OfferingQuery,
  ) {
    return this.offerings.list(r.actor, c, d);
  }
  @Post('offerings')
  @Permission('offering.write')
  @Header('Cache-Control', 'private, no-store')
  offeringCreate(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(OfferingDto) d: OfferingDto,
  ) {
    return this.offerings.create(r.actor, c, d);
  }
  @Get('offerings/:id')
  @Permission('offering.read')
  @Header('Cache-Control', 'private, no-store')
  offeringDetail(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.offerings.detail(r.actor, c, id);
  }
  @Patch('offerings/:id')
  @Permission('offering.write')
  @Header('Cache-Control', 'private, no-store')
  offeringUpdate(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(OfferingUpdateDto) d: OfferingUpdateDto,
  ) {
    return this.offerings.update(r.actor, c, id, d);
  }
  @Post('offerings/:id/review')
  @Permission('offering.review')
  @Header('Cache-Control', 'private, no-store')
  offeringReview(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(VersionDto) d: VersionDto,
  ) {
    return this.offerings.review(r.actor, c, id, d.version);
  }
  @Post('offerings/:id/post')
  @Permission('offering.post')
  @Header('Cache-Control', 'private, no-store')
  offeringPost(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(VersionDto) d: VersionDto,
  ) {
    return this.offerings.post(r.actor, c, id, d.version);
  }
  @Post('offerings/:id/cancel')
  @Permission('offering.write')
  @Header('Cache-Control', 'private, no-store')
  offeringCancel(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ReasonDto) d: ReasonDto,
  ) {
    return this.offerings.cancel(r.actor, c, id, d);
  }
  @Post('offerings/:id/reverse')
  @Permission('offering.reverse')
  @Header('Cache-Control', 'private, no-store')
  offeringReverse(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ReverseDto) d: ReverseDto,
  ) {
    return this.offerings.reverse(r.actor, c, id, d);
  }
  @Get('receipt-issuer')
  @Permission('finance.manage')
  @Header('Cache-Control', 'private, no-store')
  issuer(@Req() r: AuthRequest, @Param('churchId', ParseUUIDPipe) c: string) {
    return this.receipts.issuer(r.actor, c);
  }
  @Post('receipt-issuer')
  @Permission('finance.manage')
  @Header('Cache-Control', 'private, no-store')
  issuerSave(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(ReceiptIssuerDto) d: ReceiptIssuerDto,
  ) {
    return this.receipts.saveIssuer(r.actor, c, d);
  }
  @Get('receipts/donors')
  @Permission('receipt.read')
  @Header('Cache-Control', 'private, no-store')
  receiptDonors(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Query(OfferingQuery) d: OfferingQuery,
  ) {
    return this.offerings.donors(r.actor, c, d, 'receipt.read');
  }
  @Get('receipts/preview')
  @Permission('receipt.read')
  @Header('Cache-Control', 'private, no-store')
  receiptPreview(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Query(ReceiptPreviewDto) d: ReceiptPreviewDto,
  ) {
    return this.receipts.preview(r.actor, c, d);
  }
  @Get('receipts')
  @Permission('receipt.read')
  @Header('Cache-Control', 'private, no-store')
  receiptList(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Query(OfferingQuery) d: OfferingQuery,
  ) {
    return this.receipts.list(r.actor, c, d);
  }
  @Post('receipts')
  @Permission('receipt.issue')
  @Header('Cache-Control', 'private, no-store')
  receiptIssue(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(ReceiptIssueDto) d: ReceiptIssueDto,
  ) {
    return this.receipts.issue(r.actor, c, d);
  }
  @Get('receipts/:id')
  @Permission('receipt.read')
  @Header('Cache-Control', 'private, no-store')
  receiptDetail(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.receipts.detail(r.actor, c, id);
  }
  @Post('receipts/:id/print')
  @Permission('receipt.print')
  @Header('Cache-Control', 'private, no-store')
  receiptPrint(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.receipts.print(r.actor, c, id);
  }
  @Post('receipts/:id/cancel')
  @Permission('receipt.cancel')
  @Header('Cache-Control', 'private, no-store')
  receiptCancel(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ReceiptCancelDto) d: ReceiptCancelDto,
  ) {
    return this.receipts.cancel(r.actor, c, id, d.reason);
  }
}
