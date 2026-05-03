# 운영 가이드

비개발 운영자가 서비스 운영 중 따라 할 수 있는 절차입니다.

## 1. 최초 대표 계정 생성

1. 운영자가 `pnpm db:deploy`로 migration을 적용합니다.
2. `pnpm db:seed`를 실행합니다.
3. 콘솔에 출력된 OWNER 초대 URL을 대표에게 전달합니다.
4. 대표는 초대 URL에서 이름, 전화번호, 비밀번호를 입력합니다.
5. 가입 완료 후 `/dashboard`로 이동하는지 확인합니다.

## 2. 대표 로그인

1. `/login`에 접속합니다.
2. 전화번호와 비밀번호를 입력합니다.
3. 대시보드에서 이름, 직급, 역할, 팀 정보를 확인합니다.

## 3. 조직/팀 생성

1. OWNER로 로그인합니다.
2. `조직 구성 및 직원 초대` 메뉴로 이동합니다.
3. `조직/팀 관리`에서 팀명을 입력해 팀을 생성합니다.
4. 필요하면 상위 팀과 팀 리드를 지정합니다.

## 4. 직원 초대

1. `직원 초대` 화면으로 이동합니다.
2. 이름, 이메일, 직급, 역할, 팀, 입사일, 생일을 입력합니다.
3. role은 LEAD 또는 MANAGER만 선택합니다.
4. 생성된 초대 링크를 복사해 직원에게 전달합니다.

## 5. 직원 가입 확인

1. 직원이 초대 링크로 가입합니다.
2. OWNER는 직원 목록에서 상태가 ACTIVE인지 확인합니다.
3. 같은 초대 링크가 재사용되지 않는지 확인합니다.

## 6. 직원 정보 수정

1. 직원 상세 화면으로 이동합니다.
2. 이름, 직급, role, 팀, 입사일, 생일, 상태를 수정합니다.
3. 자기 자신 비활성화와 마지막 OWNER 강등/비활성화는 차단됩니다.

## 7. 직원 비활성화

직원 삭제는 하지 않습니다. 상태를 `DEACTIVATED`로 변경합니다. 비활성 직원은 로그인할 수 없습니다.

## 8. 리드 지정

1. 직원을 LEAD role로 변경합니다.
2. 팀 관리 화면에서 해당 사용자를 팀 리드로 지정합니다.
3. LEAD는 담당 팀과 하위 팀 직원의 휴가만 처리할 수 있습니다.

## 9. 휴가 정책 확인

OWNER는 `휴가 관리 설정`에서 연차, 반차, 예비군, 병가, 경조사 정책을 확인합니다.

## 10. 예비군/병가/경조사 정책 수정

각 휴가 유형별로 연차 차감 여부, 증빙 필요 여부, 사용 여부를 수정할 수 있습니다. 변경 사항은 AuditLog에 기록됩니다.

## 11. 회사 휴일 등록

`회사 휴일 관리`에서 날짜와 휴일명을 입력합니다. enabled 휴일은 휴가 일수 계산에서 제외됩니다.

## 12. 직원별 휴가 조정

`직원별 휴가 보유 현황`에서 LeaveAdjustment를 추가합니다. 조정 사유는 필수이며 AuditLog에 기록됩니다.

## 13. 직원 휴가 요청 확인

직원은 `휴가 보유 현황 및 요청`에서 휴가를 요청합니다. OWNER/LEAD는 `휴가 승인 요청 사항`에서 PENDING 요청을 확인합니다.

## 14. 휴가 승인

1. 요청 상세를 확인합니다.
2. 승인 버튼을 누릅니다.
3. 승인 시점에도 잔여 휴가가 충분해야 합니다.

## 15. 휴가 반려

반려 사유를 입력해야 합니다. 반려된 요청은 pendingDays와 usedDays에 포함되지 않습니다.

## 16. 승인된 휴가 취소

승인 완료 목록에서 취소할 수 있습니다. 취소 사유는 필수이며 usedDays에서 제외됩니다.

## 17. 감사 로그 확인

OWNER는 `감사 로그` 메뉴에서 주요 변경 이력을 확인합니다. password, token, session, hash 계열 민감정보는 마스킹됩니다.

## 18. 권한 문제 발생 시 확인 사항

- 사용자 role이 올바른지 확인합니다.
- LEAD의 담당 팀 설정이 되어 있는지 확인합니다.
- 직원 상태가 ACTIVE인지 확인합니다.

## 19. 로그인 문제 발생 시 확인 사항

- 전화번호가 가입 시 번호와 같은지 확인합니다.
- 직원 상태가 ACTIVE인지 확인합니다.
- DEACTIVATED/SUSPENDED 사용자는 로그인할 수 없습니다.

## 20. 초대 링크 문제 발생 시 확인 사항

- 초대 상태가 PENDING인지 확인합니다.
- 만료 시간이 지나지 않았는지 확인합니다.
- 이미 사용된 링크는 재사용할 수 없습니다.
- raw token은 DB에 저장되지 않아 기존 링크를 재출력할 수 없습니다.

## 휴가 유형 관리

OWNER는 `휴가 관리 설정`에서 `휴가 유형 관리`로 이동해 회사가 운영하는 휴가 유형을 확인할 수 있습니다.

시스템 기본 휴가:

- 연차
- 반차
- 예비군
- 병가
- 경조사

시스템 기본 휴가는 1차 MVP의 휴가 요청/승인 기능과 연결되어 있어 코드와 구분 변경이 제한됩니다. 사용하지 않는 휴가 유형은 삭제하지 않고 비활성화합니다.

관리자 생성 휴가는 회사가 자체적으로 운영하는 맞춤휴가입니다. 2차 1단계에서는 유형과 정책을 만들 수 있고, 직원에게 직접 지급하는 기능은 다음 단계에서 구현합니다.

운영 원칙:

- 휴가 유형 code는 영문 대문자, 숫자, underscore만 사용합니다.
- 비활성화는 삭제가 아니며 기존 기록 보존을 위한 안전한 처리입니다.
- 휴가 유형 생성/수정/비활성화는 AuditLog에 기록됩니다.

## 맞춤휴가 지급

OWNER는 `휴가 관리 설정`에서 `맞춤휴가 지급`으로 이동해 직원에게 회사가 별도로 운영하는 맞춤휴가를 지급할 수 있습니다.

지급 절차:

1. `맞춤휴가 지급` 화면으로 이동합니다.
2. 지급 대상 직원을 선택합니다. 여러 명을 선택하면 일괄 지급됩니다.
3. 휴가 유형을 선택합니다. 연차 계열은 표시되지 않으며, 사용 중인 맞춤휴가만 선택할 수 있습니다.
4. 지급 수량, 단위, 사용 시작일, 만료일, 지급 사유를 입력합니다.
5. `지급하기`를 누릅니다.
6. 지급 내역과 감사 로그를 확인합니다.

연차 조정과 맞춤휴가 지급의 차이:

- 연차 추가 또는 차감은 `직원별 휴가 보유 현황`의 연차 조정 기능을 사용합니다.
- 예비군, 병가, 리프레시, 포상휴가 같은 회사 맞춤휴가는 `맞춤휴가 지급` 기능을 사용합니다.
- 이번 단계에서는 지급받은 맞춤휴가를 실제 휴가 요청에 연결하지 않습니다. 직원 화면에는 보유 현황과 “요청 기능은 다음 단계에서 제공됩니다.” 안내가 표시됩니다.

맞춤휴가 회수:

1. `맞춤휴가 지급` 목록 또는 상세 화면에서 회수할 지급 내역을 찾습니다.
2. 회수 사유를 입력합니다.
3. `회수`를 누릅니다.
4. 이미 사용되었거나 승인 대기 중인 수량이 있으면 회수할 수 없습니다.
5. 회수된 맞춤휴가는 직원의 사용 가능 맞춤휴가에서 제외됩니다.

## 생일 반차 자동 지급

OWNER는 `휴가 관리 설정`에서 `생일 반차 설정`으로 이동해 생일 반차 자동 지급 정책을 켜거나 끌 수 있습니다.

기본 정책:

- 생일 반차는 연차를 차감하지 않는 맞춤휴가입니다.
- 지급 수량은 0.5일입니다.
- 직원 생일부터 7일 뒤 날짜까지 사용할 수 있습니다.
- 생일 하루 전 지급합니다.
- 지급 예정일이 토요일, 일요일 또는 사용 중인 회사 휴일이면 직전 영업일로 앞당깁니다.
- 2월 29일 생일은 평년에는 2월 28일로 처리합니다. 3월 1일 처리 옵션은 후속 정책으로 남겨둡니다.

운영 절차:

1. 직원 상세에서 생일이 입력되어 있는지 확인합니다.
2. `생일 반차 설정`에서 자동 지급 사용 여부와 사용 가능 기간을 확인합니다.
3. 운영 서버에서 매일 1회 `pnpm jobs:birthday-half-day-grants`를 실행하도록 예약합니다.
4. 지급이 성공하면 직원에게 인앱 알림이 생성됩니다.
5. 직원은 `알림` 또는 `휴가 보유 현황 및 요청`에서 생일 반차를 확인합니다.

주의사항:

- 같은 직원에게 같은 연도 생일 반차는 한 번만 자동 지급됩니다.
- 이메일, Slack, 카카오톡 같은 외부 알림은 이번 단계에서 연동하지 않았습니다. 인앱 알림만 생성합니다.
- 생일 반차 요청 연결은 다음 단계에서 구현합니다. 현재는 지급과 보유 표시가 우선입니다.
## 인사정보 원장 import 운영 절차

1. 엑셀 원본을 `private/imports/employee-master.xlsx`에 둡니다.
2. 원본 파일이 `public/`에 없고 git에 포함되지 않는지 확인합니다.
3. `.env`에 `ENCRYPTION_SECRET`을 설정합니다.
4. `pnpm hr:import private/imports/employee-master.xlsx`를 실행합니다.
5. import 결과에서 성공/실패 건수만 확인합니다. 주민등록번호, 계좌번호 원문은 콘솔에 출력되지 않습니다.
6. OWNER가 직원 초대 화면에서 같은 이메일로 초대를 생성하면 사전 인사정보가 초대에 연결됩니다.
7. 직원이 가입하면 `/profile/confirm`에서 자동 입력된 인사정보를 확인합니다.
8. 직원이 민감정보 변경을 요청하면 OWNER가 `/admin/profile-change-requests`에서 승인 또는 반려합니다.

주의: 주민등록번호, 계좌번호, 가족 주민등록번호, 급여 정보는 기본적으로 마스킹되어야 하며 AuditLog에 원문을 남기지 않습니다.
## LeaveLedger 휴가 장부 운영

OWNER는 `/admin/leaves/history`에서 직원별 휴가 장부를 확인할 수 있습니다. 장부에는 휴가 부여, 승인 대기, 사용 확정, 철회, 반려, 승인 취소, 맞춤휴가 회수 이력이 기록됩니다.

운영 중 기존 데이터 기준으로 장부를 다시 구성해야 할 때는 배포 전 DB 백업 후 다음 명령을 실행합니다.

```bash
pnpm leave:ledger:rebuild
```

장부와 지급 수량의 정합성을 확인하려면 다음 명령을 실행합니다.

```bash
pnpm leave:ledger:validate
```

검증 오류가 나오면 직접 DB를 수정하지 말고 관련 휴가 요청, 맞춤휴가 지급, 수동 조정 이력을 먼저 확인합니다.
# 연차 정책 설정

OWNER는 `/admin/leaves/annual-policy`에서 회계연도 기준 연차 정책을 확인하고 수정할 수 있다.

- 기본 회계일은 1월 1일이다.
- 연차 사용 단위는 반차 단위다.
- 당겨쓰기는 기본적으로 허용하지 않는다.
- 월차는 매월 개근 시 1일 부여 기준으로 설정되어 있다.
- 첫 회계연도 부여 방식은 운영 전 최종 확인이 필요하다.
- 연차 촉진 설정은 일정 생성까지만 제공하며 실제 이메일/외부 알림 발송은 후순위다.

자세한 기준은 `docs/annual-leave-policy-guide.md`를 확인한다.

# 연차 촉진과 사용계획 운영

OWNER는 `/admin/leaves/promotions`에서 연차 촉진 대상자와 사용계획 제출 현황을 확인한다.

직원은 `/leaves/me/use-plan`에서 소멸 예정 연차 사용계획을 제출할 수 있다. 사용계획 제출은 실제 휴가 요청이 아니며, 휴가 사용을 위해서는 기존 휴가 요청 화면에서 별도 신청해야 한다.

운영자는 다음 명령으로 촉진 운영을 수행한다.

```bash
pnpm jobs:schedule-annual-promotion-notices -- --dry-run
pnpm jobs:schedule-annual-promotion-notices
pnpm jobs:send-annual-promotion-notices
pnpm jobs:expire-annual-leaves -- --dry-run
```

실제 소멸 실행은 대상자와 수량을 dry-run으로 확인한 뒤 진행한다.

## �ް� �����ڷ� �

- ������ �ް� ��û ���� �� �Ǵ� ��û �� ȭ�鿡�� �����ڷḦ �����մϴ�.
- ��û �� �ʼ� ��å�� ÷�� ���̴� ��û�� �� �����ϴ�.
- ��û �� ���� ��å�� ��û ���� �� ���� �ʿ� ���·� ǥ�õ˴ϴ�.
- OWNER/��� LEAD�� ���� �� ȭ�鿡�� �����ڷḦ �ٿ�ε��ϰ� Ȯ�� �Ϸ�, �ݷ�, ������ ��û�� ó���մϴ�.
- ÷�������� public ������ �ƴ� private storage�� ����Ǹ�, �ٿ�ε� route���� ������ �ٽ� Ȯ���մϴ�.
- �ڼ��� ������ docs/leave-attachment-guide.md�� Ȯ���մϴ�.


## 미승인 휴가 시작일 경과 자동 확정

- 기준: Asia/Seoul date-only 기준 `today > startDate`인 `PENDING` 휴가 요청만 자동 확정 대상입니다.
- 시작일 당일에는 자동 확정하지 않습니다.
- 증명자료 확인 후 승인 필수 정책(`requireAttachmentAcceptedBeforeApproval`)이 켜진 요청은 증명자료가 `ACCEPTED`가 아니면 제외됩니다.
- 실행 전 미리보기: `pnpm jobs:auto-confirm-past-start-leaves -- --dry-run`
- 기준일 지정: `pnpm jobs:auto-confirm-past-start-leaves -- --date=YYYY-MM-DD --dry-run`
- Cron endpoint: `POST /api/cron/auto-confirm-past-start-leaves`
- Cron 보안: `CRON_SECRET`을 `X-Cron-Secret` 또는 `Authorization: Bearer` header로 전달해야 합니다.
- LeaveLedger는 `USED` + `LEAVE_AUTO_CONFIRM`으로 기록하며 idempotencyKey는 `auto-confirm-used:{leaveRequestId}`입니다.

## Vercel 운영 배포 준비

운영 배포 절차는 `docs/deployment-vercel-guide.md`를 기준으로 진행합니다.

- 운영 DB migration: `pnpm db:deploy`
- 운영 DB에서 금지: `prisma migrate reset`, `prisma migrate dev`
- 최초 OWNER 초대가 필요한 경우에만 seed 실행: `pnpm db:seed`
- 자동 확정 cron endpoint: `/api/cron/auto-confirm-past-start-leaves`
- Vercel cron schedule: `10 15 * * *` (UTC, Asia/Seoul 00:10)
- cron 보안: `CRON_SECRET` 필수

배포 후에는 `docs/deployment-smoke-test.md`를 따라 OWNER 로그인, 직원 초대, 휴가 요청/승인, 자동 확정 dry-run, 리포트 export, 권한 차단을 확인합니다.

첨부파일 운영 주의: 현재 local private storage만 구현되어 있으므로 Vercel serverless 운영에서 증명자료 파일을 실제로 사용할 경우 Vercel Blob 또는 외부 object storage 연동이 필요합니다.

## 초대별 1회용 가입 인증 코드

- OWNER가 직원을 초대하면 초대 링크와 별도의 가입 인증 코드가 함께 생성된다.
- 가입 인증 코드는 생성 직후 관리자 화면에 한 번만 표시된다. 분실하면 초대를 재발급해야 한다.
- 직원은 초대 링크에 접속한 뒤 총괄 관리자가 전달한 가입 인증 코드를 입력해 가입한다.
- 인증 코드는 기본 8자리 숫자이며 `INVITATION_VERIFICATION_CODE_LENGTH`, `INVITATION_VERIFICATION_CODE_MAX_ATTEMPTS`, `INVITATION_VERIFICATION_CODE_EXPIRES_IN_DAYS`로 조정할 수 있다.
- DB에는 인증 코드 원문을 저장하지 않고 `verificationCodeHash`만 저장한다.
- 실패 횟수는 기본 5회이며 초과하면 해당 초대 인증 코드는 잠긴다.
- 초대 취소 또는 재발급 시 기존 인증 코드는 폐기된다.
- production에서는 `mock-verified` 본인인증을 계속 차단하며, 이메일/휴대폰 외부 인증 API는 사용하지 않는다.

## 연차 사용계획 기간 입력 방식

직원은 `/leaves/me/use-plan`에서 소멸 예정 연차 사용계획을 제출할 때 수량을 직접 입력하지 않고 시작일, 종료일, 사용 형태를 입력합니다. 종일 계획은 기간 내 토요일/일요일/회사 휴일을 제외해 자동 계산하며, 오전/오후 반차는 단일 날짜만 허용하고 0.5일로 계산합니다. 사용계획 제출은 실제 휴가 요청이 아니므로 LeaveLedger를 차감하지 않으며, 실제 휴가 사용은 별도 휴가 요청으로 진행합니다.

## External Notifications

3차 2단계에서는 기존 인앱 Notification을 유지하면서 이메일과 Slack Webhook 알림을 선택적으로 사용합니다. 외부 알림 실패는 초대 생성, 휴가 요청, 승인, 반려, 증명자료 검수, 연차 촉진, Job 실행을 실패시키지 않습니다.

운영 환경변수:

- EMAIL_PROVIDER=resend
- RESEND_API_KEY
- EMAIL_FROM
- EMAIL_REPLY_TO
- EXTERNAL_EMAIL_NOTIFICATIONS_ENABLED=true
- SLACK_NOTIFICATIONS_ENABLED
- SLACK_WEBHOOK_URL
- SLACK_NOTIFY_JOB_FAILURES
- SLACK_NOTIFY_LEAVE_REQUESTS

초대 이메일에는 초대 URL과 1회용 가입 인증 코드가 포함될 수 있습니다. 단, AuditLog, Notification metadata, JobRun summary에는 원문 token, code, codeHash, tokenHash를 저장하지 않습니다.

Slack은 기본적으로 Job 실패 같은 운영 경고에만 사용합니다. 휴가 요청 Slack 알림은 SLACK_NOTIFY_LEAVE_REQUESTS=true일 때만 보냅니다.

자세한 설정과 검수 절차는 docs/external-notifications-guide.md를 따릅니다.
## 외부 캘린더 구독 운영

- 외부 캘린더 구독은 `/leaves/calendar/settings`에서 사용자별로 생성한다.
- 피드 URL은 `/api/calendar/ical?token=...`이며 Google Calendar, Apple Calendar, Samsung Calendar에서 읽기 전용으로 구독한다.
- 승인 완료 휴가만 표시되며 휴가 사유, 증명자료, 반려 사유, HR 민감정보는 내보내지 않는다.
- 구독 URL 자체가 secret이므로 외부 공유를 금지한다.
- 링크 유출 또는 담당 범위 변경이 있으면 기존 구독을 비활성화하고 새 링크를 재발급한다.
- Samsung Calendar에서 URL 구독 메뉴가 보이지 않으면 Google Calendar 웹에 URL을 추가한 뒤 삼성 캘린더 앱에서 Google 계정 동기화를 사용한다.
## 고위험 관리자 작업 운영

- 직원 역할 변경, OWNER 권한 부여/해제, 직원 비활성화는 현재 OWNER 비밀번호 재입력이 필요하다.
- 실패한 재인증은 AuditLog에 남는다.
- 마지막 OWNER 보호 규칙으로 마지막 ACTIVE OWNER를 제거하거나 비활성화할 수 없다.
- production DB 직접 수정으로 권한을 바꾸지 않는다. 비상 상황은 별도 사고 대응 절차를 따른다.