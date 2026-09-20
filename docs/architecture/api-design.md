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
