export type HealthState = 'ok' | 'degraded';

export interface HealthResponse {
  status: HealthState;
  service: string;
  timestamp: string;
  checks?: Record<string, HealthState>;
}

export interface ApiErrorDetail {
  field?: string;
  reason: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details: ApiErrorDetail[];
    correlationId: string;
  };
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}
export interface MembershipPeriod {
  id: string;
  memberId?: string;
  relatedMemberId?: string;
  householdId?: string;
  organizationId?: string | null;
  positionId?: string;
  name?: string;
  relationship?: string;
  role?: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  representative?: boolean;
  primary?: boolean;
}
export interface MemberResponse {
  id: string;
  memberNumber: string;
  name: string;
  registeredOn: string | null;
  status: string;
  version: number;
  phone?: string | null;
  address?: string | null;
  statusHistory?: {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    effectiveFrom: string | null;
    reason?: string;
  }[];
  households?: MembershipPeriod[];
  organizations?: MembershipPeriod[];
  positions?: MembershipPeriod[];
  relations?: MembershipPeriod[];
}
export interface SessionResponse {
  scopeMode?: string;
  memberId?: string | null;
  churchId: string;
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  totpEnabled: boolean;
  mfaVerified?: boolean;
  csrfToken: string;
}
export * from './hometax.js';

export type * from './financial-reports.js';
