import { BudgetController } from './interface/budget.controller';
import { BudgetService } from './application/budget.service';
import { ReportController } from './interface/report.controller';
import { ReportService } from './application/report.service';
import { RegistryModule } from '../registry/registry.module';
import { HometaxController } from './interface/hometax.controller';
import { HometaxService } from './application/hometax.service';
import { OfferingController } from './interface/offering.controller';
import { OfferingService } from './application/offering.service';
import { ReceiptService } from './application/receipt.service';
import { Module } from '@nestjs/common';
import { FinanceController } from './interface/finance.controller';
import { FinancePolicy } from './application/finance-policy.service';
import { LedgerService } from './application/ledger.service';
import { ExpenseService } from './application/expense.service';
import { EvidenceStorage, VolumeEvidenceStorage } from './infrastructure/evidence-storage';
@Module({
  imports: [RegistryModule],
  controllers: [
    FinanceController,
    OfferingController,
    HometaxController,
    ReportController,
    BudgetController,
  ],
  providers: [
    FinancePolicy,
    BudgetService,
    ReportService,
    OfferingService,
    ReceiptService,
    HometaxService,
    LedgerService,
    ExpenseService,
    { provide: EvidenceStorage, useClass: VolumeEvidenceStorage },
  ],
})
export class FinanceModule {}
