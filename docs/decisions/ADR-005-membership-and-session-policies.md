# ADR-005: 교적 Core와 운영 인증의 초기 정책

- 상태: Accepted (이번 구현의 명시적 기본값; 교회별 상태 전이는 설정 가능)
- 날짜: 2026-09-20

## 교적과 이력

교인번호는 운영자가 입력하는 교회별 고유 값이다. 이름은 표시 원문을 보존하고 NFKC,
공백 정리, 소문자 정규화를 별도로 저장한다. 연락처 검색은 숫자 정규화 후 수행하며
`membership.pii`가 없는 사용자는 연락처를 검색하거나 응답에서 받을 수 없다.
생년월일, 성별, 주민 식별번호는 수집하지 않는다. 주소와 연락처는 선택 입력이다.

기본 상태와 전이는 최초 교회 생성 시 예시로 제공한다. 관리자 API/화면에서 상태 코드,
표시명, 허용 전이를 교회별로 설정한다. DECEASED는 기본적으로 다음 상태가 없다.
동일 상태 반복과 마지막 상태 이력보다 이른 적용일을 거부한다. 잘못된 현재 상태는
승인된 전이를 설정한 뒤 사유를 남겨 새 상태 이력을 추가한다. 기존 이력을 덮어쓰지 않는다.

업무 적용일은 교회의 timezone(기본 Asia/Seoul) 기준 미래를 거부한다. 가족·조직·직분·개인 간
관계의 기간은 `[시작일, 종료일)`이다. 종료·이동은 기존 시작일보다 뒤의 날짜여야 한다.
당일 시작·종료로 길이 0인 이력을 만들지 않는다. 종료된 기간은 다시 수정하거나 삭제하지 않는다.

개인 간 가족 관계는 방향이 있는 별도 `MemberRelation`이다. `A → B, 부모`는 B가 A의
부모라는 뜻이다. 역관계는 추정해 자동 생성하지 않으며 별도 관계로 입력한다.
가족 소속의 `relationship` 표시와 별개의 데이터다. 관계 및 가족 소속의 기간 중복은 DB가 거부한다.
대표자는 현재 가족 소속에만 지정한다. 대표자 변경 감사 이벤트는 선택된 membership ID를
기록하므로 누가 대표자로 지정되었는지 확인할 수 있다. 날짜 기준 가족 조회는 구성원 기간을
재구성하며 과거 대표자를 현재 대표자 값으로 추정하지 않는다.

조직은 활성 하위 조직·소속·임명이 남아 있으면 폐쇄할 수 없다. 먼저 해당 항목을 종료한다.
동일 교인의 조직별 기간 중복 및 주 소속 기간 중복을 거부한다. 직분 표시명은 임명 당시 복사한다.
중복 임명 정책은 직분마다 설정하며, 중복을 금지할 때 기존 중복을 먼저 정리한다.

## 모듈과 동시성

Phase 1의 Member/Household/Organization/Position aggregate를 `RegistryModule`의 공개
application service가 조정한다. Identity, Audit, Health는 별도 module 경계다.
Registry는 Identity의 공개 AccessService와 AuditService만 사용한다. 정책 함수는 framework,
HTTP, ORM에 의존하지 않는다. API에는 명시적으로 선택한 응답 필드만 반환한다.

교회별 transaction advisory lock과 Serializable transaction을 사용하며 serialization 충돌은
최대 3회 시도한다. Member profile/status는 version 충돌도 검사한다. 이는 초기 정확성을 위한
결정이며 대량 쓰기 성능이 필요하면 aggregate별 잠금으로 좁힌다. DB FK, 기간 exclusion,
대표자 unique index, 조직 순환/직분 정책 trigger가 application 검증을 보완한다.

## 운영 인증

비밀번호는 Node.js scrypt(N=32768,r=8,p=1)로 salt를 달리하여 해시한다. 길이는 12–128자다.
32-byte 임의 세션 토큰은 HttpOnly/SameSite=Strict cookie로 전달하고 DB에는 SHA-256만 저장한다.
절대 만료 12시간, 유휴 만료 30분이다. 로그인 시도는 교회·정규화 사용자명·연결 IP 조합별
15분 동안 5회로 제한한다. gateway는 요청자가 제공한 전달 IP를 신뢰하지 않는다.
모든 변경에는 Origin과 세션에서 파생한 CSRF token을 검사한다. 역할 변경은 15분 내 재인증이
필요하며 역할 변경/계정 비활성/비밀번호 변경/MFA 등록은 기존 세션을 폐기한다.

MFA는 TOTP 6자리/30초, ±1 구간을 지원한다. 사용된 counter는 원자적으로 소비해 재사용을
거부한다. 등록 확인 시도도 사용자당 제한한다. 비밀 키는 AES-256-GCM으로 암호화하며 별도의
`MFA_ENCRYPTION_KEY`가 필요하다. production의 identity.manage 보유자는 MFA 전 업무 접근이
차단된다. 일반 사용자는 선택 등록한다. 등록 완료 후에는 다음 코드로 다시 로그인한다.
관리자 MFA 분실·계정 복구는 서버 접근권을 가진 운영자의 CLI와 감사 기록으로 처리한다.

재정 권한은 아직 제공하지 않는다. SYSTEM_ADMIN 초기 역할에도 재정 권한을 부여하지 않는다.
데이터 범위는 현재 교회 전체다. 담당 교구/부서·본인만의 세부 scope는 별도 정책 확장 대상이며
해당 제한 역할을 제공한다고 표시하지 않는다.

## 운영 환경 경계

운영 cookie는 Secure를 기본으로 하며 TLS reverse proxy를 사용한다. Docker gateway 기본 bind는
loopback이다. localhost 검증에만 COOKIE_SECURE=false를 사용한다. 운영 Swagger는 비활성이다.
실제 서비스의 도메인, TLS 인증서, 백업 외부 복제, 보존기간은 해당 서버 운영자가 설정한다.

## 자격 정보 변경 경합

User와 Session의 authVersion을 비교한다. 비밀번호·MFA·역할·복구 변경은 User 버전을 증가시킨다.
이전 비밀번호 확인 직후 동시에 생성된 세션도 다음 인증에서 거부된다. MFA 등록/확인은 조건부
갱신으로 처리하여, 등록 완료 이후 기존 미완료 세션이 MFA 키를 덮어쓰지 못한다.

운영 API DB 연결은 별도의 비소유자 role이다. migration owner와 비밀번호도 분리한다.
감사/상태 이력 UPDATE/DELETE 권한은 runtime에서 제거하며 전체 TRUNCATE 권한을 부여하지 않는다.
