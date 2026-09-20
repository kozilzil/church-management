# Phase 0: 저장소 부트스트랩

각 항목은 독립적인 PR로 완료하는 것을 권장한다.

## P0-001 TypeScript monorepo 생성

상태: **완료**

### 범위

- pnpm workspace
- `apps/api`, `apps/web`, `packages/contracts`
- 공통 TypeScript, lint, format 설정

### Acceptance criteria

1. root에서 install, lint, typecheck, test, build 명령이 동작한다.
2. 각 workspace가 독립적으로 build 가능하다.
3. 최소 예제 외 업무 코드는 구현하지 않는다.

## P0-002 PostgreSQL 개발 환경

상태: **구현 완료 · 로컬 PostgreSQL 및 독립 DB 검증**

새 DB의 migration/seed 및 반복 적용을 로컬 PostgreSQL에서 검증한다.
통합 테스트가 생성한 일회용 DB에서 reset을 포함한 초기화 경로도 검사한다.

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

상태: **완료**

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

상태: **구현 및 로컬 검증 완료**

### 범위

- User, Role, Permission 최소 schema
- request context에 user/church scope
- 테스트용 인증 adapter

### Acceptance criteria

1. 인증 없음, 권한 없음, scope 위반을 구분한다.
2. controller뿐 아니라 use case에서도 scope를 검사할 수 있다.
3. production 인증 방식은 adapter 뒤에 격리한다.

## P0-005 CI

상태: **workflow 구현 및 동일 명령 로컬 검증 완료 · GitHub 실행 대기**

### 범위

- GitHub Actions
- lint, typecheck, unit, integration, build

### Acceptance criteria

1. PR에서 모든 검사가 실행된다.
2. 실패한 단계가 명확히 표시된다.
3. CI가 production secret을 요구하지 않는다.

## P0-006 서버 PC 단일 명령 배포

상태: **구현 완료 · Docker 검증 스크립트 포함**

### 범위

- `deploy/compose.production.yml`
- `deploy/.env.production.example`
- `deploy/server-up.sh`
- gateway, web, api, migration, PostgreSQL service
- health check, named volume, log rotation, restart policy
- backup/restore runbook

### Acceptance criteria

1. 새 Linux 서버에서 Docker Engine과 Compose plugin을 설치하고 환경 파일을 한 번 설정한다.
2. 이후 `./deploy/server-up.sh` 한 명령으로 build/pull, migration, 기동, health 확인이 완료된다.
3. 같은 명령을 다시 실행해도 데이터가 유지되고 안전하게 업그레이드된다.
4. migration 실패 시 API 신규 version이 정상 서비스 상태로 표시되지 않는다.
5. container를 삭제·재생성해도 DB와 업로드 데이터가 named volume에 남는다.
6. 운영 secret은 Git history, image layer, log에 포함되지 않는다.
7. `docker compose ... down`은 데이터를 삭제하지 않으며 volume 삭제는 별도 명시적 절차로만 가능하다.
8. backup 생성과 빈 서버 restore 절차를 실제로 검증한다.
