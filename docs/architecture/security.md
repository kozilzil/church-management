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
