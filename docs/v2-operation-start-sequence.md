# 2차 운영 시작 순서

이 문서는 대표와 운영자가 2차 HR·휴가 고도화 기능을 실제 운영에 올리기 전에 따라갈 순서를 정리한다.

## 1. 배포 전 준비

1. 운영 DB 백업 정책을 확인한다.
2. 운영 `.env`를 설정한다.
3. `SESSION_SECRET`, `ENCRYPTION_SECRET`, `INVITATION_TOKEN_SECRET`, `CRON_SECRET`은 32자 이상이고 서로 달라야 한다.
4. `PRIVATE_UPLOAD_DIR`가 `public/` 하위가 아닌지 확인한다.
5. 실제 첨부파일 운영 전 외부 private storage 또는 백업 정책을 결정한다.

## 2. DB와 기본 데이터

```bash
pnpm db:generate
pnpm db:deploy
pnpm db:seed
pnpm db:status
pnpm preflight
```

기대 결과:

- migration이 최신이다.
- ACTIVE OWNER 또는 PENDING OWNER invitation이 있다.
- 기본 LeavePolicy, LeaveTypeDefinition, AnnualLeavePolicy, ApprovalPolicy가 있다.
- Notification, JobRun, LeaveLedger table 접근이 가능하다.

## 3. OWNER 운영 시작

1. OWNER로 로그인한다.
2. `/dashboard` 접근을 확인한다.
3. 조직과 팀 구조를 확인한다.
4. 기존 직원 목록과 직원 상세를 확인한다.
5. 마지막 OWNER 비활성화/권한 강등 방지가 유지되는지 확인한다.

## 4. HR Import와 온보딩

1. 인사정보 원장 파일을 `private/imports/employee-master.xlsx` 같은 private 경로에 둔다.
2. 엑셀 원본이 `public/` 또는 git에 포함되지 않았는지 확인한다.
3. 다음 명령을 실행한다.

```bash
pnpm hr:import private/imports/employee-master.xlsx
```

4. OWNER가 사전 직원 프로필 목록과 상세를 확인한다.
5. 사전 프로필을 검수 승인한다.
6. 사전 프로필 기반 개별/일괄 초대를 생성한다.
7. 초대 링크를 안전하게 전달한다.
8. 직원 가입 후 `/profile/confirm`에서 인사정보 확인을 완료하게 한다.
9. 민감정보 변경 요청은 `/admin/profile-change-requests`에서 승인/반려한다.

## 5. 휴가 정책 확인

1. `/admin/leaves/types`에서 휴가 유형과 공개 범위, 증명자료 정책을 확인한다.
2. `/admin/leaves/grants`에서 맞춤휴가 지급 정책과 지급 내역을 확인한다.
3. `/admin/leaves/birthday-policy`에서 생일 반차 정책을 확인한다.
4. `/admin/leaves/annual-policy`에서 연차 정책을 확인한다.
5. `/admin/leaves/approval-policies`에서 승인 정책을 확인한다.
6. 병가·경조사처럼 민감할 수 있는 휴가는 캘린더 공개 범위가 과도하지 않은지 확인한다.

## 6. 운영 리허설

1. 직원 계정으로 연차와 반차를 요청한다.
2. OWNER 또는 담당 LEAD가 승인/반려한다.
3. 맞춤휴가를 지급하고 직원이 요청한다.
4. 증명자료 필수 휴가를 첨부 없이 요청해 차단되는지 확인한다.
5. 병가처럼 사후 제출 정책 휴가를 요청하고 증명자료를 나중에 제출한다.
6. 승인 정책 자동 승인/OWNER 승인/TEAM_LEAD 승인 규칙을 확인한다.
7. `/leaves/calendar`에서 공개 범위가 올바른지 확인한다.
8. `/admin/reports`에서 CSV export를 실행하고 민감정보가 없는지 확인한다.
9. `/notifications`에서 알림 읽음 처리를 확인한다.
10. `/admin/jobs`에서 JobRun 이력을 확인한다.
11. `/admin/audit-logs`에서 민감정보가 redacted 되는지 확인한다.

## 7. 운영 Job 점검

```bash
pnpm leave:ledger:validate
pnpm jobs:birthday-half-day-grants -- --dry-run
pnpm jobs:schedule-annual-promotion-notices -- --dry-run
pnpm jobs:expire-annual-leaves -- --dry-run
```

실제 소멸이나 지급 job은 dry-run 결과를 확인한 뒤 실행한다.

## 8. 최종 확인

1. `docs/smoke-test.md` 체크리스트를 따라 대표 시나리오를 수행한다.
2. `docs/security-and-privacy-guide.md`의 운영 전 체크리스트를 확인한다.
3. `docs/v2-final-acceptance-report.md`의 제한사항을 확인한다.
4. 실제 이메일, Slack, Kakao, 외부 캘린더, 외부 storage는 이번 2차 범위 밖임을 운영자에게 공유한다.
