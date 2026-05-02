# 최종 인수 보고서

작성일: 2026-05-01

## 1. 1차 MVP 완료 요약

회사 내부 관리 앱/웹 서비스 1차 MVP는 대표와 직원이 실제 업무 흐름을 시작할 수 있는 핵심 기능을 중심으로 구현되어 있다. 초대 링크 기반 가입, 전화번호 로그인, 세션 관리, 조직/직원 관리, 휴가 정책/휴일 관리, 휴가 요청, OWNER/LEAD 승인, 감사 로그 조회까지 포함한다.

이번 최종 마감에서는 신규 대형 기능을 추가하지 않고 실행 명령, seed 출력, 운영 문서, 최종 검수 기준을 정리했다. 단, 현재 작업 환경에는 PostgreSQL 서버가 실행되어 있지 않아 DB 연결이 필요한 seed/preflight/실제 브라우저 가입 흐름은 로컬 DB 실행 후 재확인이 필요하다.

최종 판단: **1차 MVP 제한적으로 사용 가능**

제한 사유: 코드 기준 lint/typecheck/test/build/Prisma validate/generate는 통과했으나, 이 환경에서 PostgreSQL이 실행 중이 아니어서 DB 기반 실제 가입/승인 시나리오는 문서화된 절차에 따라 운영자 환경에서 한 번 더 수행해야 한다.

## 2. 구현된 기능 목록

- 초대 링크 기반 OWNER/직원 회원가입
- 전화번호 + 비밀번호 로그인
- 로그아웃 및 세션 revoke
- password/session/invitation token hash 저장
- development/test 전용 mock 본인인증 provider
- production mock provider 차단
- 역할별 좌측 메뉴
- 대시보드 진입
- 팀 생성/수정/비활성화
- 직원 초대/취소/재발급
- 직원 목록/상세/인적사항 수정
- 직원 role/team/status 변경
- 직원 DEACTIVATED soft delete
- 마지막 OWNER 보호
- 휴가 정책 설정
- 회사 휴일 관리
- 직원별 LeaveAdjustment
- 내 휴가 보유 현황 조회
- 연차/반차/예비군/병가/경조사 요청
- PENDING 휴가 요청 철회
- OWNER 전체 휴가 승인/반려/취소
- LEAD 담당 팀 및 하위 팀 휴가 승인/반려/취소
- 휴가 잔여 계산
- 휴가 중복 요청 방지
- AuditLog 기록 및 OWNER 조회
- 민감정보 마스킹
- health endpoint 및 preflight check

## 3. 제외된 기능 목록

다음 기능은 1차 MVP에서 구현하지 않고 2차 개발 후보로 남긴다.

- 업무 Task 관리
- 회의 일정 관리
- 회의록 작성/승인
- 업무 성과 관리
- 프로젝트 이슈 관리
- 외부 스포츠 시설 운영자 페이지
- 외부 연계 서비스 게시물 승인/작성
- 실제 이메일 발송 연동
- 실제 본인인증 업체 연동
- 실제 파일 스토리지 연동
- 알림 기능
- 휴가 캘린더
- 관리자 통계 대시보드
- 모바일 최적화

## 4. 역할별 권한 요약

| 역할 | 권한 |
| --- | --- |
| OWNER | 전체 관리 권한. 조직/직원, 휴가 정책, 휴가 승인/반려/취소, 감사 로그 조회 가능 |
| LEAD | 담당 팀 및 하위 팀 직원의 휴가 요청 조회/승인/반려/취소 가능. 자기 요청 처리는 불가 |
| MANAGER | 자기 휴가 현황 조회, 휴가 요청, PENDING 요청 철회 가능 |
| EXTERNAL_PARTNER | 1차 MVP 내부 기능 접근 불가 |

서버 권한 검사는 protected route와 server action에서 수행한다. 메뉴 숨김은 보조 UX이며 권한의 최종 기준이 아니다.

## 5. 주요 route 목록

Public:

- `/login`
- `/invitations/accept`
- `/api/health`

로그인 사용자:

- `/dashboard`
- `/leaves/me`
- `/leaves/me/requests`
- `/leaves/me/requests/new`
- `/leaves/me/requests/[requestId]`

OWNER/LEAD:

- `/leaves/approvals`
- `/leaves/approvals/[requestId]`
- `/leaves/approvals/approved`

OWNER only:

- `/organization`
- `/organization/teams`
- `/organization/employees`
- `/organization/employees/[userId]`
- `/organization/invitations`
- `/admin/leaves/settings`
- `/admin/leaves/holidays`
- `/admin/leaves/balances`
- `/admin/audit-logs`

## 6. 주요 데이터 모델 요약

- `User`: 사용자, role, status, 전화번호, passwordHash, 팀, 입사일, 생일
- `Team`: 계층형 조직, 상위 팀, 팀 리드, 상태
- `EmployeeProfile`: 직원 확장 정보
- `Invitation`: 초대 정보, tokenHash, 만료, 수락/취소 상태
- `Session`: session token hash, 만료, revoke
- `LeavePolicy`: 휴가 유형별 정책
- `LeaveRequest`: 휴가 요청 및 승인 상태
- `LeaveAdjustment`: 직원별 휴가 수동 조정
- `CompanyHoliday`: 회사 휴일
- `AuditLog`: 주요 변경 감사 로그

## 7. 인증/세션 보안 요약

- 비밀번호 원문은 저장하지 않고 hash만 저장한다.
- invitation token 원문은 DB에 저장하지 않고 `tokenHash`만 저장한다.
- session token 원문은 cookie에만 저장하고 DB에는 `tokenHash`만 저장한다.
- session cookie는 `httpOnly`, `sameSite=lax`, production `secure` 설정을 사용한다.
- DEACTIVATED/SUSPENDED/INVITED 사용자는 로그인할 수 없다.
- 로그인 실패 시 내부 사유를 노출하지 않고 공통 메시지를 표시한다.
- production 환경에서 mock 본인인증 provider는 실행 시 에러를 던진다.

## 8. 휴가 계산 방식 요약

- 날짜 계산은 Asia/Seoul 기준 date-only 업무일로 처리한다.
- 시작일과 종료일은 포함 계산한다.
- 토요일, 일요일, enabled `CompanyHoliday`는 제외한다.
- 반차는 0.5일이며 한 날짜와 오전/오후 선택이 필요하다.
- 연차 차감 대상 여부는 `LeavePolicy.deductsAnnualBalance`를 따른다.
- 잔여 계산식:

```text
grantedDays = 기본 부여일수 + LeaveAdjustment 합계
usedDays = APPROVED 중 연차 차감 대상 일수
pendingDays = PENDING 중 연차 차감 대상 일수
remainingDays = grantedDays - usedDays - pendingDays
```

## 9. 휴가 승인/반려/취소 방식 요약

- OWNER는 전체 휴가 요청을 처리할 수 있다.
- LEAD는 담당 팀 및 하위 팀 직원의 요청만 처리할 수 있다.
- LEAD는 자기 자신의 요청을 승인/반려/취소할 수 없다.
- 승인은 PENDING 요청만 가능하다.
- 반려는 PENDING 요청만 가능하며 반려 사유가 필수다.
- 승인 취소는 APPROVED 요청만 가능하며 취소 사유가 필수다.
- 승인 처리와 잔여 검증은 transaction 기준으로 수행한다.
- REJECTED/CANCELLED/WITHDRAWN 요청은 잔여 차감 대상에서 제외된다.

## 10. AuditLog 기록 항목

다음 주요 변경은 AuditLog에 기록된다.

- `USER_CREATED`
- `LOGIN_SUCCEEDED`
- `LOGIN_FAILED`
- `LOGOUT`
- `SESSION_REVOKED`
- `INVITATION_CREATED`
- `INVITATION_ACCEPTED`
- `INVITATION_CANCELLED`
- `INVITATION_REISSUED`
- `TEAM_CREATED`
- `TEAM_UPDATED`
- `TEAM_DEACTIVATED`
- `USER_PROFILE_UPDATED`
- `USER_ROLE_UPDATED`
- `USER_TEAM_UPDATED`
- `USER_DEACTIVATED`
- `USER_REACTIVATED`
- `LEAVE_POLICY_UPDATED`
- `COMPANY_HOLIDAY_CREATED`
- `COMPANY_HOLIDAY_UPDATED`
- `COMPANY_HOLIDAY_DEACTIVATED`
- `LEAVE_ADJUSTMENT_CREATED`
- `LEAVE_REQUEST_CREATED`
- `LEAVE_REQUEST_WITHDRAWN`
- `LEAVE_REQUEST_APPROVED`
- `LEAVE_REQUEST_REJECTED`
- `LEAVE_REQUEST_CANCELLED`

AuditLog 화면에서는 passwordHash, tokenHash, session 관련 값, 민감한 첨부 내용이 표시되지 않도록 마스킹한다.

## 11. 실행한 명령과 결과

최종 마감 과정에서 확인한 명령 결과:

| 명령 | 결과 |
| --- | --- |
| `corepack pnpm install --frozen-lockfile` | 통과, lockfile 최신 및 의존성 설치 상태 확인 |
| `corepack pnpm lint` | 통과 |
| `corepack pnpm typecheck` | 통과 |
| `corepack pnpm test` | 통과, 7 files / 49 tests |
| `corepack pnpm build` | 통과 |
| `corepack pnpm db:validate` | 통과 |
| `corepack pnpm db:generate` | 통과 |
| `corepack pnpm preflight` | 환경변수 검사는 통과, DB 연결/OWNER/LeavePolicy 확인은 PostgreSQL 미기동으로 실패 |
| `corepack pnpm db:seed` | seed command 호출은 확인, PostgreSQL 미기동으로 `ECONNREFUSED` 실패 |

## 12. 테스트/빌드 결과

- unit/integration 성격의 Vitest 테스트는 통과했다.
- production build는 통과했다.
- Prisma schema validate와 client generate는 통과했다.
- DB 연결이 필요한 preflight/seed는 로컬 PostgreSQL 실행 후 재검증해야 한다.

## 13. 실제 사용 시작 방법

대표 또는 운영자는 [docs/how-to-run-now.md](docs/how-to-run-now.md)를 따라 진행한다.

요약:

1. `pnpm install`
2. `.env.example`을 `.env`로 복사
3. `.env` 필수값 입력
4. PostgreSQL 실행
5. `pnpm db:generate`
6. `pnpm db:migrate`
7. `pnpm db:seed`
8. 콘솔의 OWNER 초대 URL 확인
9. `pnpm dev`
10. OWNER 초대 URL 접속
11. 대표 계정 생성
12. 조직/팀 생성
13. 직원 초대
14. 직원 휴가 요청
15. OWNER 휴가 승인
16. 감사 로그 확인

## 14. 수동 검수 시나리오

수동 검수는 [docs/smoke-test.md](docs/smoke-test.md)와 [docs/manual-rehearsal.md](docs/manual-rehearsal.md)를 기준으로 수행한다.

핵심 시나리오:

- OWNER 초대 URL 접속 및 대표 계정 생성
- 대표 로그인/로그아웃
- 팀 생성/수정/비활성화
- 직원 초대 및 직원 가입
- 직원 휴가 요청 및 PENDING 확인
- OWNER 승인/반려/취소
- LEAD 담당 팀 승인 가능 여부 확인
- MANAGER 관리자 route 차단 확인
- AuditLog 기록 및 민감정보 마스킹 확인

## 15. 남은 TODO

- 실제 PostgreSQL 실행 환경에서 `pnpm db:migrate`, `pnpm db:seed`, `pnpm preflight` 재실행
- OWNER 초대 URL로 실제 브라우저 가입 흐름 최종 확인
- 직원 초대/가입/휴가 요청/승인 수동 smoke test 수행
- Playwright 기반 브라우저 E2E 시나리오 확대
- 실제 이메일 발송 연동
- 실제 본인인증 업체 연동
- 파일 업로드 스토리지 연동
- rate limit 및 운영 모니터링 강화
- 휴가 정책의 법무/노무 검토

## 16. 2차 개발 후보

1. 실제 이메일 발송 및 초대 알림
2. 실제 본인인증 업체 연동
3. Playwright E2E와 테스트 DB 기반 통합 테스트 확대
4. 파일 업로드 스토리지 연동
5. 휴가 캘린더와 알림
6. 관리자 통계 대시보드
7. 업무 Task 관리
8. 회의 일정 및 회의록
9. 업무 성과 관리
10. 프로젝트 이슈 관리
11. 외부 스포츠 시설 운영자 페이지
12. 모바일 최적화

## 17. 최종 판단

**1차 MVP 제한적으로 사용 가능**

코드와 문서 기준으로 1차 MVP 기능은 준비되어 있고, lint/typecheck/test/build/Prisma validate/generate는 통과했다. 다만 현재 검수 환경에서 PostgreSQL이 실행되지 않아 DB 기반 실제 사용자 흐름은 끝까지 수행하지 못했다. 운영 전에는 반드시 문서화된 절차대로 PostgreSQL을 실행한 뒤 migration, seed, preflight, smoke test를 완료해야 한다.

## 2차 2단계 반영: 맞춤휴가 직원 지급

1차 MVP 이후 휴가 고도화 2차 2단계로 맞춤휴가 지급 기반을 추가했다.

- OWNER는 `/admin/leaves/grants`에서 맞춤휴가를 단일 또는 일괄 지급할 수 있다.
- 지급 가능한 휴가 유형은 사용 중인 맞춤휴가 유형으로 제한된다.
- 연차 추가/차감은 기존 `LeaveAdjustment`를 계속 사용한다.
- 지급된 맞춤휴가는 직원의 `/leaves/me` 화면에 보유 카드로 표시된다.
- 사용 또는 승인 대기 수량이 없는 지급 내역은 OWNER가 회수할 수 있다.
- 맞춤휴가 지급/일괄 지급/회수는 AuditLog에 기록된다.

아직 구현하지 않은 다음 단계:

- 지급받은 맞춤휴가로 실제 휴가 요청 생성
- 승인/철회/취소와 `LeaveGrant` 잔여 수량 연결
- `LeaveRequestSegment`, 시간/분 단위 요청, `LeaveLedger` 전면 도입

## 생일 반차 자동 지급 반영

휴가 고도화 단계에서 직원 생일 기준 생일 반차 자동 지급 기능을 추가했다.

- `BIRTHDAY_HALF_DAY` 시스템 맞춤휴가 유형을 seed로 생성한다.
- OWNER는 `/admin/leaves/birthday-policy`에서 자동 지급 정책을 수정할 수 있다.
- 매일 `pnpm jobs:birthday-half-day-grants`를 실행하면 지급 대상 직원에게 0.5일 생일 반차가 지급된다.
- 지급 예정일이 토요일, 일요일 또는 회사 휴일이면 직전 영업일로 앞당긴다.
- 같은 직원의 같은 연도 생일 반차는 중복 지급되지 않는다.
- 지급 성공 시 직원 인앱 알림이 생성된다.
- 이메일/외부 알림과 생일 반차 요청 연결은 후속 단계 TODO다.
