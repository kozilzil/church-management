import { Module } from '@nestjs/common';
import { FinanceController } from './interface/finance.controller';
import { FinancePolicy } from './application/finance-policy.service';
import { LedgerService } from './application/ledger.service';
import { ExpenseService } from './application/expense.service';
import { EvidenceStorage, VolumeEvidenceStorage } from './infrastructure/evidence-storage';
@Module({
  controllers: [FinanceController],
  providers: [
    FinancePolicy,
    LedgerService,
    ExpenseService,
    { provide: EvidenceStorage, useClass: VolumeEvidenceStorage },
  ],
})
export class FinanceModule {}
