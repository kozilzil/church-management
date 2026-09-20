import { Module } from '@nestjs/common';
import { RegistryService } from './application/registry.service';
import { RegistryController } from './interface/registry.controller';
@Module({ providers: [RegistryService], controllers: [RegistryController] })
export class RegistryModule {}
