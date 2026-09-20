# Shared contracts

Web과 API가 공유하는 최소 transport 계약을 제공합니다. Domain entity와 Prisma model은
공유하지 않습니다. 현재는 health와 공통 API 오류 형식만 정의하며, 업무 API 계약은
OpenAPI에서 생성하는 방향으로 확장합니다.

홈택스 전산매체 규격의 직렬화·검증 함수는 API와 브라우저에서 함께 사용한다.
설치 후 root postinstall에서 공통 패키지를 빌드하며 Docker에서는 전체 빌드 순서로 처리한다.
