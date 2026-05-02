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
