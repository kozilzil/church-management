# 참고 프로젝트와 조사 원칙

외부 프로젝트는 기능, 용어, 데이터 모델, UX를 비교하기 위한 참고 자료다. 코드를 복사하기
전에는 해당 파일과 dependency의 라이선스를 별도로 확인해야 한다.

| 프로젝트                                              | 주된 참고 영역                  | 라이선스 주의                            |
| ----------------------------------------------------- | ------------------------------- | ---------------------------------------- |
| [ChurchCRM](https://github.com/ChurchCRM/CRM)         | Person/Family, Group, Giving    | MIT 여부를 사용할 commit 기준으로 재확인 |
| [ChurchApps](https://github.com/ChurchApps)           | API 분리, 관리 UI, 공통 package | repository별 라이선스 재확인             |
| [CiviCRM](https://github.com/civicrm/civicrm-core)    | 비영리 CRM, Contribution, Event | AGPL 영향 검토 필요                      |
| [EcclesiaCRM](https://github.com/phili67/EcclesiaCRM) | 목양·교회 운영 기능 비교        | 정확한 upstream과 보안 상태 재확인       |

국내 상용 교적 시스템은 소스가 아니라 요구사항 reference로만 사용한다. 특히 새가족,
교구/구역, 심방, 직분, 교적카드, 증명서, 기부금영수증, 예산/결산 workflow를 비교한다.

## 조사 결과를 반영하는 방법

1. 해결하려는 우리 요구사항을 먼저 명시한다.
2. 참고 프로젝트에서 관련 개념과 trade-off를 기록한다.
3. 우리 도메인에 맞는 결정을 ADR로 작성한다.
4. 라이선스 승인 없이 구현 코드를 복사하지 않는다.

> 링크와 라이선스 정보는 구현 시점에 다시 검증해야 한다.
