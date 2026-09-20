# 교적·재정 관리 프로그램

한국 교회의 교적과 재정을 안전하고 일관되게 관리하기 위한 웹 기반 시스템입니다.

이 저장소는 Codex가 요구사항을 이해하고 작은 작업 단위로 구현할 수 있도록
`Repository Knowledge Pack`과 Phase 0 실행 기반을 함께 구성합니다. 현재는 Web, API,
PostgreSQL 개발 환경과 공통 API 골격까지 제공하며 실제 교적 기능은 Phase 1에서 구현합니다.

## 목표

- 교인과 가족(세대)의 현재 정보 및 변화 이력 관리
- 교구·구역·부서·교회학교 등 조직과 소속 관리
- 새가족, 출석, 심방, 교육 등 목양 업무 지원
- 헌금 접수부터 복식부기 회계, 예산, 결산까지 추적 가능한 재정 관리
- 개인정보 최소 수집, 역할 기반 권한, 감사 로그를 기본 설계에 포함
- 기부금영수증과 각종 교적 증명서 발급 기반 마련

## 문서 진입점

| 문서                                                                   | 목적                                          |
| ---------------------------------------------------------------------- | --------------------------------------------- |
| [AGENTS.md](AGENTS.md)                                                 | Codex와 개발자가 반드시 따라야 할 저장소 규칙 |
| [ARCHITECTURE.md](ARCHITECTURE.md)                                     | 전체 시스템 구조와 모듈 경계                  |
| [docs/requirements/00-overview.md](docs/requirements/00-overview.md)   | 범위, 사용자, 용어, 단계별 목표               |
| [docs/architecture/domain-model.md](docs/architecture/domain-model.md) | 핵심 도메인 모델과 관계                       |
| [docs/architecture/database.md](docs/architecture/database.md)         | 데이터베이스 설계 원칙                        |
| [docs/tasks/phase-1-backlog.md](docs/tasks/phase-1-backlog.md)         | Codex에 전달할 Phase 1 작업 목록              |

## 권장 기술 구성

- TypeScript 모노레포
- Web: React + Vite
- API: NestJS 기반 Modular Monolith
- Database: PostgreSQL + Prisma
- Contract: OpenAPI와 공유 타입
- Test: 단위, 통합, API 계약, E2E 테스트
- Local environment: Docker Compose

기술 선택의 근거와 변경 절차는
[ADR-001](docs/decisions/ADR-001-technology-stack.md)을 따릅니다.

## 개발 환경 실행

필수 도구는 Node.js 24.15 이상, pnpm 11, Docker Engine과 Docker Compose plugin입니다.

```bash
cp .env.example .env
pnpm install
pnpm db:up
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Web: `http://localhost:5173`
- API liveness: `http://localhost:3000/api/v1/health/liveness`
- API readiness: `http://localhost:3000/api/v1/health/readiness`
- Swagger UI: `http://localhost:3000/api/docs`

품질 검사는 root에서 실행합니다.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## 운영 배포 목표

서버 PC에서는 Docker Engine과 Docker Compose plugin만 설치한 뒤, 최초 환경 설정 후
다음 한 명령으로 설치·업그레이드·migration·기동을 수행하는 것을 완료 기준으로 삼습니다.

```bash
./deploy/server-up.sh
```

스크립트 내부의 표준 실행 방식은 다음 Compose 명령으로 고정합니다.

```bash
docker compose --env-file deploy/.env.production -f deploy/compose.production.yml up -d --build
```

아직 애플리케이션 코드가 없으므로 배포 파일은 Phase 0에서 실행 가능한 형태로 구현합니다.
구체적인 배포 구조와 운영 기준은
[배포 아키텍처](docs/architecture/deployment.md)를 참조합니다.

## 예상 저장소 구조

```text
church-management/
├── AGENTS.md
├── ARCHITECTURE.md
├── apps/
│   ├── api/
│   └── web/
├── packages/
│   └── contracts/
├── infrastructure/
│   └── database/
├── deploy/
│   └── README.md
└── docs/
    ├── requirements/
    ├── architecture/
    ├── decisions/
    ├── references/
    └── tasks/
```

## 개발 시작 순서

1. [Phase 0 부트스트랩](docs/tasks/phase-0-bootstrap.md)을 구현합니다.
2. `Member`, `Household`, `Organization`, `Position`, `MemberHistory`를 Phase 1로 구현합니다.
3. 작업 하나마다 migration, 권한 검사, 테스트, 문서 갱신을 함께 완료합니다.
4. 헌금·회계 기능은 교적 Core가 안정된 뒤 별도 Phase로 진행합니다.

## 현재 상태

- [x] 목표와 범위 초안
- [x] 모듈 경계와 핵심 도메인 모델
- [x] 보안·데이터베이스·API 원칙
- [x] 서버 PC 단일 명령 Docker 배포 원칙
- [x] Phase 0/1 Codex 작업 목록
- [x] 실행 가능한 모노레포 부트스트랩
- [x] API health, 표준 오류, correlation ID, 로그 redaction
- [x] PostgreSQL Compose와 Prisma 최초 migration 구성
- [ ] 실행 가능한 production Compose와 `server-up.sh`
- [ ] 교적 Core 구현
- [ ] 출석·심방 구현
- [ ] 헌금·회계 구현

## 라이선스

현재 별도 라이선스를 부여하지 않았습니다. 외부 공개 또는 제3자 배포 전에
라이선스 정책을 결정해야 합니다. 참고 프로젝트의 코드는 복사하지 않고 구조와
업무 개념만 참고합니다.
