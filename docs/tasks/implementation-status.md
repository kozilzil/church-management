# 2026-09-20 구현 및 검증 기록

## 구현 범위

- P0-004: 교회별 사용자·역할, 전역 권한, 교회 간 역할 연결 DB 차단, adapter와 전역 guard.
- P0-005: PR 품질/DB 검사와 별도 Docker 설치·복구 job.
- P0-006: Docker image, production Compose, 단일 명령 배포, migration 실패 gate, backup/restore.
- 운영 인증: 로그인/로그아웃, 세션, CSRF·Origin, 비밀번호 변경, TOTP MFA, 사용자·역할 관리, 서버 복구 CLI.
- MEM-001/002/003: 등록·최초 이력·정보 수정·상태 변경·검색·cursor 조회·민감 필드 제한.
- HOU-001/002: 가족 생성·배정·이동·대표자·빈 가족 보관·날짜별 구성원 조회.
- ORG-001/002: 조직 유형·계층·이동·폐쇄·기간 소속·주 소속.
- POS-001/002: 직분 설정·비활성·중복 정책·기간 임명·당시 표시명 보존.
- AUD-001: 중요 변경과 권한 실패 감사. 감사·상태 이력 변경/삭제 DB 차단.
- 개인 간 방향 있는 가족 관계와 기간 이력.
- React 관리 화면: 위 주요 업무, 로그인, MFA, 계정·권한 및 감사 조회.

## 검증 방법

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration`.
통합 테스트는 새 임시 PostgreSQL DB에서 전체 migration을 적용하고, 종료 후 해당 DB만 삭제한다.
기존 개발 데이터나 실제 교인 정보를 fixture로 사용하지 않는다.

`./scripts/test-deploy-gate.sh`는 migration 실패 후 새 서비스 기동/성공 메시지가 없음을 검증한다.
`./scripts/verify-deployment.sh`는 무작위 이름의 독립 Compose project에서 신규 설치,
반복 배포, 컨테이너 재생성, DB·업로드 probe 보존, backup 및 빈 환경 restore를 검증한다.
복구 대상에 table이 있으면 overwrite를 거부한다. 테스트가 만든 volume만 종료 시 정리한다.

## 범위 밖과 운영 인계

Phase 2 조직별 범위, CSV 이전, 출석, 새가족, 심방·목양은 후속 구현을 완료했다.
세부 범위와 검증은 [Phase 2](phase-2-operations.md)와 ADR-006을 따른다.
Phase 3A 지출 결재·사진/PDF 증빙·수동 지급·균형 분개·마감·역분개를 구현했다.
Phase 3B 개별 헌금·수입 분개·자체 기부금영수증 발급/인쇄/취소를 구현했다.
Phase 3C 홈택스 제출 파일 생성과 건별 발급/미발급/취소 결과 기록을 구현했다.
헌금 배치·예산·결산·홈택스 자동 전송 API, 실제 중복 병합, 교적 증명서는 후속 기능이다.
운영 서버·도메인·TLS가 제공되지 않았으므로 실제 서버 전환은 수행하지 않는다.
상태·기간·권한 기본 정책은 ADR-005를 따른다.

Phase 3D 월별 재정보고서: 기간·기금·계정별 원장 집계, 기초/기말 자산 및 수지 차액,
권한별 헌금/지출·증빙 연결과 집계 CSV를 구현했다. 계산·권한은 ADR-010,
검증 범위와 후속 예산 기능은 [Phase 3D](phase-3d-financial-reports.md)를 따른다.
