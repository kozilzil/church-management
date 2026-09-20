import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from './database/prisma.service';
import { TransferService } from '../modules/registry/application/transfer.service';
import { purgeExpiredCare } from '../modules/operations/application/purge-care';
@Injectable()
export class MaintenanceService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(MaintenanceService.name);
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(TransferService) private readonly transfers: TransferService,
  ) {}
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    void this.run();
    this.timer = setInterval(() => void this.run(), 3600000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      await this.transfers.purgeExpired();
      await purgeExpiredCare(this.db);
    } catch {
      this.logger.error('Expired data cleanup failed; retry with the maintenance command.');
    } finally {
      this.running = false;
    }
  }
}
