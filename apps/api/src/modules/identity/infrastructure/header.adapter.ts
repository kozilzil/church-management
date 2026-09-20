import type { Request } from 'express';
import { AuthenticationAdapter } from '../application/authentication.adapter';
import type { Actor } from '../domain/actor';

export class HeaderAdapter extends AuthenticationAdapter {
  async authenticate(request: Request): Promise<Actor | null> {
    if (process.env.NODE_ENV !== 'test' || process.env.AUTH_ADAPTER !== 'test-header') return null;
    const userId = request.header('x-test-user');
    const churchId = request.header('x-test-church');
    if (!userId || !churchId) return null;
    return {
      userId,
      churchId,
      roles: [],
      permissions: (request.header('x-test-permissions') ?? '').split(','),
      correlationId: String((request as Request & { id?: string }).id ?? ''),
    };
  }
}

export class DenyAdapter extends AuthenticationAdapter {
  async authenticate(): Promise<null> {
    return null;
  }
}
