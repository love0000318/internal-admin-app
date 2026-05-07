# 휴가 승인 알림 가이드

## 범위

이번 단계의 알림은 Internal Ops 내부 Notification 테이블을 기준으로 한다. 외부 푸시, WebSocket, FCM, APNs는 사용하지 않는다.

## 휴가 요청 생성

- 직원이 휴가 요청을 생성하면 `LEAVE_REQUEST_CREATED` 알림을 생성한다.
- 수신자는 실제 승인 가능한 OWNER와 담당 조직/하위 조직을 관리하는 LEAD다.
- 수신자 계산은 서버 helper에서 수행하며 클라이언트에서 승인권자를 임의 계산하지 않는다.
- 알림에는 휴가 사유 원문, 증명자료, 관리자 메모를 넣지 않는다.

## 휴가 승인

- 휴가 요청이 승인되면 요청자에게 `LEAVE_REQUEST_APPROVED` 알림을 생성한다.
- 담당 조직 구성원의 휴가가 승인되면 해당 구성원을 볼 수 있는 LEAD에게 `LEAVE_APPROVED` 알림을 생성한다.
- 승인자 본인이 같은 LEAD인 경우 중복 수신을 피한다.

## 로그인된 모든 디바이스

- 알림은 계정 단위로 저장한다.
- 각 브라우저/디바이스의 NotificationBell이 `/api/notifications/latest`를 polling한다.
- 새 알림이 감지되면 해당 디바이스에서 toast를 표시한다.
- 읽음 상태는 계정 단위 `readAt`으로 처리한다.

## 보안

Notification title, message, metadata에는 다음을 저장하지 않는다.

- 휴가 사유 원문
- 반려 사유 원문
- 증명자료 파일명/내용
- 관리자 메모
- password, token, hash, secret
- 주민등록번호, 계좌번호 등 민감 개인정보

## 휴가 계산 로직 보호

이 기능은 휴가 요청/승인 이벤트에 알림만 연결한다. 연차 잔여 계산, 1년 미만 직원 비례연차, 양태식 케이스 계산 로직은 변경하지 않는다.
