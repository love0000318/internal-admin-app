# 모바일 반응형 UI 보정 보고서

## 목적

모바일에서 글자가 잘리거나 박스 밖으로 넘치는 문제를 줄이고, 직원과 관리자가 360px부터 430px 폭의 휴대폰 화면에서도 주요 운영 화면을 사용할 수 있도록 레이아웃과 텍스트 표시를 안정화한다.

이번 보정은 UI/CSS/component layout 작업이며 Prisma schema, migration, 인증/권한, 휴가/근태 계산 로직은 변경하지 않는다.

## 수정한 화면

- `/login`
- `/invitations/accept`
- `/notifications`
- `/leaves/approvals`
- `/leaves/calendar`
- `/leaves/me/requests/new`
- `/leaves/me/use-plan`
- `/admin/leaves/settings`
- `/admin/leaves/types`
- `/admin/leaves/balances`
- `/admin/reports`
- `/admin/security`
- `/organization/employees`

## 공통 컴포넌트/레이아웃 보정

- 카드, 버튼, badge, table wrapper에 `min-w-0`, `max-w-full`, `break-keep`, `overflow-x-auto` 계열 방어를 적용했다.
- protected layout의 상단 영역과 모바일 nav가 본문을 밀어내지 않도록 정리했다.
- NotificationBell의 접근성 label, 모바일 터치 영역, unread badge 표시를 보정했다.
- 긴 table 화면은 PC에서는 table, 모바일에서는 card 또는 내부 horizontal scroll 패턴을 사용한다.

## 모바일 반응형 규칙

- 짧은 UI 라벨, 탭, badge, table header는 `whitespace-nowrap break-keep`을 우선 적용한다.
- 긴 설명문은 `whitespace-normal break-keep leading-relaxed`로 표시한다.
- flex/grid 자식에는 필요한 곳에 `min-w-0`을 둔다.
- input/select/button은 모바일에서 `w-full min-w-0`을 기본으로 한다.
- 모바일 버튼 터치 영역은 40px 이상을 유지한다.
- body 전체 가로 스크롤을 만들지 않고, 필요한 경우 table wrapper 내부만 스크롤한다.

## 검수 체크리스트

- [ ] 360px에서 `/login` 입력칸과 자동 로그인 체크박스가 화면 밖으로 나가지 않는다.
- [ ] 390px에서 `/invitations/accept` 가입 form이 1열로 표시된다.
- [ ] 390px에서 `/notifications` 알림 카드와 버튼 라벨이 정상 한국어로 표시된다.
- [ ] 390px에서 `/admin/leaves/settings` 탭이 가로 스크롤되고 글자가 세로로 깨지지 않는다.
- [ ] 390px에서 `/admin/leaves/types`와 `/admin/leaves/balances` 목록이 카드형 또는 내부 스크롤로 표시된다.
- [ ] 390px에서 `/leaves/approvals` 승인/반려/상세 버튼이 화면 밖으로 나가지 않는다.
- [ ] 430px에서 `/leaves/me/use-plan` 사용계획 form이 1열로 표시된다.
- [ ] 768px 이상에서 table layout이 유지된다.
- [ ] 1024px/1440px에서 PC 사용성이 유지된다.

## 남은 이슈

- 실제 Vercel 배포 URL에서 360px/390px/430px screenshot 기반 검수가 아직 필요하다.
- 일부 legacy 문서나 오래된 화면에는 과거 인코딩 깨짐 문구가 남아 있을 수 있다.
- `/admin/audit-logs` 필터와 export 영역은 모바일 추가 polish 여지가 있다.
- 근태 화면은 현재 route가 없어 모바일 검수 대상에서 차단된다.

## 추후 개선 항목

- Playwright 기반 모바일 viewport screenshot smoke test 추가
- 공통 `FilterBar`, `MobileCardList`, `ResponsiveTable` 사용 범위 확대
- 관리자 table 화면 전체를 같은 모바일 카드 패턴으로 통일
- display label registry를 만들어 버튼/상태/역할 라벨을 중앙 관리
- 디자인 토큰 기반 spacing/typography scale 정리
