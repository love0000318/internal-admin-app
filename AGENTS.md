# AGENTS.md

## 프로젝트

회사 내부 관리 앱/웹 서비스 MVP입니다. 대표가 초대 링크로 최초 OWNER 계정을 만들고, 조직/직원을 관리하며, 직원이 휴가를 요청하고 OWNER/LEAD가 승인/반려/취소할 수 있는 1차 운영 범위를 다룹니다.

## 기술 스택

- Next.js App Router
- TypeScript
- PostgreSQL
- Prisma
- Tailwind CSS
- Vitest

## MVP 포함 범위

- 로그인, 로그아웃, 세션
- 초대 링크 기반 OWNER/직원 가입
- 조직/팀/직원/초대 관리
- 휴가 정책, 회사 휴일, 휴가 조정
- 내 휴가 현황, 휴가 요청, PENDING 철회
- OWNER/LEAD 휴가 승인, 반려, 승인 취소
- OWNER 감사 로그 조회
- 운영 문서, preflight, health endpoint

## MVP 제외 범위

업무 Task, 회의 일정/회의록, 성과 관리, 프로젝트 이슈, 외부 스포츠 시설 운영자 페이지, 외부 게시물 승인/작성, 실제 이메일 발송, 실제 본인인증 업체, 파일 스토리지, 알림, 휴가 캘린더, 통계 대시보드, 급여/근태 연동은 구현하지 않습니다. 문서의 2차 개발 후보로만 둡니다.

## 역할과 권한

```ts
type Role = "OWNER" | "LEAD" | "MANAGER" | "EXTERNAL_PARTNER";
```

- `OWNER`: 전체 권한.
- `LEAD`: 담당 팀과 하위 팀 직원의 휴가 요청만 조회/승인/반려/취소. 자기 휴가는 처리 불가.
- `MANAGER`: 자기 휴가 조회/요청/철회만 가능.
- `EXTERNAL_PARTNER`: MVP 내부 기능 접근 불가.

UI 메뉴 숨김만으로 권한 처리를 끝내지 말고, 모든 protected page와 server action에서 서버 권한 검사를 유지합니다.

## Route 권한

- 공통 ACTIVE 내부 사용자: `/dashboard`, `/leaves/me`, `/leaves/me/requests/*`
- OWNER/LEAD: `/leaves/approvals`, `/leaves/approvals/*`
- OWNER only: `/organization/*`, `/admin/leaves/*`, `/admin/audit-logs`
- public: `/login`, `/invitations/accept`, `/api/health`

권한 없음 화면 문구는 `접근 권한이 없습니다.`입니다.

## 보안 원칙

- 비밀번호 원문 저장 금지.
- invitation token 원문 DB 저장 금지. DB에는 hash만 저장.
- session token 원문 DB 저장 금지. cookie에만 원문 저장.
- 인사정보 엑셀 원본은 `private/imports/` 같은 비공개 경로에만 두고 git/public에 포함하지 않습니다.
- 주민등록번호/외국인등록번호와 계좌번호는 `ENCRYPTION_SECRET` 기반으로 암호화 저장하고 화면에는 기본 마스킹합니다.
- 인사정보 변경 AuditLog에는 민감정보 원문을 저장하지 않고 section, changedFields, requestId 같은 추적 정보만 저장합니다.
- cookie는 httpOnly, sameSite lax 이상, production secure.
- 초대 링크는 만료 시간이 있고 1회 사용 후 재사용 불가.
- production에서 mock 본인인증 provider와 `mock-verified` 흐름은 차단.
- 마지막 OWNER 비활성화/권한 강등 금지.
- 직원 삭제는 hard delete가 아니라 `DEACTIVATED` soft delete.
- AuditLog 화면/metadata 출력에서 password/token/session/hash/attachment URL 계열 값은 마스킹.
- 오류 화면에 stack trace 노출 금지.

## 휴가 규칙

- 날짜 계산은 Asia/Seoul date-only 기준.
- 토요일/일요일과 enabled CompanyHoliday는 휴가 일수에서 제외.
- 반차는 0.5일이며 하루 날짜와 AM/PM 선택이 필요.
- 연차 차감 대상은 잔여 초과 요청 불가.
- PENDING/APPROVED 요청과 겹치는 중복 요청은 불가.
- 승인/반려/취소는 AuditLog에 남긴다.
- 휴가 부여/대기/사용/철회/반려/취소/회수 이력은 `LeaveLedger`에도 남긴다.
- `LeaveLedger`는 추적과 검증의 근거이며, 기존 `LeaveBalance`, `LeaveAdjustment`, `LeaveGrant`는 점진 전환 중에도 삭제하지 않는다.

## 명령

```bash
pnpm install
pnpm dev
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm db:validate
pnpm db:status
pnpm lint
pnpm typecheck
pnpm test
pnpm test:unit
pnpm test:integration
pnpm e2e
pnpm build
pnpm preflight
```

`pnpm db:status`, `pnpm db:seed`, `pnpm preflight`는 실제 PostgreSQL 연결이 필요합니다.

## 작업 시 주의사항

- 기존 구현을 불필요하게 갈아엎지 않습니다.
- 테스트를 통과시키기 위해 보안/권한 검증을 약화하지 않습니다.
- 신규 server action/API를 만들 때는 먼저 권한 guard를 설계합니다.
- Prisma schema 변경 시 seed, migration, 문서, 테스트를 함께 확인합니다.
- 운영 문서를 README와 어긋나게 두지 않습니다.
- 실제 이메일/본인인증/파일 스토리지 연동은 이번 MVP에서 붙이지 않습니다.

## 2차 휴가 고도화 작업 원칙

- 외부 서비스의 UI, 문구, 브랜드, 화면 구성을 복제하지 않습니다.
- 외부 서비스는 기능 개념과 업무 흐름만 참고하고, 우리 서비스의 권한/데이터/운영 구조에 맞게 재설계합니다.
- 1차 MVP의 휴가 요청, 승인, 잔여 계산 안정성을 최우선으로 둡니다.
- 휴가 고도화는 문서화, 테스트 계획, migration 계획을 먼저 작성한 뒤 단계별로 진행합니다.
- 대규모 schema 변경 전에는 `docs/leave-v2-*.md` 문서와 회귀 테스트 범위를 먼저 갱신합니다.
- 연차 부여, 소멸, 이월, 퇴사 정산, 연차수당 등 노무 판단이 필요한 항목은 실제 운영 전 전문가 검토가 필요합니다.
- 휴가 잔여 계산은 단일 helper 또는 service를 source of truth로 유지하고, 계산 로직을 UI에만 의존하지 않습니다.
- `LeaveLedger`를 도입할 경우 기존 계산 방식과 ledger 계산 결과를 비교하는 검증 기간을 둡니다.
- 민감한 증명자료는 접근 권한을 엄격히 제한하고, AuditLog metadata에 파일 내용이나 private URL을 저장하지 않습니다.
- 2차 설계 단계에서는 Prisma schema, migration, 기존 LeaveRequest/LeavePolicy/LeaveAdjustment 로직을 변경하지 않습니다.

## 문서/운영 인수인계 원칙

- 문서와 실제 구현은 일치해야 한다. 새 기능 문서를 작성하기 전에 route, model, script 존재 여부를 확인한다.
- 존재하지 않는 기능을 완료된 기능으로 문서화하지 않는다. `docs/guides/feature-status.md`에 PARTIAL, NOT_STARTED, TODO로 명시한다.
- 민감정보가 포함된 예시를 문서에 넣지 않는다. 주민등록번호, 계좌번호, token, tokenHash, session token, fileKey, private path, 첨부파일 내용은 금지한다.
- HR 엑셀 원본은 public이나 git에 넣지 않고 문서에도 실제 원본 내용을 복제하지 않는다.
- 외부 서비스 UI, 문구, 브랜드를 복제하지 않는다.
- 1차 MVP 안정성을 우선한다. 문서 수정 중 기능 누락이 발견되면 코드 대형 수정이 아니라 `docs/guides/next-actions.md`에 정리한다.
- 신규 기능 작업 전에는 `docs/guides/feature-status.md`와 `docs/guides/permission-matrix.md`를 확인한다.
- 보안 관련 기능은 `docs/guides/security-checklist.md`를 기준으로 점검한다.