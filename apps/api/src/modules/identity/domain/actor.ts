export interface Actor {
  authenticatedAt?: number;
  mfaVerified?: boolean;
  userId: string;
  churchId: string;
  roles: string[];
  permissions: string[];
  correlationId: string;
}
