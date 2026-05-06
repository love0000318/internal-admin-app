# 외부 캘린더 단방향 구독 운영 가이드

## 정책

외부 캘린더 연동은 구독 방식의 단방향 동기화입니다. Internal Ops에서 생성된 휴가와 이벤트만 외부 캘린더에 표시됩니다. 외부 캘린더에서 추가하거나 수정한 일정은 Internal Ops에 반영되지 않습니다.

이 기능은 Google Calendar, Apple Calendar, Samsung Calendar, Outlook Calendar, 기타 iCal 지원 캘린더에서 구독 URL을 추가하는 방식으로 사용한다. Google OAuth, Apple CalDAV, 외부 webhook, 양방향 sync는 구현하지 않는다.

## 보안 원칙

- 구독 URL은 개인 일정 정보를 볼 수 있는 비밀 링크로 취급한다.
- token 원문은 DB에 저장하지 않고 `tokenHash`만 저장한다.
- token 원문, tokenHash, 전체 구독 URL은 AuditLog, Notification, console에 저장하지 않는다.
- URL 재발급 시 기존 token은 revoke한다.
- 연동 해제 시 기존 token 접근은 차단한다.
- 외부 캘린더 앱의 feed 접근은 로그인 세션 없이 token으로만 검증한다.

## Feed 포함/제외

포함:
- 승인된 휴가
- Internal Ops에서 생성된 이벤트 모델이 있는 경우 해당 사용자에게 공개 가능한 이벤트

제외:
- 승인 대기 휴가
- 반려된 휴가
- 취소된 휴가
- 철회된 휴가
- 휴가 사유 원문
- 증명자료 정보
- 관리자 메모

## ICS 날짜 정책

- 전일 휴가는 all-day event로 생성한다.
- `DTEND`는 종료일 다음날을 사용한다.
- 예: 2026-05-01 하루 휴가 → `DTSTART;VALUE=DATE:20260501`, `DTEND;VALUE=DATE:20260502`
- 반차는 Asia/Seoul 시간 이벤트로 생성한다.
- 오전 반차: 09:00~13:00
- 오후 반차: 14:00~18:00

## 프로그램별 연결 방법

### Google Calendar

1. Google Calendar에 접속한다.
2. 다른 캘린더 추가를 선택한다.
3. URL로 추가를 선택한다.
4. Internal Ops 구독 URL을 붙여넣는다.
5. 일정 표시를 확인한다.

Google Calendar의 갱신 주기에 따라 반영까지 시간이 걸릴 수 있다.

### Apple Calendar

1. 캘린더 앱을 연다.
2. 새 캘린더 구독 추가를 선택한다.
3. Internal Ops 구독 URL을 붙여넣는다.
4. 일정 표시를 확인한다.

### Samsung Calendar

Samsung Calendar는 직접 URL 구독이 제한될 수 있다. 이 경우 Google Calendar에 구독 URL을 추가한 뒤 Samsung Calendar에서 Google 계정을 동기화한다.

### Outlook Calendar

1. Outlook에서 인터넷 캘린더 구독 추가를 선택한다.
2. Internal Ops 구독 URL을 붙여넣는다.
3. 일정 표시를 확인한다.

## 운영 확인

배포 후 다음을 확인한다.

- 구독 URL 생성
- 새 탭에서 URL 접근 시 `text/calendar` 응답
- `BEGIN:VCALENDAR`, `VERSION:2.0`, `VEVENT` 포함
- 승인된 휴가 포함
- 취소/반려/철회 휴가 제외
- URL 재발급 후 기존 URL 차단
- 연동 해제 후 URL 차단
- 모바일 설정 화면에서 URL과 버튼이 잘리지 않음
