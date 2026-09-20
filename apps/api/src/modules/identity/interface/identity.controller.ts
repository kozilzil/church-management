import { Controller, Get, Inject, Param, Req } from '@nestjs/common';
import { AccessService } from '../application/access.service';
import { Permission, type AuthRequest } from './access.guard';

@Controller('churches/:churchId/access')
export class IdentityController {
  constructor(@Inject(AccessService) private readonly access: AccessService) {}
  @Get()
  @Permission('identity.read')
  read(@Req() request: AuthRequest, @Param('churchId') churchId: string) {
    this.access.require(request.actor, churchId, 'identity.read');
    return { churchId, userId: request.actor.userId };
  }
}
