# Shared contracts

Web과 API가 공유하는 최소 transport 계약을 제공합니다. Domain entity와 Prisma model은
공유하지 않습니다. 현재는 health와 공통 API 오류 형식만 정의하며, 업무 API 계약은
OpenAPI에서 생성하는 방향으로 확장합니다.
