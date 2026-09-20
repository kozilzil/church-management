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

## Phase 3A 지출 결재 업그레이드

013 migration은 지출 요청·제출본·결재선·증빙·지급과 계정·기금·기간·불변 원장을 만든다.
기존 identity.manage 역할과 신규 bootstrap 관리자에는 finance.manage만 추가한다.
재정 상세·승인·지급 권한을 시스템 관리자에게 자동으로 부여하지 않는다.

최초 설정 순서:

1. 재정 설정에서 비용/자산 계정, 기금, 회계기간을 만든다. 계정·기금의 코드/이름은 게시 이력 보호를 위해 이 버전에서는 생성만 지원한다.
2. 계정·권한에서 재정 역할을 만들고 다른 담당 사용자에게 지정한다. 재정은 교적 데이터 범위와 별도로 업무 참여/재정 권한을 적용한다.
3. 요청자: expense.read + expense.write. 결재자: expense.read + expense.approve.
4. 지급자: expense.read + expense.pay. 감사/회계: expense.read + finance.readall, 필요 시 finance.close/finance.reverse를 별도 부여한다.
5. 요청자·결재자·지급자는 서로 다른 사용자다. 운영의 결재/지급/설정/마감/역분개 담당자는 MFA를 등록하고 다시 로그인한다.

증빙 파일은 UPLOAD_DIR=/app/uploads 하위 expenses 디렉터리에 UUID 키로 저장한다.
기존 uploads volume 및 backup/restore 절차에 포함되며 공개 정적 경로가 없다.
기본 개발 경로는 apps/api 실행 기준 ../../.tmp/uploads이며 UPLOAD_DIR로 재정의할 수 있다.
파일을 DB 백업과 함께 보관하고, 만료 시 자동 삭제하지 않으므로 실제 증빙 보존·파기 운영 정책을 별도로 관리한다.
JPEG/PNG/PDF 시그니처·크기 검사와 권한 다운로드를 제공하며 악성코드 검사 엔진은 아직 포함하지 않는다.
게이트웨이는 multipart 여유를 포함해 요청 본문을 11 MiB로 제한하고 API는 파일당 10 MiB, 현재 증빙 10개를 제한한다.

업그레이드 시 불변 재정·지급·제출본 테이블의 UPDATE/DELETE와 나머지 재정 기록 DELETE 권한을 runtime role에서 제거한다.
회계 마감은 재개하지 않는다. 역분개는 장부 정정이며 실제 송금 취소나 재지급을 수행하지 않는다.

## 개별 헌금과 기부금영수증 (Phase 3B)

1. 기존 재정 설정에서 자산 계정·수익 계정·기금·열린 회계기간을 준비한다.
2. **헌금·기부금영수증 → 헌금·발급 설정**에서 헌금 종류와 영수증 대상 여부를 설정한다.
3. 영수증 발급기관의 고유번호, 소재지, 대표자, 적격 근거·확인 기록과 전자발급 의무 여부를 설정한다.
4. 입력자가 기부자를 등록(필요 시 교인 검색·연결)하고 헌금을 **한 건씩** 저장한다. 익명도 가능하다.
5. 별도 검수자가 검수하고 게시 담당자가 회계에 반영한다. 수정 시 재검수한다.
6. 발급 담당자가 기부자·귀속연도를 선택하고 미리보기의 금액·항목을 확인해 번호를 발급한다.
7. 인쇄 권한자가 기부자 본인의 주민등록번호를 인쇄 화면에만 입력하고 브라우저 인쇄/PDF 저장을 수행한다.
   서명·날인 후 완성된 발급명세 원본은 교회가 별도 보관한다. 전체 식별번호는 API·DB·웹 저장소로 보내지 않는다.
8. 재출력은 같은 번호, 취소 후 재발급은 새 번호다. 헌금 정정은 영수증 취소 후 수행한다.

| 역할             | 권한                                            |
| ---------------- | ----------------------------------------------- |
| 헌금 입력        | offering.read, offering.write                   |
| 헌금 검수        | offering.read, offering.review                  |
| 회계 게시·정정   | offering.read, offering.post / offering.reverse |
| 영수증 조회      | receipt.read                                    |
| 영수증 발급·출력 | receipt.read, receipt.issue, receipt.print      |
| 영수증 취소      | receipt.read, receipt.cancel                    |
| 기본 설정        | finance.manage                                  |

기존 계정에 위 업무 권한을 자동 부여하지 않는다. identity.manage와 finance.manage를 가진 관리자가
다른 사용자에게 역할을 부여한다. 관리자 자신의 역할 변경은 기존대로 금지한다.
검수·게시·정정·발급·출력·취소 담당자는 운영 환경에서 MFA가 필요하고, 해당 처리 시 15분 이내 인증을 요구한다.

개인의 직접 금전기부·종교단체 코드 41 자체 영수증을 지원한다. 홈택스 자동 전송/연말정산 자동 제출,
법인/현물 기부 발급, 대량 배치 입력과 법정 신고파일 자동 생성은 별도 범위다.
전자발급 의무 대상으로 설정한 교회는 자체 신규 발급을 차단한다. 발급대장만으로 전체 식별번호가 필요한
법정 발급명세 원본의 보관 의무를 대체하지 않는다. 적격 여부·보관 절차를 확인한 담당자가 운영 설정한다.
새 외부 서비스·시크릿·런타임 의존성은 추가하지 않았다. 기존 DB 백업에 모든 신규 원본/취소 이력이 포함된다.

## 홈택스 전자기부금영수증 파일 연동

1. 홈택스에서 교회의 전자기부금영수증 발급권한을 신청·승인받는다.
2. 발급기관 고유번호/사업자번호와 명칭을 정확히 설정한다. 번호 검증과 공식 규격의 한글 바이트 길이를 검사한다.
3. 담당자에게 `receipt.read`와 `receipt.export`를, 결과 확인 담당자에게 `receipt.read`와 `receipt.reconcile`을 부여한다. 운영에서는 MFA와 15분 이내 인증이 필요하다.
4. **헌금·기부금영수증 → 홈택스 연동**에서 기부자/귀속연도별 대상을 확인하고 담당자 연락처를 입력해 제출을 준비한다.
5. 실제 기부자 주민번호를 일회성 입력해 `A0420_사업자번호자료제출일자.D001` 파일을 내려받는다. 이 번호는 서버에 저장되지 않는다.
6. 홈택스 전자기부금영수증 **일괄발급** 화면에서 전산매체 파일을 업로드·검증한 후 **제출하기**까지 진행한다. 파일만 내려받거나 업로드했다고 발급된 것이 아니다.
7. 제출내역과 발급 목록에서 자료관리번호/기부일/금액/기부자를 대조한다. 앱에서 건별 **발급 확인**, **미발급 확인**을 등록한다. 확인 참조에는 접수번호·발급내역 식별정보를 입력하고 주민번호는 넣지 않는다.
8. 취소는 홈택스에서 먼저 수행하고 앱에 **취소 확인**을 기록한다. 출력과 공식 영수증 조회도 홈택스에서 한다.

하나의 준비 건은 한 기부자·한 연도의 최대 500개 금전 헌금이다. 종교단체 코드 41/405 신규 발급을 지원한다.
기존 자체 영수증을 이미 발급한 헌금은 중복 제외된다. 준비만 했어도 결과가 불명확하면 다시 발급하거나 역분개하지 못한다.
부분 오류는 오류 항목만 미발급 확인 후 새로 준비한다. 결과가 하나라도 등록된 준비 건은 재다운로드할 수 없다.
모든 항목이 미확인일 때 같은 파일을 다시 내려받을 수 있으나, 기존 업로드 삭제/미제출을 먼저 확인한다.
홈택스는 중복 발급을 자동으로 막아준다고 가정할 수 없다. 여러 다운로드 중 최종 제출할 파일만 사용한다.

제출 파일은 전체 주민등록번호와 기부 내역을 포함하므로 교회의 승인된 보관·폐기 절차를 따른다.
자동 로그인·인증서 보관·국세청 자동 전송/조회 API는 없다. 앱의 상태는 담당자가 수동 대조한 기록이다.
실제 홈택스 접수 검증은 발급권한을 가진 교회 담당자가 수행해야 하며 합성 테스트에서 실발급은 수행하지 않는다.
공식 규격이 바뀌면 [확인한 제출요령](https://www.nts.go.kr/nts/na/ntt/selectNttInfo.do?mi=40253&nttSn=1338534)을 다시 대조한다.

## 재정보고서 권한 설정

기존 역할에는 새 보고서 권한을 자동 부여하지 않는다. 필요한 역할에 `finance.report`를 부여하고 재로그인한다.
집계만 필요한 담당자에게는 이 권한만 부여한다. 원장 행 대조는 `finance.readall`, 원거래·증빙은
`offering.read`/`expense.read`를 추가로 부여한다. CSV는 `finance.export`도 필요하며 운영 MFA 및 최근 인증을 요구한다.
재정 → 재정보고서에서 조회한 뒤 현재 표시 결과를 내보낸다. [상세 정책](../docs/decisions/ADR-010-financial-reports.md).

## 예산 담당자 설정

역할에 `budget.read`를 부여하면 재정 → 연간 예산에서 집계와 이력을 조회한다.
편성 담당자는 `budget.write`도 필요하며 운영 MFA와 최근 15분 인증을 확인한다. 권한 변경 뒤 재로그인한다.
저장 즉시 연간 예산에 반영되므로 교회의 승인된 예산 자료를 입력한다. 이번 기능은 결재/지급을 차단하지 않는다.
`budget_revision`은 PostgreSQL 백업에 포함하며 runtime의 UPDATE/DELETE 권한을 회수한다.
