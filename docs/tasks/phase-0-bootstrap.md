# Phase 0: 저장소 부트스트랩

각 항목은 독립적인 PR로 완료하는 것을 권장한다.

## P0-001 TypeScript monorepo 생성

### 범위

- pnpm workspace
- `apps/api`, `apps/web`, `packages/contracts`
- 공통 TypeScript, lint, format 설정

### Acceptance criteria

1. root에서 install, lint, typecheck, test, build 명령이 동작한다.
2. 각 workspace가 독립적으로 build 가능하다.
3. 최소 예제 외 업무 코드는 구현하지 않는다.

## P0-002 PostgreSQL 개발 환경

### 범위

- Docker Compose
- Prisma 설정과 최초 migration
- `.env.example`
- local reset/seed 명령

### Acceptance criteria

1. 비밀값이 저장소에 포함되지 않는다.
2. 새 개발자가 문서의 명령만으로 DB를 시작할 수 있다.
3. migration과 seed가 빈 DB에서 반복 가능하다.

## P0-003 API 공통 골격

### 범위

- health/readiness endpoint
- correlation id
- 표준 오류 응답
- validation과 log redaction
- OpenAPI 생성

### Acceptance criteria

1. API error가 `docs/architecture/api-design.md` 형식을 따른다.
2. request마다 correlation id가 있다.
3. 민감 header가 로그에 남지 않는 테스트가 있다.

## P0-004 인증과 RBAC 골격

### 범위

- User, Role, Permission 최소 schema
- request context에 user/church scope
- 테스트용 인증 adapter

### Acceptance criteria

1. 인증 없음, 권한 없음, scope 위반을 구분한다.
2. controller뿐 아니라 use case에서도 scope를 검사할 수 있다.
3. production 인증 방식은 adapter 뒤에 격리한다.

## P0-005 CI

### 범위

- GitHub Actions
- lint, typecheck, unit, integration, build

### Acceptance criteria

1. PR에서 모든 검사가 실행된다.
2. 실패한 단계가 명확히 표시된다.
3. CI가 production secret을 요구하지 않는다.
