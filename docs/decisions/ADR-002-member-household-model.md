# ADR-002: Member와 Household 분리

- 상태: Accepted
- 날짜: 2026-09-20

## Context

가족은 주소와 연락처를 공유할 수 있지만 각 교인은 독립적인 교적 상태, 소속, 직분,
출석, 헌금 이력을 가진다. 이혼, 결혼, 분가, 합가 등으로 가족 구성도 시간에 따라 바뀐다.

## Decision

`Member`와 `Household`을 별도 aggregate로 두고 `HouseholdMembership`이 기간 기반 관계를
표현한다. Member row에 단순 `household_id`만 저장하지 않는다.

## Consequences

- 특정 날짜의 가족 구성을 재구성할 수 있다.
- 가족 이동이 명시적 업무 command가 된다.
- 단순 CRUD보다 구현 복잡도는 증가하지만 교적 이력 손실을 방지한다.
