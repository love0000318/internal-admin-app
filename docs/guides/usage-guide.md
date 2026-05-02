# 사용 가이드

대표, 관리자, 직원이 서비스를 실제로 운영할 때 따르는 안내서다. route는 현재 코드 기준이다.

## 1. 서비스 개요

이 서비스는 회사 내부 조직/직원/휴가/HR 정보를 관리한다. 1차 MVP는 초대 기반 가입, 조직/팀, 휴가 요청/승인, 감사 로그를 제공하고, 2차 고도화는 HR import, 프로필, 맞춤휴가, LeaveLedger, 연차 정책, 증명자료, 캘린더, 리포트, 알림, Job 운영을 추가한다.

## 2. 역할별 권한

- OWNER: 전체 관리, HR/휴가/리포트/Job/AuditLog 접근.
- LEAD: 담당 팀과 하위 팀의 휴가 승인/검토. 정책/리포트/HR 민감정보 관리는 불가.
- MANAGER: 자기 정보와 자기 휴가 요청 중심.
- EXTERNAL_PARTNER: 내부 기능 접근 불가.

## 3. 최초 실행 방법

1. `.env`에 DB와 secret을 설정한다.
2. `pnpm install`을 실행한다.
3. `pnpm db:deploy` 또는 개발 환경의 `pnpm db:migrate`를 실행한다.
4. `pnpm db:seed`를 실행한다.
5. `pnpm preflight`를 통과시킨다.
6. `pnpm dev` 또는 배포 환경의 서버를 실행한다.

## 4. OWNER 계정 생성

seed가 만든 OWNER 초대 링크를 사용한다. 초대 token 원문은 DB에 저장되지 않고, 링크는 만료와 1회 사용 원칙을 따른다.

## 5. 로그인/로그아웃

- 로그인: `/login`
- 로그아웃: server action 기반 처리
- 세션 token 원문은 cookie에만 있고 DB에는 hash만 저장한다.

## 6. 조직/팀 생성

OWNER는 `/organization/teams` 또는 `/admin/organization`에서 팀을 관리한다. LEAD를 팀에 지정하면 담당 팀/하위 팀 휴가 승인 범위에 반영된다.

## 7. 직원 초대

OWNER는 `/organization/invitations`에서 직원을 초대한다. HR import된 `EmployeePrejoinProfile`과 이메일이 일치하면 초대와 연결될 수 있다.

## 8. 직원 가입

직원은 초대 링크로 가입한다. 초대가 prejoin profile과 연결되어 있으면 HR 프로필 관련 데이터가 자동 생성된다.

## 9. HR 엑셀 import

엑셀 원본은 `private/imports` 같은 비공개 경로에 둔다.

```bash
pnpm hr:import private/imports/employee-master.xlsx
```

주민등록번호, 계좌번호, 가족 주민등록번호 등은 원문 저장/노출 금지 대상이다.

## 10. 사전 직원 프로필 검수

현재 전용 `/admin/hr/prejoin-profiles` route는 없다. 사전 프로필 기반 연결은 import/초대 flow와 리포트 중심으로 관리한다. 전용 검수 화면 고도화는 TODO다.

## 11. 직원 온보딩

직원 가입 후 `/profile/confirm`에서 자동 생성된 정보를 확인한다. 확인 완료 시 온보딩 상태와 AuditLog/Notification 흐름에 반영된다.

## 12. 직원 자기 정보 확인/수정

- 조회: `/profile`
- 수정: `/profile/edit`
- 확인 완료: `/profile/confirm`
- 민감정보는 즉시 수정이 아니라 변경 요청으로 처리한다.
- OWNER는 `/admin/profile-change-requests`에서 승인/반려한다.

## 13. 휴가 유형 관리

OWNER는 `/admin/leaves/types`에서 휴가 유형, 공개 범위, 증명자료 정책, 승인 정책 연결을 관리한다. 시스템 기본 휴가는 핵심 속성을 보호한다.

## 14. 직원별 휴가 보유 현황

OWNER는 `/admin/leaves/balances`에서 직원별 잔여와 사용 현황을 확인한다. 직원은 `/leaves/me`에서 자기 현황을 본다.

## 15. 연차/반차 요청

직원은 `/leaves/me/requests/new`에서 요청한다. 토/일/회사 휴일, 반차 AM/PM, 중복 요청, 잔여 초과가 검증된다.

## 16. 맞춤휴가 지급

OWNER는 `/admin/leaves/grants`에서 맞춤휴가를 단일/일괄 지급하고 회수할 수 있다. 지급된 휴가는 직원의 `/leaves/me`에 표시된다.

## 17. 생일 반차 자동 지급

정책은 `/admin/leaves/birthday-policy`에서 관리한다. 운영자는 dry-run으로 확인한다.

```bash
pnpm jobs:birthday-half-day-grants -- --dry-run
```

## 18. 맞춤휴가 요청

직원은 지급된 맞춤휴가를 기준으로 요청한다. 사용 가능 기간, 잔여, 단위, 증명자료 정책을 검증한다.

## 19. 휴가 승인/반려/취소

- 승인 목록: `/leaves/approvals`
- 상세: `/leaves/approvals/[requestId]`
- OWNER는 전체 승인 가능.
- LEAD는 담당 범위만 가능하고 자기 요청은 처리할 수 없다.

## 20. 연차 정책/촉진

- 연차 정책: `/admin/leaves/annual-policy`
- 촉진 현황: `/admin/leaves/promotions`
- 직원 사용계획: `/leaves/me/use-plan`

직원 사용계획은 시작일/종료일과 사용 형태(종일, 오전 반차, 오후 반차)로 입력한다. 수량은 시스템이 자동 계산하며, 토요일/일요일/회사 휴일은 기본적으로 차감 수량에서 제외된다. 사용계획은 실제 휴가 신청이 아니므로 휴가를 사용하려면 별도로 휴가 요청을 등록해야 한다.

연차 정책과 촉진은 운영 보조 기능이며 법무/노무 최종 판단을 대체하지 않는다.

## 21. 증명자료 제출/검수

직원은 휴가 요청 시 또는 요청 상세에서 증명자료를 제출한다. OWNER/담당 LEAD는 승인 상세에서 다운로드/확인/반려/재제출 요청을 처리한다.

다운로드 route는 `/api/leave-attachments/[attachmentId]/download`이며, 서버에서 권한을 검증한다.

## 22. 휴가 캘린더

`/leaves/calendar`에서 승인된 휴가를 확인한다. 공개 범위에 따라 휴가 유형을 표시하거나 “휴가”로만 표시하거나 숨긴다. 사유와 증명자료는 캘린더에 표시하지 않는다.

## 23. 관리자 리포트

OWNER는 `/admin/reports`와 하위 route에서 휴가/HR/증명자료/온보딩 리포트를 확인하고 CSV로 내보낼 수 있다. CSV는 allowlist 기반이며 민감정보와 token/fileKey는 제외한다.

## 24. 알림센터

`/notifications`에서 자기 알림을 확인하고 읽음 처리한다. OWNER라도 타인의 개인 알림 목록을 직접 보지 않는다.

## 25. Job 관리

OWNER는 `/admin/jobs`에서 JobRun 목록과 상세를 확인한다. 위험한 Job은 UI 실행을 제한하고 CLI 운영을 권장한다.

## 26. 감사 로그

OWNER는 `/admin/audit-logs`에서 주요 변경과 보안 이벤트를 확인한다. AuditLog에는 민감정보 원문을 저장하지 않는다.

## 27. 보안 주의사항

- 엑셀 원본과 첨부파일은 public에 두지 않는다.
- 주민등록번호, 계좌번호, token, fileKey를 문서/로그/CSV에 넣지 않는다.
- 운영 전 `SESSION_SECRET`, `ENCRYPTION_SECRET`, `CRON_SECRET`을 점검한다.

## 28. 문제 발생 시 확인할 것

1. `pnpm preflight`
2. `pnpm db:status`
3. `pnpm leave:ledger:validate`
4. `/admin/audit-logs`
5. `/admin/jobs`
6. 관련 route의 권한 역할

## 반응형 UI 사용 안내

- 관리자 표 화면은 PC에서는 넓은 표로 표시되고, 태블릿/모바일에서는 표 영역 안에서 좌우 스크롤된다.
- 휴가 유형 관리, 직원별 휴가 보유 현황, 맞춤휴가 지급, 관리자 리포트 화면에서는 컬럼 폭을 강제로 줄이지 않는다.
- 모바일에서 form은 1열로 표시된다. 입력창이나 버튼이 화면 밖으로 벗어나면 table wrapper의 `overflow-x-auto`, form grid의 `grid-cols-1`, 본문 layout의 `min-w-0` 적용 여부를 확인한다.
- 모바일 메뉴는 상단에서 가로 스크롤할 수 있다. 전용 햄버거 메뉴는 후속 UI 고도화 후보로 둔다.
## 내부 단축 초대 URL

OWNER가 직원을 초대하면 긴 초대 URL과 함께 `/i/[shortToken]` 형태의 내부 단축 초대 URL이 생성된다. 운영자는 기본적으로 단축 초대 URL과 1회용 가입 인증 코드를 직원에게 함께 전달한다.

단축 초대 URL 예시는 `https://your-domain.example/i/A7K9P2Q8` 형식이다. 외부 URL 단축 서비스는 사용하지 않으며, shortToken 원문은 생성 직후 화면에만 표시되고 DB에는 hash만 저장된다.

초대가 가입 완료, 취소, 만료, 재발급되면 기존 단축 URL은 다시 사용할 수 없다. 단축 URL 또는 인증 코드를 분실한 경우 초대를 재발급해 새 링크와 새 인증 코드를 전달한다.

## 자동 로그인 유지

로그인 화면에서 `이 기기에서 자동 로그인 유지`를 선택하면 정상 로그인 성공 후 해당 세션의 만료 기간이 `REMEMBER_ME_SESSION_EXPIRES_IN_DAYS` 기준으로 길게 설정된다. 기본값은 일반 로그인 14일, 자동 로그인 유지 30일이다.

자동 로그인 유지는 비밀번호 검증을 생략하는 기능이 아니다. 전화번호와 비밀번호가 맞고 사용자 상태가 ACTIVE인 경우에만 세션이 생성된다. 세션 token 원문은 cookie에만 저장되고 DB에는 tokenHash만 저장된다.

공용 PC나 다른 사람과 함께 사용하는 기기에서는 선택하지 않는 것을 권장한다. 로그아웃하면 현재 세션이 revoke되고 cookie가 삭제되어 자동 로그인 유지도 함께 해제된다.
## 3차 모바일 사용 안내

- 모바일에서는 로그인, 초대 가입, 내 휴가, 새 휴가 요청, 알림센터를 1열 form과 카드형 목록 중심으로 사용한다.
- 휴가 관리 설정처럼 탭이 많은 화면은 모바일에서 가로로 스크롤해 이동한다.
- 관리자용 긴 표는 PC에서는 table로 보고, 모바일에서는 카드형 목록 또는 표 내부 가로 스크롤로 확인한다.
- 모든 로그인 후 화면 우측 상단의 알림 아이콘을 누르면 알림센터로 이동한다.
- 읽지 않은 알림이 있으면 빨간 badge와 진동 animation이 표시된다.
- 휴가 캘린더에서 연차는 파란색, 반차는 주황색으로 보이며, 공개 범위가 제한된 휴가는 중립색으로 표시된다.

## 외부 알림 사용

운영자가 이메일 provider를 설정하면 직원 초대 생성 시 초대 이메일 발송을 선택할 수 있습니다. 이메일에는 단축 초대 링크와 1회용 가입 인증 코드가 포함되며, 발송 실패 시에도 화면에 표시된 링크와 코드를 직접 전달할 수 있습니다.

휴가 요청, 승인, 반려, 취소, 증명자료 재제출, 연차 촉진 알림은 인앱 알림과 함께 이메일로도 보낼 수 있습니다. Slack은 Job 실패 같은 운영 경고 중심으로 사용합니다.