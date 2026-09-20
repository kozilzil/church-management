import { DonorDirectoryService } from './application/donor-directory.service';
import { TransferController } from './interface/transfer.controller';
import { TransferService } from './application/transfer.service';
import { Module } from '@nestjs/common';
import { RegistryService } from './application/registry.service';
import { RegistryController } from './interface/registry.controller';
@Module({
  providers: [RegistryService, TransferService, DonorDirectoryService],
  exports: [TransferService, DonorDirectoryService],
  controllers: [RegistryController, TransferController],
})
export class RegistryModule {}
