# Deployment

이 디렉터리는 Phase 0에서 서버 PC용 production 배포 파일을 구현할 위치입니다.

완성 후 운영자가 실행할 명령은 다음 하나로 고정합니다.

```bash
./deploy/server-up.sh
```

예정 파일:

```text
deploy/
├── compose.production.yml
├── .env.production.example
├── server-up.sh
├── server-down.sh
├── backup.sh
└── RESTORE.md
```

현재는 설계 단계이므로 아직 `server-up.sh`를 제공하지 않습니다. 실행되지 않는 placeholder
script를 넣어 완료된 배포처럼 보이게 하지 않으며, 구현 완료 조건은
`docs/tasks/phase-0-bootstrap.md`의 P0-006을 따릅니다.
