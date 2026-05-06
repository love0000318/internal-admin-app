# 알림 운영 가이드

## 범위

알림은 Internal Ops 내부 업무 이벤트를 사용자에게 알려 주는 보조 채널이다. 업무 처리의 원장은 각 도메인 데이터와 AuditLog이며, 외부 이메일/Slack 발송 실패가 휴가 승인, 근태 처리, 초대 처리의 실패로 이어지면 안 된다.

## 알림 유형

- 휴가: 휴가 요청 생성, 승인, 반려, 취소, 자동 승인, 생일 반차, 연차 소멸 예정, 연차 촉진.
- 근태: 퇴근 누락, 결근 의심, 근태 수정 요청, 근태 월별 마감/재오픈.
- 초대/계정: 초대 생성/만료 임박/수락, 비밀번호 초기화, 비밀번호 변경 필요, 비밀번호 변경.
- 보안/운영: OWNER 권한 변경, Step-up 실패, Job 실패, AuditLog export, Report export, 휴가 import/수동 보정.

## 우선순위

- LOW: 참고 알림.
- NORMAL: 일반 업무 알림.
- HIGH: 지연 없이 확인해야 하는 운영 알림.
- CRITICAL: 보안 또는 운영 중단 가능성이 있는 긴급 알림. UI에서는 danger 계열 badge로 표시한다.

알 수 없는 priority 또는 null 값은 NORMAL로 처리한다.

## 알림센터

사용자는 `/notifications`에서 본인 알림만 볼 수 있다. 전체, 읽지 않음, 휴가, 근태, 계정, 보안, 리포트, 작업 그룹과 우선순위 필터를 사용할 수 있다. 개별 읽음과 모두 읽음은 현재 사용자 본인 알림에만 적용된다.

## 외부 알림

이메일/Slack은 환경변수로 활성화된 경우에만 발송한다.

- `EXTERNAL_EMAIL_NOTIFICATIONS_ENABLED`
- `EMAIL_PROVIDER`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `SLACK_NOTIFICATIONS_ENABLED`
- `SLACK_WEBHOOK_URL`
- `SLACK_NOTIFY_JOB_FAILURES`
- `SLACK_NOTIFY_LEAVE_REQUESTS`

비활성 상태이거나 provider 설정이 불완전하면 외부 발송은 SKIPPED로 취급한다. 업무 처리 transaction을 되돌리지 않는다.

## 민감정보 보호

Notification metadata, AuditLog metadata, 외부 이메일/Slack payload에는 다음을 포함하지 않는다.

- password, passwordHash, 임시 비밀번호
- token, tokenHash, codeHash, verificationCode 원문
- DATABASE_URL, SESSION_SECRET, APP_SECRET, API key, Slack webhook
- 주민등록번호, 계좌번호, 급여/보상 정보
- 휴가 사유 원문, 반려 사유 원문, 관리자 메모
- 증빙자료 파일명, fileKey, privatePath, 첨부파일 내용

알림에는 “시스템에서 상세 내용을 확인해 주세요.”처럼 안전한 안내만 넣는다.

## 휴가 계산 회귀 보호

알림 복구는 휴가 잔여 계산과 무관하다. 다음 로직은 알림 작업 중 수정하지 않는다.

- 근로 기간 1년 미만 직원에게만 회계연도 기준 비례 연차 적용
- 1년 이상 직원 기존 계산값 불변
- 양태식 케이스 잔여 10.5일 유지
- 장기근속자 월차/입사 1년차 연차 반복 합산 금지
- 사용 완료와 조정 분리
