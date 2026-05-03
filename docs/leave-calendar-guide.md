# 휴가 캘린더와 공개 범위 가이드

## 목적

휴가 캘린더는 내부 구성원이 승인된 휴가 일정을 확인하고, OWNER와 LEAD가 운영 관점에서 휴가 일정을 볼 수 있게 하는 화면입니다. 외부 캘린더, Google Calendar, Slack, 카카오톡 연동은 이번 단계에서 구현하지 않습니다.

## 접근 권한

- OWNER: 전체 직원의 휴가 일정을 볼 수 있습니다.
- LEAD: 담당 팀과 하위 팀 직원의 휴가 일정을 볼 수 있습니다.
- MANAGER: 자기 휴가와 같은 팀 구성원의 공개 가능한 승인 완료 휴가만 볼 수 있습니다.
- EXTERNAL_PARTNER: 내부 휴가 캘린더에 접근할 수 없습니다.

## 공개 범위

휴가 유형의 `visibility` 값에 따라 캘린더 표시 방식이 달라집니다.

- `PUBLIC_WITH_TYPE`: 휴가 유형까지 표시합니다. 예: `양현지 - 연차`, `양현지 - 생일 반차`
- `PUBLIC_AS_LEAVE`: 다른 구성원에게 구체적인 유형을 숨기고 `휴가`로만 표시합니다. 예: `양현지 - 휴가`
- `PRIVATE_TO_APPROVERS`: 요청자 본인, OWNER, 승인권자에게만 표시합니다. 일반 직원에게는 표시하지 않습니다.

병가, 경조사 등 민감할 수 있는 휴가는 `PUBLIC_AS_LEAVE` 또는 `PRIVATE_TO_APPROVERS` 사용을 권장합니다.

## 상태 표시

- 기본 캘린더는 `APPROVED` 휴가를 표시합니다.
- `PENDING` 휴가는 요청자 본인, OWNER, 담당 LEAD 같은 승인권자에게만 표시됩니다.
- `REJECTED`, `CANCELLED`, `WITHDRAWN`은 기본 운영 캘린더에서 숨기고, 필요할 때 상태 필터로 확인합니다.

## 반차 표시

반차 요청은 오전/오후를 함께 표시합니다.

- `AM`: 오전
- `PM`: 오후

예: `양현지 - 반차 오전`, `양현지 - 생일 반차 오후`

## 상세 접근

- 요청자 본인은 `/leaves/me/requests/{requestId}`로 이동합니다.
- OWNER와 담당 LEAD는 `/leaves/approvals/{requestId}`로 이동합니다.
- 권한 없는 일반 직원에게는 상세 링크를 제공하지 않습니다.

캘린더에는 휴가 사유, 증명자료 상태, 첨부파일 정보, 검토 코멘트를 표시하지 않습니다.

## 운영 TODO

- 실제 차감일 기준 표시 개선
- 주간 보기와 인쇄용 보기
- 외부 캘린더 연동
- iCal feed
- 캘린더에서 휴가 요청 생성
- 캘린더에서 승인/반려 처리
## 외부 캘린더 ICS 구독

- 직원은 `/leaves/calendar/settings`에서 외부 캘린더 구독 링크를 생성할 수 있다.
- 제공 URL은 `/api/calendar/ical?token=...` 형식의 표준 iCal/ICS 피드다.
- Google Calendar, Apple Calendar, Samsung Calendar에는 읽기 전용 구독 캘린더로 추가한다.
- ICS에는 승인 완료 휴가만 포함하며 PENDING/REJECTED/CANCELLED/WITHDRAWN 요청은 제외한다.
- 휴가 사유, 증명자료, 반려 사유, 승인 코멘트, HR 민감정보는 포함하지 않는다.
- 내부 휴가 캘린더와 같은 공개 범위 정책을 적용한다. `PUBLIC_AS_LEAVE`는 “휴가”로만 표시하고, `PRIVATE_TO_APPROVERS`는 권한 없는 팀 캘린더에 표시하지 않는다.
- 구독 링크 token 원문은 생성 직후 한 번만 표시하고 DB에는 hash만 저장한다. 유출이 의심되면 재발급 또는 비활성화한다.
