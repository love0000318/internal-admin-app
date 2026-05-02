# 2차 3단계: 지급된 맞춤휴가 요청 연결

## 목적

2차 3단계는 `LeaveGrant`로 직원에게 지급된 맞춤휴가를 실제 휴가 요청, 철회, 승인, 반려, 승인 취소 흐름에 연결하는 단계다. 기존 1차 MVP의 연차/반차/예비군/병가/경조사 요청 구조는 유지하고, 맞춤휴가 요청만 optional relation으로 확장한다.

## 구현 범위

- 직원은 `/leaves/me/requests/new`에서 사용 가능한 맞춤휴가를 선택해 요청할 수 있다.
- 생일 반차는 `BIRTHDAY_AUTO` 지급분을 사용해 반차 단위로 요청할 수 있다.
- 맞춤휴가 요청은 `LeaveRequest.requestKind = CUSTOM_GRANT`로 구분한다.
- `LeaveRequestGrantUsage`가 어떤 요청이 어떤 `LeaveGrant`를 얼마만큼 사용했는지 기록한다.
- 요청 생성 시 `LeaveGrant.pendingAmount`가 증가하고 `remainingAmount`가 감소한다.
- 직원이 PENDING 요청을 철회하면 `pendingAmount`가 감소하고 `remainingAmount`가 복구된다.
- OWNER/LEAD가 승인하면 `pendingAmount`가 감소하고 `usedAmount`가 증가한다.
- OWNER/LEAD가 반려하면 `pendingAmount`가 감소하고 `remainingAmount`가 복구된다.
- 승인된 맞춤휴가를 취소하면 `usedAmount`가 감소하고 `remainingAmount`가 복구된다.

## 검증 규칙

- 요청자는 자기 소유의 ACTIVE `LeaveGrant`만 사용할 수 있다.
- `LeaveTypeDefinition.category = CUSTOM`이고 `isEnabled = true`인 휴가 유형만 요청할 수 있다.
- 요청 날짜는 `effectiveFrom` 이상, `expiresAt` 이하 범위에 있어야 한다.
- 요청 수량은 `remainingAmount`를 초과할 수 없다.
- 이번 단계의 요청 단위는 `FULL_DAY`, `HALF_DAY`만 지원한다.
- `HOUR`, `MINUTE`는 데이터 모델에는 남겨 두지만 요청 UI에서는 다음 단계 제공으로 안내한다.
- `AttachmentPolicy.REQUIRED_BEFORE_REQUEST`는 요청 생성 시 증빙 URL이 필요하다.
- 기존 PENDING/APPROVED 휴가 요청과 날짜 또는 반차 구간이 중복될 수 없다.

## 권한

- MANAGER/LEAD/OWNER는 자기 지급분에 대해서만 맞춤휴가 요청을 만들 수 있다.
- 직원은 자기 PENDING 요청만 철회할 수 있다.
- OWNER는 전체 맞춤휴가 요청을 승인/반려/취소할 수 있다.
- LEAD는 담당 팀 및 하위 팀 직원의 맞춤휴가 요청만 승인/반려/취소할 수 있다.
- LEAD는 자기 자신의 맞춤휴가 요청을 처리할 수 없다.
- EXTERNAL_PARTNER는 내부 휴가 기능 접근 대상이 아니다.

## AuditLog와 Notification

- 맞춤휴가 요청 생성: `CUSTOM_LEAVE_REQUEST_CREATED`
- 맞춤휴가 요청 철회: `CUSTOM_LEAVE_REQUEST_WITHDRAWN`
- 맞춤휴가 승인: `CUSTOM_LEAVE_REQUEST_APPROVED`
- 맞춤휴가 반려: `CUSTOM_LEAVE_REQUEST_REJECTED`
- 맞춤휴가 승인 취소: `CUSTOM_LEAVE_REQUEST_CANCELLED`
- 승인/반려/취소 시 직원에게 인앱 알림을 생성한다.
- 요청 생성 시 OWNER와 담당 LEAD에게 인앱 승인 요청 알림을 생성한다.

## 다음 단계

- `LeaveLedger`를 도입해 지급, 대기, 사용, 복구, 만료 이력을 장부처럼 추적한다.
- 시간 단위/분 단위 요청은 `LeaveRequestSegment` 설계 이후 구현한다.
- 실제 파일 업로드, 이메일, Slack/Kakao 알림은 별도 단계에서 구현한다.
