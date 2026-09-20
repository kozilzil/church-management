# API application

NestJS 기반 Modular Monolith API입니다.

## 현재 제공 기능

- `/api/v1/health/liveness`: API 프로세스 상태
- `/api/v1/health/readiness`: PostgreSQL 연결을 포함한 준비 상태
- `/api/docs`: Swagger UI
- `/api/docs-json`: OpenAPI JSON
- correlation ID 생성·전파
- 표준 API 오류 응답
- 요청 validation 기본 정책
- 민감 header 로그 redaction

## 실행

저장소 root에서 PostgreSQL을 시작하고 API를 실행합니다.

```bash
cp .env.example .env
pnpm db:up
pnpm db:generate
pnpm db:migrate
pnpm --filter @church/api dev
```
