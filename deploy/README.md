# 단일 서버 배포

1. Docker Engine/Compose를 설치한다.
2. `.env.production.example`을 `.env.production`으로 복사하고 `chmod 600`을 적용한다.
3. 서로 다른 URL-safe 32자 이상의 POSTGRES_PASSWORD/POSTGRES_RUNTIME_PASSWORD 및 실제 HTTPS `APP_BASE_URL`을 설정한다.
4. TLS reverse proxy 뒤에 기본 loopback gateway를 연결한다.
5. `./deploy/server-up.sh`를 실행한다. 실패하면 즉시 종료하며 성공 전 health를 확인한다.

HTTP 로컬 검증에만 `COOKIE_SECURE=false`와 localhost URL을 사용한다. 운영 인증에는 HTTPS가 필요하다.
`DEPLOY_ENV_FILE=/absolute/path`로 독립된 테스트 환경을 지정할 수 있다. 다른
`COMPOSE_PROJECT_NAME`은 별도 DB/업로드 volume을 사용한다. DB port는 외부에 노출하지 않는다.

## 업그레이드와 복구

기존 DB가 있으면 배포 전에 backup을 생성한다. `./deploy/backup.sh`는 DB SQL과 업로드 archive를
`.tmp/backups`에 소유자만 읽을 수 있도록 저장한다. 운영자는 이를 암호화된 외부 저장소에 복제해야 한다.
업로드 기능은 아직 없으며 volume/backup 경로만 준비되어 있다.

빈 서버 복구: 같은 image를 build한 뒤 빈 Compose project를 대상으로
`./deploy/restore.sh /path/to/backup-base` 실행 후 `./deploy/server-up.sh`를 실행한다.
restore는 기존 public table이 있으면 덮어쓰기를 거부한다. application image rollback과 DB restore는
별도 절차이며 migration을 자동 역실행하지 않는다.

일상 종료에는 `docker compose --env-file deploy/.env.production -f deploy/compose.production.yml down`을
사용한다. `down -v`는 데이터를 삭제하므로 일상 운영에 사용하지 않는다.

## 최초 관리자와 MFA 복구

운영 관리자 생성은 API 컨테이너에서 한 번 `pnpm admin:bootstrap`을 실행한다.
`BOOTSTRAP_CHURCH_NAME`, `BOOTSTRAP_USERNAME`, `BOOTSTRAP_PASSWORD`는 환경 변수로만 전달한다.
비밀번호를 Compose 파일, image, Git에 포함하지 않는다. 생성된 church ID를 로그인에 사용한다.

MFA 등록 전에 `.env.production`의 `MFA_ENCRYPTION_KEY`를 64자리 무작위 hex로 설정한다.
이 키는 DB의 암호화된 MFA secret을 복구하는 데 필요하므로 DB backup과 함께 안전하게 보관한다.
환경 파일 예시의 placeholder를 그대로 사용할 수 없다. 키를 임의 교체하면 기존 MFA를 복호화할 수 없다.

서버 운영자 계정 복구: `RECOVERY_CHURCH_ID`, `RECOVERY_USERNAME`, `RECOVERY_PASSWORD`를
환경 변수로 주입해 `pnpm admin:recover` 실행. MFA도 잃었다면 `RECOVERY_RESET_MFA=1`을
추가한다. 이 명령은 세션을 폐기하고 `account.recover.cli` 감사 이벤트를 기록한다.
웹에서 본인 권한을 확장하거나 인증 없이 관리자 비밀번호를 재설정하는 기능은 제공하지 않는다.

## 자동 검증

`./scripts/verify-deployment.sh`는 일회용 테스트 환경에서 설치·업그레이드·컨테이너 재생성·
DB/업로드 보존·backup·restore 및 덮어쓰기 거부를 검사한다. 테스트 프로젝트 volume만 제거한다.
`./scripts/test-deploy-gate.sh`는 실패한 migration 이후 기동이 중단되는지를 검사한다.

운영 API는 `church_runtime`이라는 비소유자 DB role을 사용한다. migration/backup은 별도
DB owner 계정을 사용한다. 배포 시 runtime 권한을 갱신하며 감사·상태 이력의 UPDATE/DELETE와
기간 이력의 DELETE 권한을 제거한다. 애플리케이션 계정에는 schema 변경·TRUNCATE 권한을 주지 않는다.

## Phase 2 업그레이드와 목양 메모

008–012 migration과 신규 감사 이력 테이블이 추가됐다. 기존 사용자는 전체 교회 범위를 유지한다.
업그레이드 후 계정·권한에서 담당자 범위를 검토하고 필요에 맞게 좁힌다. 새 계정의 기본 범위는 접근 없음이다.
기존 identity.manage 역할에는 새 운영 권한이 추가되며 다른 역할은 관리자가 별도로 부여한다.

민감 메모는 초기 비활성이다. 실제 보존·파기 정책을 확정한 뒤 별도 무작위 `CARE_ENCRYPTION_KEY`(64 hex)를
환경 파일에 설정하고 재배포한다. UI에서 정책 문서와 보존 일수를 설정하고 활성화한다. MFA 키와 재사용하지 않는다.
키는 DB 백업과 별도로 안전하게 보존하며, 키 분실 시 메모를 복호화할 수 없다. 백업 보존·파기도 같은 정책에 맞춘다.
앱 기동 시와 매시간 만료 메모 암호문과 임시 이전 자료를 정리한다. 실패는 본문 없이 서버 로그에 기록한다.
수동 메모 파기는 `./deploy/purge-care-notes.sh` 또는 개발 환경 `pnpm care:purge`를 사용한다.
운영 DB role은 attendance_change/newcomer_change/care_change의 UPDATE/DELETE와 care_note의 DELETE 권한이 없다.
