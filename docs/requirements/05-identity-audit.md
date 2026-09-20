# 사용자·권한·감사 요구사항

## 인증

초기에는 이메일/사용자명 기반 계정과 안전한 비밀번호 인증을 지원하되, application은
OIDC provider로 교체할 수 있는 경계를 둔다. MFA와 password policy는 운영 배포 전
필수 검토 항목이다.

## 권한

RBAC를 기본으로 하며 다음 축을 분리한다.

- 기능 권한: 읽기, 생성, 수정, 내보내기, 승인, 게시
- 업무 영역: 교적, 목양, 출석, 재정, 시스템
- 데이터 범위: 전체 교회, 담당 교구, 담당 조직, 본인
- 민감 필드: 연락처, 주소, 목양 메모, 개인 헌금

기본 역할 예시는 참고일 뿐 hard-code하지 않는다.

- SYSTEM_ADMIN
- MEMBERSHIP_MANAGER
- PASTOR
- FINANCE_ENTRY
- FINANCE_APPROVER
- AUDITOR

## Audit

감사 이벤트에는 다음을 포함한다.

- event id, church id
- actor user id와 당시 역할
- action, resource type/id
- 성공/실패와 실패 분류
- 발생 시각, request correlation id
- 변경 전후의 허용된 요약 또는 변경 필드 목록

비밀번호, token, 상담 상세, 주민 식별정보, 전체 금융 payload는 감사 로그에 넣지 않는다.
감사 로그는 일반 업무 API에서 수정·삭제할 수 없다.
