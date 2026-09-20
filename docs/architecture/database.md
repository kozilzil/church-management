# 데이터베이스 설계 원칙

## 기본 원칙

- PostgreSQL을 단일 source of truth로 사용한다.
- 모든 업무 테이블은 `church_id`를 가진다.
- primary key는 UUID, 사용자에게 보이는 번호는 별도 column으로 둔다.
- schema 변경은 versioned migration으로만 수행한다.
- 운영에서 migration을 자동 롤백하지 않는다. 실패 시 forward-fix를 우선한다.

## 이름 규칙

- table/column: `snake_case`
- primary key: `id`
- foreign key: `<entity>_id`
- timestamp: `<event>_at`
- 업무 적용일: `effective_from`, `effective_to`
- soft delete: `archived_at`; 일반적인 `is_deleted` 남용 금지

## 무결성

- 동일 church 안의 foreign key만 연결되도록 application 검증과 필요한 composite key를 사용한다.
- 활성 기간 중복 방지가 중요한 관계는 PostgreSQL exclusion constraint 또는 transaction lock을 검토한다.
- email/phone은 표시 값과 검색용 normalized 값을 분리한다.
- JSONB는 확장 metadata에만 사용하고 핵심 검색/무결성 필드를 대체하지 않는다.

## Transaction

다음 작업은 단일 transaction으로 완료되어야 한다.

- Member 생성 + 최초 상태 이력
- Household 이동 + 기존 membership 종료 + 신규 membership 생성
- 조직 이동과 이력 변경
- OfferingBatch 게시 + 회계 command/outbox 기록
- reversal 생성 + 원거래 정정 상태 연결

## 감사와 동시성

- 중요한 aggregate는 optimistic concurrency용 version column을 검토한다.
- update 시 변경된 row 수가 예상과 다르면 conflict로 처리한다.
- 업무 audit는 application event로 남기고 DB 운영 audit와 구분한다.

## 개인정보

- 민감도 분류와 필드 암호화 필요성은 threat model 이후 확정한다.
- 검색을 위해 암호화가 어려운 필드는 접근 통제, 최소 수집, masking, 감사로 보호한다.
- production dump를 개발 환경에 복사하지 않는다.
