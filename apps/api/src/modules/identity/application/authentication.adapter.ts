import type { Request } from 'express';
import type { Actor } from '../domain/actor';

export abstract class AuthenticationAdapter {
  abstract authenticate(request: Request): Promise<Actor | null>;
}
