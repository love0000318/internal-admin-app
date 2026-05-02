# 2차 8단계 승인 정책 고도화 업데이트

## 구현 범위

2차 8단계에서는 휴가 유형별 승인 정책을 추가했습니다. 기존 OWNER/LEAD 승인 흐름은 유지하면서, 새로 생성되는 휴가 요청부터 휴가 유형에 연결된 승인 정책을 적용합니다.

## 추가된 정책

- 자동 승인: `ApprovalMode.NONE`
- 대표 승인: `SINGLE + OWNER`
- 팀 리드 승인: `SINGLE + TEAM_LEAD`
- 팀 리드 또는 대표 승인: `SINGLE + TEAM_LEAD_OR_OWNER`
- 지정 승인자 승인: `SINGLE + CUSTOM_USER`

`SEQUENTIAL`은 enum과 문서에만 남겨 둔 확장 후보이며, 이번 단계에서 다단계 결재 워크플로우는 구현하지 않았습니다.

## 휴가 유형 연결 방식

`LeaveTypeDefinition.approvalPolicyId`로 휴가 유형과 승인 정책을 연결합니다. 정책을 변경해도 이미 생성된 요청의 상태를 소급 변경하지 않습니다. 운영자는 정책 변경 후 생성되는 요청부터 새 정책이 적용된다고 안내해야 합니다.

## 증명자료와 승인 정책

`requireAttachmentAcceptedBeforeApproval`이 켜진 정책은 휴가 요청의 증명자료 상태가 `ACCEPTED`가 되기 전까지 승인할 수 없습니다. 이 검사는 승인 화면뿐 아니라 server action에서도 수행됩니다.

## 다음 단계 후보

- 휴가 캘린더와 공개 범위
- 관리자 리포트와 안전한 CSV export
- 알림센터와 JobRun 운영 화면
- 순차 승인 워크플로우
- 승인 정책 변경 이력 상세 화면
