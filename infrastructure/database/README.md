# Database infrastructure

개발 PostgreSQL은 저장소 root의 `compose.yaml`로 실행합니다. Prisma schema, migration,
개발용 seed는 API package의 `apps/api/prisma/`에 두어 client 생성과 package dependency
경계를 명확히 유지합니다.

```bash
cp .env.example .env
pnpm db:up
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

개발 DB를 완전히 초기화해야 할 때만 `pnpm db:reset`을 사용합니다. 이 명령은 개발 volume의
모든 데이터를 삭제하므로 운영 환경에서는 사용하지 않습니다.

현재 seed는 기술 검증용 `schema_version`만 기록하며 실제 교인·헌금 자료를 포함하지 않습니다.
DB volume은 `docker compose down`으로 삭제되지 않습니다.

개발 Compose의 PostgreSQL은 `127.0.0.1`에만 bind되고 local trust 인증을 사용합니다. 이는
개발 PC 전용 설정이며 production Compose에는 사용할 수 없습니다. 운영 환경에서는 반드시
별도 secret으로 인증 정보를 주입합니다.
