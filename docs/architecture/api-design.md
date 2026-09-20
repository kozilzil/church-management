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
