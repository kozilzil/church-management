# 보안과 개인정보 설계

## 보호 대상

- 교인 이름, 생년월일, 연락처, 주소, 가족 관계
- 교적 상태와 목양·상담 정보
- 개인별 헌금, 기부금영수증, 회계 자료
- 사용자 계정, session, 권한
- 대량 내보내기 파일과 backup

## 기본 통제

- 최소 권한과 deny-by-default
- TLS 사용 및 secure cookie/session 정책
- 비밀번호는 검증된 password hashing library 사용
- CSRF, XSS, injection, mass assignment 방어
- request rate limit과 인증 실패 제한
- export 파일의 만료, 접근 로그, 재다운로드 제한
- production secret의 source control 차단

## 로깅

허용되는 로그는 기술 식별자, 결과, 지연시간, correlation id 중심이다. 다음은 기록하지 않는다.

- password, token, cookie, authorization header
- 전체 주민식별번호 또는 계좌정보
- 상담 메모와 기도 제목 본문
- 개인별 헌금 상세 payload
- 대량 교인 목록

## 권한 분리

- 사용자 관리자는 자동으로 재정 상세를 볼 수 없다.
- 재정 입력자와 승인자를 분리할 수 있어야 한다.
- 감사자는 원칙적으로 읽기 전용이다.
- 목양 상세 메모는 일반 교적 담당 권한과 분리한다.

## 필수 보안 테스트

- 다른 church의 ID를 사용한 접근 차단
- 담당 범위 밖 Member 조회/수정 차단
- mass assignment로 역할·church_id 변경 차단
- 게시된 재정 데이터 변경 차단
- export와 감사 로그의 권한 검증
- 민감 필드 masking과 로그 redaction

## 운영 전 결정

- 개인정보 처리방침과 보존기간
- backup 암호화와 복구 시험
- MFA 적용 범위
- session 만료와 관리자 재인증 정책
- 침해사고 대응 및 권한 정기 검토 절차

## 구현된 인증 경계

모든 controller는 기본 인증 거부이며 `Public` 또는 `Permission` 정책을 명시한다.
인증은 `AuthenticationAdapter`, application의 권한/교회 검증은 `AccessService`를 사용한다.
오류 코드는 `UNAUTHENTICATED`, `PERMISSION_DENIED`, `CHURCH_SCOPE_VIOLATION`으로 구분한다.
`AUTH_ADAPTER=test-header`는 `NODE_ENV=test`에서만 허용하며 운영에서는 기동을 거부한다.
UserRole의 복합 외래 키는 다른 교회의 사용자와 역할 연결을 거부한다.

## 세션과 운영 관리자

기본 adapter는 서버 세션을 DB에서 검증한다. 세션이 없으면 인증 실패다. production에서는
MFA_ENCRYPTION_KEY 설정이 필수이며 관리자(identity.manage)와 재정 처리자(finance.manage/expense.approve/expense.pay/finance.close/finance.reverse)는 MFA가 확인된 세션으로만
업무에 접근한다. session.read 권한은 자기 계정 조회·보안 설정에만 사용한다.
세션/CSRF/권한 및 MFA 정책은 ADR-005에 명시되어 있다.
요청 로그는 query·body·cookie·인증 헤더를 포함하지 않고 경로와 기술 식별자 중심으로 기록한다.

재정 접근은 교적 담당 범위와 별도로 교회·업무 참여·재정 권한을 검사한다. 시스템 관리자는 설정 권한만 자동 부여받는다.
증빙 파일은 인증된 지출 상세 권한으로 다운로드하며 요청 로그/감사 이벤트에 파일명·금액·수령인·결재 의견 본문을 넣지 않는다.

헌금 검수/게시/정정, 영수증 발급/출력/취소 권한에도 운영 MFA와 최근 인증을 적용한다.
기부자 연결용 교적 검색은 별도 공개 서비스에서 이름·교적번호·ID만 제공한다.
주민등록번호는 인쇄 창의 메모리에서만 처리하고 API·DB·로그·localStorage에 전송/보관하지 않는다.
영수증 인쇄 CSS는 self 호스트 정적 파일이며 운영 CSP를 완화하지 않는다.
