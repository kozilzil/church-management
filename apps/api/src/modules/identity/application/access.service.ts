import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Actor } from '../domain/actor';

@Injectable()
export class AccessService {
  require(actor: Actor, churchId: string, permission: string): void {
    if (actor.churchId !== churchId) {
      throw new ForbiddenException({
        code: 'CHURCH_SCOPE_VIOLATION',
        message: '교회 범위를 벗어난 요청입니다.',
      });
    }
    if (!actor.permissions.includes(permission)) {
      throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: '권한이 없습니다.' });
    }
  }
}
