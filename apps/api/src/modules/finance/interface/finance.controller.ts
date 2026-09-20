import { ApiConsumes, ApiBody } from '@nestjs/swagger';
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Inject,
  Req,
  Res,
  Param,
  ParseUUIDPipe,
  ParseIntPipe,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Permission, type AuthRequest } from '../../identity/interface/access.guard';
import { ValidatedBody as Body, ValidatedQuery as Query } from '../../../platform/http/validated';
import { LedgerService } from '../application/ledger.service';
import { ExpenseService, type EvidenceFile } from '../application/expense.service';
import {
  AccountDto,
  FundDto,
  PeriodDto,
  ExpenseDto,
  UpdateExpenseDto,
  VersionDto,
  ReasonDto,
  DecisionDto,
  PaymentDto,
  ReverseDto,
  FinancePageDto,
} from './finance.dto';
@Controller('churches/:churchId/finance')
export class FinanceController {
  constructor(
    @Inject(LedgerService) private readonly ledger: LedgerService,
    @Inject(ExpenseService) private readonly expenses: ExpenseService,
  ) {}
  @Get('definitions') @Permission('expense.read') definitions(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
  ) {
    return this.ledger.definitions(r.actor, c);
  }
  @Get('ledger-definitions') @Permission('finance.readall') ledgerDefinitions(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
  ) {
    return this.ledger.ledgerDefinitions(r.actor, c);
  }
  @Get('settings') @Permission('finance.manage') settings(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
  ) {
    return this.ledger.settings(r.actor, c);
  }
  @Post('accounts') @Permission('finance.manage') account(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(AccountDto) d: AccountDto,
  ) {
    return this.ledger.account(r.actor, c, d);
  }
  @Post('funds') @Permission('finance.manage') fund(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(FundDto) d: FundDto,
  ) {
    return this.ledger.fund(r.actor, c, d);
  }
  @Post('periods') @Permission('finance.manage') period(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(PeriodDto) d: PeriodDto,
  ) {
    return this.ledger.period(r.actor, c, d);
  }
  @Post('periods/:id/close') @Permission('finance.close') close(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ledger.close(r.actor, c, id);
  }
  @Get('journals') @Permission('finance.readall') journals(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Query(FinancePageDto) q: FinancePageDto,
  ) {
    return this.ledger.list(r.actor, c, q);
  }
  @Post('journals/:id/reverse') @Permission('finance.reverse') reverse(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ReverseDto) d: ReverseDto,
  ) {
    return this.ledger.reverse(r.actor, c, id, d);
  }
  @Get('approvers') @Permission('expense.read') approvers(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Query(FinancePageDto) q: FinancePageDto,
  ) {
    return this.expenses.candidates(r.actor, c, q);
  }
  @Get('expenses') @Permission('expense.read') list(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Query(FinancePageDto) q: FinancePageDto,
  ) {
    return this.expenses.list(r.actor, c, q);
  }
  @Post('expenses') @Permission('expense.write') create(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(ExpenseDto) d: ExpenseDto,
  ) {
    return this.expenses.create(r.actor, c, d);
  }
  @Get('expenses/:id') @Permission('expense.read') detail(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.expenses.detail(r.actor, c, id);
  }
  @Patch('expenses/:id') @Permission('expense.write') update(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(UpdateExpenseDto) d: UpdateExpenseDto,
  ) {
    return this.expenses.update(r.actor, c, id, d);
  }
  @Post('expenses/:id/submit') @Permission('expense.write') submit(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(VersionDto) d: VersionDto,
  ) {
    return this.expenses.submit(r.actor, c, id, d.version);
  }
  @Post('expenses/:id/decisions') @Permission('expense.approve') decision(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(DecisionDto) d: DecisionDto,
  ) {
    return this.expenses.decide(r.actor, c, id, d);
  }
  @Post('expenses/:id/cancel') @Permission('expense.write') cancel(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ReasonDto) d: ReasonDto,
  ) {
    return this.expenses.cancel(r.actor, c, id, d);
  }
  @Post('expenses/:id/payment') @Permission('expense.pay') pay(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(PaymentDto) d: PaymentDto,
  ) {
    return this.expenses.pay(r.actor, c, id, d);
  }
  @Get('expenses/:id/history') @Permission('expense.read') history(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(FinancePageDto) q: FinancePageDto,
  ) {
    return this.expenses.history(r.actor, c, id, q);
  }
  @Get('expenses/:id/submissions/:round') @Permission('expense.read') submission(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('round', ParseIntPipe) round: number,
  ) {
    return this.expenses.submission(r.actor, c, id, round);
  }
  @Post('expenses/:id/attachments')
  @Permission('expense.write')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
    }),
  )
  upload(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(VersionDto) d: VersionDto,
    @UploadedFile() f?: EvidenceFile,
  ) {
    return this.expenses.upload(r.actor, c, id, d.version, f);
  }
  @Delete('expenses/:id/attachments/:fileId') @Permission('expense.write') remove(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Query(VersionDto) d: VersionDto,
  ) {
    return this.expenses.removeAttachment(r.actor, c, id, fileId, d.version);
  }
  @Get('expenses/:id/attachments/:fileId') @Permission('expense.read') async file(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @Res() res: Response,
  ) {
    const file = await this.expenses.download(r.actor, c, id, fileId);
    res.set({
      'Content-Type': file.mime,
      'Content-Disposition': `attachment; filename="evidence"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    res.send(file.bytes);
  }
}
