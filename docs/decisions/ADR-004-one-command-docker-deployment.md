# ADR-004: 서버 PC 단일 명령 Docker 배포

- 상태: Accepted
- 날짜: 2026-09-20

## Context

운영 서버에서 개발 도구와 수동 migration 절차를 요구하면 설치 오류와 version 불일치가
발생하기 쉽다. 교회 담당자가 제한된 명령으로 안정적으로 재기동하고 업그레이드할 수
있어야 한다.

## Decision

운영 배포를 Docker Compose로 표준화하고 `./deploy/server-up.sh`를 유일한 정상 배포
진입점으로 제공한다. script는 환경 검증, image 준비, DB health, migration, service 기동,
최종 health 확인을 수행한다.

최초 secret과 주소 설정은 별도의 일회성 단계로 인정한다. 그 이후 일상 기동과 업그레이드는
한 명령이어야 한다.

## Consequences

- 서버에는 Docker Engine과 Compose plugin만 필수로 설치한다.
- Compose와 script가 application 변경의 일부가 되며 CI에서 검증해야 한다.
- 영속 volume, backup, migration 호환성에 대한 명시적 운영 설계가 필요하다.
- 고가용성 cluster는 초기 범위가 아니지만 단일 서버 복구 절차가 중요해진다.
