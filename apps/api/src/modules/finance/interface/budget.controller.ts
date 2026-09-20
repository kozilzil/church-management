import { BudgetControlService } from '../application/budget-control.service';
import { BudgetApprovalService } from '../application/budget-approval.service';
import {
  BudgetChangesQuery,
  BudgetDecisionDto,
  BudgetCancelDto,
  BudgetPolicyDto,
} from './budget.dto';
import { Controller, Get, Post, Inject, Req, Param, ParseUUIDPipe, Header } from '@nestjs/common';
import { Permission, type AuthRequest } from '../../identity/interface/access.guard';
import { ValidatedBody as Body, ValidatedQuery as Query } from '../../../platform/http/validated';
import { BudgetService } from '../application/budget.service';
import { BudgetQuery, BudgetRevisionDto, BudgetHistoryQuery } from './budget.dto';
@Controller('churches/:churchId/finance/budgets')
export class BudgetController {
  constructor(
    @Inject(BudgetService) private readonly service: BudgetService,
    @Inject(BudgetApprovalService) private readonly approval: BudgetApprovalService,
    @Inject(BudgetControlService) private readonly control: BudgetControlService,
  ) {}
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

  @Get('changes')
  @Permission('budget.read')
  @Header('Cache-Control', 'private, no-store')
  changes(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Query(BudgetChangesQuery) q: BudgetChangesQuery,
  ) {
    return this.approval.list(r.actor, c, q);
  }
  @Post('changes/:id/decision')
  @Permission('budget.approve')
  @Header('Cache-Control', 'private, no-store')
  decision(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(BudgetDecisionDto) d: BudgetDecisionDto,
  ) {
    return this.approval.decide(r.actor, c, id, d);
  }
  @Post('changes/:id/cancel')
  @Permission('budget.write')
  @Header('Cache-Control', 'private, no-store')
  cancel(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(BudgetCancelDto) d: BudgetCancelDto,
  ) {
    return this.approval.decide(r.actor, c, id, d, true);
  }
  @Get('control')
  @Permission('finance.manage')
  @Header('Cache-Control', 'private, no-store')
  policy(@Req() r: AuthRequest, @Param('churchId', ParseUUIDPipe) c: string) {
    return this.control.readPolicy(r.actor, c);
  }
  @Post('control')
  @Permission('finance.manage')
  @Header('Cache-Control', 'private, no-store')
  policySave(
    @Req() r: AuthRequest,
    @Param('churchId', ParseUUIDPipe) c: string,
    @Body(BudgetPolicyDto) d: BudgetPolicyDto,
  ) {
    return this.control.savePolicy(r.actor, c, d);
  }
}
