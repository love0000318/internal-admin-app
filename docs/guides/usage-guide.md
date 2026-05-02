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
