# ADR-001: 초기 기술 스택

- 상태: Proposed
- 날짜: 2026-09-20

## Context

한정된 인원과 Codex 중심 개발에서 backend/frontend 언어를 통일하고, 교적과 재정의
transaction을 안전하게 구현하며, 향후 운영자가 유지보수하기 쉬운 구성이 필요하다.

## Decision

- pnpm workspace 기반 TypeScript monorepo
- Web: React + Vite
- API: NestJS
- Database: PostgreSQL
- ORM/migration: Prisma
- API contract: OpenAPI
- Local infrastructure: Docker Compose
- CI: lint, typecheck, unit, integration, build 순서의 GitHub Actions

정확한 dependency version은 Phase 0 구현 시 당시 지원되는 안정 버전을 lockfile로 고정한다.

## Consequences

### 장점

- frontend/backend의 타입과 도구를 공유하기 쉽다.
- NestJS module 구조가 Modular Monolith 경계와 잘 맞는다.
- PostgreSQL constraint와 transaction 기능을 활용할 수 있다.
- Codex가 한 저장소에서 계약, 구현, 테스트를 함께 추적하기 쉽다.

### 단점

- TypeScript만으로 domain 경계가 자동 보장되지는 않는다.
- Prisma가 제공하지 않는 고급 PostgreSQL constraint는 SQL migration이 필요할 수 있다.
- 대규모 통계/보고서에는 별도 read model이 필요할 수 있다.

## Revisit when

- 팀의 주력 언어가 확정적으로 달라진다.
- 오프라인 우선 또는 네이티브 모바일이 핵심 요구사항이 된다.
- 단일 애플리케이션의 배포/확장 한계가 측정된다.
