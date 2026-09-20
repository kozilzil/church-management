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
