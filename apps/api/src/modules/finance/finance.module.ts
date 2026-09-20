import { RegistryModule } from '../registry/registry.module';
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
  controllers: [FinanceController, OfferingController],
  providers: [
    FinancePolicy,
    OfferingService,
    ReceiptService,
    LedgerService,
    ExpenseService,
    { provide: EvidenceStorage, useClass: VolumeEvidenceStorage },
  ],
})
export class FinanceModule {}
