import { Controller, Get, Post, Inject, Req, Param, ParseUUIDPipe, Header } from '@nestjs/common';
import { Permission, type AuthRequest } from '../../identity/interface/access.guard';
import { ValidatedBody as Body, ValidatedQuery as Query } from '../../../platform/http/validated';
import { BudgetService } from '../application/budget.service';
import { BudgetQuery, BudgetRevisionDto, BudgetHistoryQuery } from './budget.dto';
@Controller('churches/:churchId/finance/budgets')
export class BudgetController {
  constructor(@Inject(BudgetService) private readonly service: BudgetService) {}
  @Get('definitions')
  @Permission('budget.read')
  @Header('Cache-Control', 'private, no-store')
  definitions(@Req() r: AuthRequest, @Param('churchId', ParseUUIDPipe) c: string) {
    return this.service.definitions(r.actor, c);
  }
  @Get()
  @Permission('budget.read')
  @Header('Cache-Control', 'private, no-store')
  summary(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Query(BudgetQuery) q: BudgetQuery,
  ) {
    return this.service.summary(r.actor, c, q);
  }
  @Get('history')
  @Permission('budget.read')
  @Header('Cache-Control', 'private, no-store')
  history(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Query(BudgetHistoryQuery) q: BudgetHistoryQuery,
  ) {
    return this.service.history(r.actor, c, q);
  }
  @Post('revisions')
  @Permission('budget.write')
  @Header('Cache-Control', 'private, no-store')
  save(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(BudgetRevisionDto) d: BudgetRevisionDto,
  ) {
    return this.service.save(r.actor, c, d);
  }
}
