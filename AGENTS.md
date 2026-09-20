# AGENTS.md

## Project mission

한국 교회를 위한 교적·재정 관리 시스템을 개발한다. 단순 명부가 아니라 교인의
변화 이력, 가족 관계, 조직 소속, 목양 활동, 헌금과 회계를 감사 가능한 형태로
관리하는 것이 목적이다.

## Read before changing code

작업을 시작하기 전에 다음 순서로 관련 문서를 읽는다.

1. `README.md`
2. `ARCHITECTURE.md`
3. 해당 기능의 `docs/requirements/`
4. `docs/architecture/`
5. 적용되는 `docs/decisions/`
6. 해당 작업이 정의된 `docs/tasks/`

문서가 충돌하면 요구사항을 추측하지 말고 충돌 지점을 명시한다. 새로운 도메인
정책은 코드에만 숨기지 말고 요구사항 또는 ADR에 함께 반영한다.

## Architecture rules

- Modular Monolith로 시작한다. 모듈 간 내부 구현을 직접 참조하지 않는다.
- 모듈 경계를 넘는 호출은 공개 application service 또는 명시적 domain event를 사용한다.
- API, application, domain, infrastructure 관심사를 구분한다.
- ORM 모델을 API 응답 모델이나 도메인 모델로 그대로 노출하지 않는다.
- PostgreSQL이 데이터의 기준이다. schema 변경에는 migration이 필수다.
- 시간은 DB에 UTC로 저장하고 UI에서 교회 표준 시간대로 표시한다.
- 금액은 정수 원화 단위 또는 명시된 Decimal을 사용하며 부동소수점을 사용하지 않는다.

## Domain invariants

- `Member`와 `Household`은 별도 aggregate다.
- 교인은 한 시점에 최대 하나의 활성 Household에 속한다.
- 교적 상태, 가족 이동, 조직 소속, 직분 변화는 이력을 남긴다.
- 과거 이력은 원칙적으로 수정·삭제하지 않고 정정 기록을 추가한다.
- 게시(posted)된 재정 거래는 수정하거나 삭제하지 않는다. 역분개로 정정한다.
- 모든 분개는 차변 합계와 대변 합계가 일치해야 한다.
- 주민등록번호 전체 값은 저장하지 않는다. 법적 필요성이 승인되기 전에는 필드를 만들지 않는다.
- 개인정보와 인증정보를 로그에 기록하지 않는다.

## Security and authorization

- 인증만으로 접근을 허용하지 않는다. 모든 mutation과 민감 조회에서 권한을 검사한다.
- 기본 권한 모델은 RBAC이며, 교구/부서 범위 제한을 별도로 적용할 수 있어야 한다.
- 재정 권한과 교적 권한을 분리한다.
- 내보내기, 대량 조회, 권한 변경, 재정 게시/취소는 감사 로그 대상이다.
- 비밀값은 환경 변수 또는 secret manager로 주입하고 저장소에 커밋하지 않는다.

## Deployment contract

- 운영 배포는 Docker Compose 기반이며 서버에서 `./deploy/server-up.sh` 한 명령으로 수행한다.
- script는 image build/pull, DB migration, service start, health 확인을 실패 시 즉시 중단되게 처리한다.
- 운영자가 container 내부에서 migration 명령을 수동으로 실행해야 하는 설계를 만들지 않는다.
- DB와 사용자 업로드는 named volume에 보존하고 container 재생성으로 소실되지 않게 한다.
- 새 runtime dependency 또는 service를 추가하면 production Compose와 배포 문서를 함께 갱신한다.
- 실제 운영 secret이나 `.env.production`을 커밋하지 않는다.

## Implementation workflow

각 작업은 다음 순서로 수행한다.

1. 요구사항과 acceptance criteria를 요약한다.
2. 관련 모듈과 기존 테스트를 조사한다.
3. 최소 변경 계획을 제시한다.
4. schema 변경이 있으면 migration을 먼저 설계한다.
5. 기능과 권한 검사를 구현한다.
6. 성공, 검증 실패, 권한 실패, 경계 조건 테스트를 추가한다.
7. lint, typecheck, unit/integration test를 실행한다.
8. 동작이나 결정이 바뀌면 문서를 갱신한다.

## Completion checklist

- acceptance criteria를 모두 충족했는가?
- tenant/church 경계를 넘는 데이터 접근이 없는가?
- 개인정보가 응답·로그·오류에 불필요하게 포함되지 않는가?
- migration의 forward 동작과 기존 데이터 영향을 검토했는가?
- API 계약과 오류 형식이 일관적인가?
- 새 도메인 규칙이 테스트로 고정됐는가?
- 관련 문서가 현재 구현과 일치하는가?
- `./deploy/server-up.sh`를 사용한 clean-server 배포 경로가 유지되는가?

## Change restrictions

- 요청받지 않은 대규모 리팩터링을 기능 변경과 섞지 않는다.
- migration 파일을 이미 공유한 뒤에는 덮어쓰지 말고 새 migration을 추가한다.
- 테스트를 통과시키기 위해 보안 검사나 도메인 검증을 약화하지 않는다.
- 외부 오픈소스 코드를 그대로 복사하지 않는다. 라이선스와 출처를 검토한 뒤 별도 승인한다.
- 실제 교인·헌금 자료를 fixture, screenshot, test log에 사용하지 않는다.

## Commit guidance

- 한 커밋에는 하나의 논리적 변경만 담는다.
- 권장 형식: `type(scope): summary`
- 예: `feat(member): add household assignment history`
- 예: `test(finance): cover unbalanced journal rejection`
