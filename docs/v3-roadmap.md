# 3차 로드맵

## 진행 범위

3차에서는 다음 범위만 우선 진행한다.

- 0단계: 운영 안정화 베이스라인 점검
- 1단계: 모바일/UX 운영 안정화
- 2단계: 외부 알림 연동
- 7단계: 근태/출퇴근 관리

## 1단계 완료 기준

- 모바일 로그인과 초대 가입이 화면 밖으로 밀리지 않는다.
- 직원이 모바일에서 내 휴가와 새 휴가 요청 화면을 사용할 수 있다.
- 휴가 관리 설정 탭이 모바일에서 한 글자씩 세로로 깨지지 않는다.
- 넓은 관리자 표는 PC table을 유지하고 모바일에서는 card 또는 내부 가로 스크롤로 처리한다.
- 모든 protected page 우측 상단에 알림 아이콘이 보인다.
- 휴가 캘린더에서 연차는 파란색, 반차는 주황색, 유형 숨김 휴가는 중립색으로 표시된다.

## 2단계 후보

- 실제 이메일 알림
- Slack 알림
- 카카오/SMS 알림
- 알림 실패 재시도와 운영 모니터링

## 7단계 후보

- 출퇴근 기록
- 지각/조퇴/외근/재택 상태
- 근태 승인
- 근태 리포트
- 휴가 캘린더와 근태 일정 통합

## 2단계 외부 알림 연동 결과

- 이메일 provider abstraction과 Resend/console provider를 둔다.
- 초대, 휴가 요청/승인/반려/취소, 증명자료 재제출, 연차 촉진 알림을 이메일 발송 대상으로 둔다.
- Slack Webhook은 Job 실패 같은 운영 경고 중심으로 제한한다.
- 카카오 알림톡은 provider 선정과 템플릿 승인 절차가 필요하므로 후속 TODO로 유지한다.
## 외부 캘린더 연동 상태

- 3차에서 표준 iCal/ICS 읽기 전용 구독 피드를 제공한다.
- Google Calendar, Apple Calendar, Samsung Calendar는 URL 구독 방식으로 안내한다.
- Google Calendar OAuth 양방향 동기화, Apple/Samsung 전용 API, 외부 캘린더 수정사항 역동기화는 후속 TODO로 둔다.
## 보안 후속 후보

- OWNER 권한 부여 2인 승인
- LoginAttempt 모델 기반 로그인 실패 rate-limit
- 모든 mutation route/action에 same-origin/CSRF helper 일괄 적용
- OWNER 전용 `/admin/security` 보안 대시보드
- 세션 목록 조회와 강제 로그아웃 UI
## 3차 1단계 UI/UX 후속 TODO

- 남은 관리자 세부 화면에 `ResponsiveTabs`, `ResponsiveTable`,
  `MobileCardList` 패턴을 순차 적용한다.
- 근태/출퇴근 route가 실제 구현되면 직원 모바일 첫 화면에 큰 출근/퇴근
  버튼, 오늘 상태 카드, 최근 기록 카드를 적용한다.
- 조직/직원 상세, 관리자 리포트, 감사 로그 화면의 긴 table도 모바일
  card list 패턴으로 추가 전환한다.
- Playwright 기반 390px viewport smoke test를 추가해 로그인, 초대 가입,
  휴가 요청, 휴가 관리 설정, 알림센터를 자동 검수한다.
# 3차 보안 TODO 업데이트

- OWNER 권한 부여/제거 Step-up 재인증 적용 완료.
- 직원 role 변경, 직원 비활성화 Step-up 재인증 적용 완료.
- 초대 재발급 Step-up 재인증 적용 완료.
- CSV export는 REPORT_EXPORT Step-up이 필요하도록 서버 route 보호 완료.
- 후속 후보: OWNER 권한 부여 2인 승인, 모든 정책 변경 Step-up 확대, 세션 강제 로그아웃 UI, MFA/SSO.
## AuditLog / 보안 대시보드 후속 TODO

- AuditLog hash chain 또는 외부 감사 저장소 연동 검토
- CRITICAL 보안 이벤트 OWNER 알림 자동화 고도화
- OWNER 권한 부여 2인 승인
- 세션 강제 revoke 관리 화면
- Vercel/Neon/GitHub 접근권한 정기 리뷰 절차 자동 알림
