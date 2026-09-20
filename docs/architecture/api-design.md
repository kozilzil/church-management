# API 설계 원칙

## 스타일

- `/api/v1` prefix의 REST API
- JSON request/response
- OpenAPI가 계약의 기준
- pagination은 cursor 기반을 우선하고 단순 관리 목록은 제한된 offset을 허용
- 날짜는 `YYYY-MM-DD`, 시각은 timezone을 포함한 ISO 8601

## 리소스 예시

```text
POST   /api/v1/members
GET    /api/v1/members
GET    /api/v1/members/{memberId}
PATCH  /api/v1/members/{memberId}
POST   /api/v1/members/{memberId}/status-changes

POST   /api/v1/households
POST   /api/v1/households/{householdId}/members
POST   /api/v1/members/{memberId}/household-moves

POST   /api/v1/organizations
POST   /api/v1/organizations/{organizationId}/memberships
```

업무 사건은 단순 field patch보다 명시적 command endpoint를 사용한다. 예를 들어 가족 이동,
교적 상태 변경, 재정 게시는 별도 endpoint로 표현한다.

## 오류 형식

```json
{
  "error": {
    "code": "HOUSEHOLD_HAS_ACTIVE_MEMBERS",
    "message": "활성 구성원이 있는 가족은 보관 처리할 수 없습니다.",
    "details": [],
    "correlationId": "uuid"
  }
}
```

- code는 안정적인 machine-readable 값이다.
- message는 사용자에게 노출 가능한 문장만 사용한다.
- stack trace와 내부 SQL은 응답에 포함하지 않는다.
- validation 오류는 field path와 reason code를 제공한다.

## 멱등성과 동시성

- 헌금 게시, 문서 발급, 외부 발송에는 idempotency key를 지원한다.
- 충돌 가능 update에는 ETag/version을 사용하고 stale update는 `409 Conflict`로 응답한다.

## 권한과 scope

controller 진입 전에 인증하고 use case 안에서 resource scope까지 확인한다. UI에서 버튼을
숨기는 것은 권한 검사를 대체하지 않는다. 각 request context에는 `user_id`, `church_id`,
역할/permission, correlation id가 포함되어야 한다.

## 구현된 Core API

업무 경로는 `/api/v1/churches/:churchId` 아래에 있다. 모든 ID는 UUID이며 알 수 없는 입력 필드는
거부한다. `GET`은 조회, `POST`는 업무 command, `PATCH`는 현재 프로필/master 수정이다.

| 경로                                                                            | 동작                                                  |
| ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `/members`                                                                      | GET 검색(q, cursor, limit, organizationId), POST 등록 |
| `/members/:id`                                                                  | GET 상세/이력, PATCH 프로필(version 필요)             |
| `/members/:id/status-changes`                                                   | POST 상태·적용일·사유·version                         |
| `/members/:id/relations`, `/member-relations/:id/end`                           | POST 방향 있는 가족 관계 생성·종료                    |
| `/households`, `/households/:id/members?at=YYYY-MM-DD`                          | 가족 생성/목록·날짜별 구성원                          |
| `/household-moves`, `/households/:id/representative`, `/households/:id/archive` | 가족 이동·대표자·보관                                 |
| `/organizations`, `/organizations/:id/parent`, `/organizations/:id/close`       | 조직 목록/생성·부모 변경·폐쇄                         |
| `/organization-memberships`, `/organization-memberships/:id/end`                | 소속 등록·종료                                        |
| `/positions`, `/positions/:id`                                                  | 직분 목록/생성·설정 변경                              |
| `/position-appointments`, `/position-appointments/:id/end`                      | 임명·종료                                             |
| `/definitions`, `/member-statuses`, `/organization-types`                       | 상태/유형 조회·설정                                   |
| `/identity`, `/identity/users`, `/identity/roles`, `/identity/users/:id`        | 계정·역할 조회/생성·역할 교체                         |
| `/audit-events`                                                                 | 감사 cursor 조회                                      |

인증 경로는 `/api/v1/auth/login`, `/me`, `/logout`, `/password`, `/mfa/enroll`, `/mfa/confirm`.
로그인 body는 churchId, username, password, 선택 code다. 로그인 및 모든 변경 요청의 Origin은
APP_BASE_URL과 같아야 한다. 로그인 후 변경 요청은 cookie와 응답의 csrfToken을 x-csrf-token에
담는다. /me는 새로고침 후 CSRF token 복구를 지원한다. 인증 응답은 cache하지 않는다.

목록 limit은 1–100, 기본 30이며 nextCursor로 이어 조회한다. 교인 이름/번호와 허용된 경우
전화번호를 검색한다. 회원이 적은 초기에는 contains 검색을 사용하며 대규모 배포 전 query plan과
trigram index를 검증한다. 재정/목양 권한은 현재 교적 권한에 포함하지 않는다.

## 데이터 범위와 교적 운영 API

교회 기준 경로 아래:

- `GET/PUT /identity/users/:id/scope`: mode, memberId, organizations[{organizationId,descendants}]. 관리자 자신은 변경 불가.
- `POST /transfers/imports/preview`: csv와 mapping. 결과 batchId/errors/candidates/rows.
- `POST /transfers/imports/:id/apply`: 미리보기 실행; 재실행은 replayed=true.
- `POST /transfers/exports`, `POST /transfers/exports/:id/download`: q/선택 organizationId, 10분·1회, JSON 내 csv/filename/count.
- `GET/POST /operations/gatherings`, `GET/POST /operations/gatherings/:id/sessions`.
- `GET/POST /operations/sessions/:id/attendance`: records[{memberId,status,version}], source MANUAL/BULK; 최초 version=0.
- `GET /operations/attendance/:id/history`, `/operations/attendance-summary?from=YYYY-MM-DD&to=YYYY-MM-DD&gatheringId=...`.
- `GET/POST /operations/newcomer-stages`, `PATCH /operations/newcomer-stages/:id`.
- `GET/POST /operations/newcomers`, `PATCH /operations/newcomers/:id`, `GET /operations/newcomers/:id/history`.
- `GET/POST /operations/care`, `PATCH /operations/care/:id`, `GET /operations/care/:id/history`.
- `GET/PUT /operations/care-policy`, `GET /operations/care-roles`, `GET/POST /operations/care/:id/notes`.
- `GET /operations/assignees`: 활성 담당자 선택. 제한 사용자는 본인만; 전체 교회 사용자는 최대 100명.

운영 목록은 cursor/limit(기본 30, 최대 100)을 사용한다. 새가족·목양 목록은 state=open/completed/overdue/all과
assigneeId를 지원한다. profile/출석/새가족/목양 변경은 해당 version을 요구한다. 새가족 dueOn과 목양 followUpOn은
명시적 null로 예정일을 지운다. timestamp는 timezone을 포함한 ISO 문자열이다.

## 지출 결재·재정 (Phase 3A)

접두 경로: `/churches/:churchId/finance`.

- `GET definitions`, `approvers` (결재자 cursor/limit), `settings`, `ledger-definitions`: 업무별 기준정보 권한 분리.
- `POST accounts`, `funds`, `periods`: 계정·기금·열린 회계기간 생성. `POST periods/:id/close`: 마감.
- `GET/POST expenses`, `GET/PATCH expenses/:id`: 접근 가능한 목록·초안·상세. 목록 state=mine/review/pay/all 또는 업무 상태.
- `POST expenses/:id/submit`, `decisions`, `cancel`, `payment`: version 필수. decisions는 APPROVED/REJECTED와 의견/사유를 받는다.
- `GET expenses/:id/history`, `submissions/:round`: 변경 이력과 원본 제출 회차. 상세는 최근 10개 회차, 이전 회차는 개별 조회.
- `POST expenses/:id/attachments?version=N`: multipart/form-data의 file 하나. JPEG/PNG/PDF, 최대 10 MiB.
- `GET/DELETE expenses/:id/attachments/:fileId`: 권한 다운로드/현재 증빙 제외. DELETE에 version query 필수.
- `GET journals`, `POST journals/:id/reverse`: 원장 조회와 열린 기간 역분개. reverse는 postedOn/reason 필수.

금액은 1–999999999999 정수 원화이며 PostgreSQL Decimal(15,0)에 저장한다. API는 안전한 정수 Number로 반환한다.
상신 당시 순차 결재자 1–5명과 증빙을 보존한다. 자기 승인/중복 결재자/선행 승인 건너뛰기를 거부한다.
지급은 승인된 전액 1회만 기록하며 회계 분개와 원자적으로 처리한다. 지급 참조는 교회 내 고유하다.
실제 금융기관 송금 API는 없다. CARD는 즉시 자산에서 출금된 체크카드 결제 기록이며 미지급 신용카드 회계는 후속이다.
설정·승인·지급·마감·역분개는 최근 15분 인증을 요구한다. 운영의 재정 처리자는 MFA를 확인한다.

## 개별 헌금·영수증

`churches/:churchId/finance/offerings`에서 단건 작성·조회·수정을 제공한다.
`:id/review`, `:id/post`, `:id/cancel`, `:id/reverse`는 명시적 업무 command다.
`offering-types`, `donors`, `offering-members`에서 종류·기부자·교인 연결을 관리한다.
`receipt-issuer`는 발급기관 설정, `receipts/preview`는 발급 전 계산, `receipts` POST는 확정 번호 생성이다.
`receipts/:id/print` POST는 권한/최근 인증/유효 상태를 재검사하고 출력 감사 이벤트와 스냅샷을 반환한다.
주민등록번호를 받는 API 필드는 없다. `receipts/:id/cancel`은 별도 취소 기록과 활성 항목 연결 해제다.

## 홈택스 파일 연동

재정 경로 `/churches/:churchId/finance` 아래에 다음 API를 제공한다. 기존 `/receipts/preview`를 함께 사용한다.

| 경로                                             | 업무                                               |
| ------------------------------------------------ | -------------------------------------------------- |
| `/hometax-submissions`                           | GET 목록, POST 준비 (requestId로 재시도 중복 방지) |
| `/hometax-submissions/:id`                       | GET 불변 스냅샷과 건별 결과                        |
| `/hometax-submissions/:id/download`              | POST 미제출 확인 후 파일용 스냅샷·감사             |
| `/hometax-submissions/:id/items/:itemId/results` | POST 담당자가 확인한 발급/미발급/취소 결과         |

API는 주민등록번호와 완성된 제출 파일을 수신하지 않는다. 다운로드 응답에 브라우저 일회성 입력을
결합한다. 같은 결과/참조/사유의 재요청은 동일 성공을 반환하고 다른 내용의 덮어쓰기는 충돌로 거부한다.

## 월별 재정보고서

재정 경로 `/churches/:churchId/finance/reports` 아래:

- `GET definitions`: 교회 시간대와 기금. finance.report 필요.
- `GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&fundId=UUID`: 최대 366일 기간 집계. fundId는 선택.
- `GET lines?from=...&to=...&ledgerVersion=...&accountId=UUID&fundId=UUID&cursor=UUID`:
  finance.report + finance.readall, 50행 cursor 조회. fundId/cursor 선택. 원거래별 읽기 권한이 있어야 source 반환.
- `POST export`: from/to/선택 fundId/ledgerVersion. finance.report + finance.export 및 최근 인증.
  `{filename,csv}`를 반환하며 다운로드 UI에서 파일을 만든다.

응답 집계 금액과 상세 차변·대변은 정수 문자열이다. JS Number로 변환하지 않는다.
`selection.ledgerVersion`을 후속 상세·내보내기에 그대로 보내 조회 후 추가된 거래와 섞지 않는다.
생략된 원장 행과 원거래 설명·개인정보는 집계 API로 노출하지 않는다. 자세한 계산은 ADR-010을 따른다.

## 연간 예산

`/churches/:churchId/finance/budgets` 아래:

- `GET definitions`: 교회 시간대, 지출 계정 및 기금. budget.read 필요.
- `GET ?year=2026&fundId=UUID`: 연간 집계. fundId 선택. budget.read 필요.
- `GET history?year=2026&accountId=UUID&fundId=UUID&beforeVersion=31`: 변경 이력 30개씩,
  nextBeforeVersion으로 이전 기록 조회. beforeVersion 선택. budget.read 필요.
- `POST revisions`: year, accountId, fundId, version, amount, reason. budget.read + budget.write 필요.
  최초 version=0, 이후 현재 항목 version을 전송한다. amount는 최대 15자리 비음수 정수 문자열이며 reason은 1–300자다.

집계 금액은 정수 문자열, 집행률은 소수 둘째 자리까지 문자열이다. 미편성/0원 예산의 집행률은 null이다.
API는 미편성 잔여액 null과 명시적 0원 예산을 구분한다. 충돌은 VERSION_CONFLICT로 반환한다.
