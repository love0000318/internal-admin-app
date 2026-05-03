# 3차 운영 안정화 베이스라인

## 목적

3차 1단계 모바일/UX 운영 안정화 작업의 기준선을 기록한다. 이번 단계는 신규 업무 로직이 아니라 production에서 확인된 모바일 사용성 문제를 줄이는 작업이다.

## 현재 운영 통과 흐름

- OWNER 가입
- 직원 초대
- 직원 가입
- 기본 휴가 요청
- OWNER/LEAD 휴가 승인
- 1회용 가입 인증 코드
- Neon PostgreSQL 운영 DB 연결
- Vercel 배포

## 3차 1단계 점검 결과

- protected layout에는 알림 아이콘과 모바일 가로 nav가 적용되어 있다.
- 휴가 관리 설정 탭은 가로 스크롤과 `whitespace-nowrap break-keep` 기반으로 세로 깨짐을 방지한다.
- 휴가 유형 관리 화면은 PC table과 모바일 card/list 패턴을 사용한다.
- 휴가 캘린더는 연차/반차/유형 숨김 이벤트 색상 규칙을 적용한다.
- 로그인, 초대 가입, 내 휴가, 새 휴가 요청, 알림센터는 모바일 입력 폭과 overflow 처리를 보강했다.

## 남은 확인 항목

- 실제 production 모바일 기기에서 360px/390px/430px viewport 확인
- 관리자 리포트 세부 report별 모바일 카드 패턴 확대
- 직원 상세/조직 관리의 긴 table/card UX 추가 개선
- Playwright 기반 모바일 viewport smoke test 자동화
## 3차 1단계 모바일 UX 기준

- 공통 protected layout은 TopBar, NotificationBell, 모바일 가로 nav,
  PC sidebar 구조를 사용한다.
- 모바일에서 body 전체 가로 스크롤이 생기지 않도록 main content는
  `min-w-0`와 `overflow-x-hidden`을 유지한다.
- 넓은 데이터는 PC table, 모바일 card list 패턴을 우선 적용한다.
- 짧은 한글 label, badge, tab, table header는 `whitespace-nowrap`와
  `break-keep` 기준으로 검수한다.
- 이번 기준에서 우선 정리된 화면은 로그인, 초대 가입, 대시보드,
  휴가 요청, 연차 사용계획, 휴가 캘린더, 알림센터, 휴가 관리 설정,
  휴가 유형 관리다.
- 근태/출퇴근 route는 현재 코드 구조에서 확인되지 않아 실제 route가
  추가된 뒤 동일한 디자인 시스템 적용이 필요하다.
