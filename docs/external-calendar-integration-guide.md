# 외부 캘린더 연동 가이드

## 목적

외부 캘린더 연동은 사내 휴가 일정을 Google Calendar, Apple Calendar, Samsung Calendar에서 읽기 전용으로 확인하기 위한 기능입니다. 이번 단계는 표준 iCal/ICS 구독 URL만 제공합니다.

이번 단계에서 구현하지 않는 항목:

- Google Calendar OAuth 양방향 동기화
- Apple Calendar 전용 API
- Samsung Calendar 전용 API
- 외부 캘린더에서 수정한 내용을 사내 시스템에 반영하는 기능

## 구독 링크 종류

- 내 휴가 캘린더: 본인의 승인 완료 휴가를 표시합니다.
- 팀 휴가 캘린더: 같은 팀 또는 권한 범위 내 직원의 승인 완료 휴가를 표시합니다.
- 담당 팀 휴가 캘린더: LEAD가 담당 팀과 하위 팀의 승인 완료 휴가를 확인합니다.
- 전체 직원 휴가 캘린더: OWNER가 전체 직원의 승인 완료 휴가를 확인합니다.

## 구독 링크 생성

1. 로그인 후 `/leaves/calendar/settings`로 이동합니다.
2. 필요한 구독 범위를 선택해 링크를 생성합니다.
3. 생성 직후 표시되는 ICS URL을 복사합니다.
4. 외부 캘린더 앱에 URL 구독으로 추가합니다.

구독 token 원문은 생성 직후 한 번만 표시됩니다. DB에는 token hash만 저장됩니다.

## Google Calendar 추가

Google Calendar 웹에서 “다른 캘린더 +” → “URL로 추가”를 선택한 뒤 구독 링크를 붙여넣습니다. 모바일 앱에서는 URL 구독 추가가 제한될 수 있으므로 웹에서 추가하는 것을 권장합니다.

## Apple Calendar 추가

iPhone/iPad에서는 캘린더 앱에서 “캘린더 추가” → “구독 캘린더 추가”를 선택한 뒤 구독 링크를 입력합니다. Mac에서는 캘린더 앱에서 파일 → 새로운 캘린더 구독을 선택한 뒤 구독 링크를 입력합니다.

## Samsung Calendar 사용

Samsung Calendar에서 외부 캘린더 구독 메뉴가 보이지 않는 경우 Google Calendar 웹에서 구독 URL을 추가한 뒤 삼성 캘린더 앱에서 Google 계정을 동기화합니다. 서비스는 Samsung 전용 API가 아니라 표준 ICS URL을 제공합니다.

## 표시되는 정보

- 직원 이름
- 공개 범위에 따라 허용된 휴가 유형 또는 “휴가”
- 휴가 날짜
- 반차 오전/오후 시간대

## 표시하지 않는 정보

- 휴가 사유
- 증명자료 상태, 파일명, 파일 내용
- 반려 사유
- 승인 코멘트
- HR 민감정보
- token 원문 또는 token hash

## 공개 범위

ICS 피드에도 내부 휴가 캘린더와 같은 공개 범위 정책을 적용합니다.

- `PUBLIC_WITH_TYPE`: 권한 범위 내에서 휴가 유형을 표시합니다.
- `PUBLIC_AS_LEAVE`: 실제 유형 대신 “휴가”로 표시합니다.
- `PRIVATE_TO_APPROVERS`: 일반 팀 캘린더에는 표시하지 않습니다. OWNER 또는 승인권자 범위에서만 표시됩니다.

## 보안 주의사항

구독 URL 자체가 secret입니다. URL을 아는 사람은 로그인 없이 해당 범위의 일정 정보를 볼 수 있습니다.

- 외부에 공유하지 않습니다.
- 유출이 의심되면 즉시 비활성화하거나 재발급합니다.
- token 원문은 DB, AuditLog, CSV export에 저장하지 않습니다.

## 운영 TODO

- Google Calendar OAuth 기반 양방향 동기화는 후속 단계에서 검토합니다.
- 외부 캘린더 앱별 구독 갱신 지연 시간은 앱 정책에 따라 다를 수 있습니다.
- 구독 접근 AuditLog는 과도하게 쌓일 수 있으므로 현재는 `lastUsedAt` 중심으로 운영합니다.
