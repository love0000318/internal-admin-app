# 운영 빠른 체크리스트

배포 전후 운영자가 빠르게 확인할 항목이다. 실제 secret, token, DB URL은 문서에 기록하지 않는다.

## 환경변수

- [ ] `DATABASE_URL`이 운영 Neon DB를 가리킨다.
- [ ] `APP_BASE_URL`이 실제 production URL과 일치한다.
- [ ] `NODE_ENV=production`이다.
- [ ] `SESSION_SECRET`, `ENCRYPTION_SECRET`, `TOKEN_SECRET`, `INVITATION_TOKEN_SECRET`, `CRON_SECRET`은 서로 다른 긴 값이다.
- [ ] `SESSION_EXPIRES_IN_DAYS`, `REMEMBER_ME_SESSION_EXPIRES_IN_DAYS`가 설정되어 있다.
- [ ] `STEP_UP_EXPIRES_IN_MINUTES`, `STEP_UP_MAX_ATTEMPTS`가 설정되어 있다.
- [ ] production에서 mock/dev 인증이 차단된다.
- [ ] 외부 이메일 알림을 쓰지 않으면 `EMAIL_PROVIDER=none`, `EXTERNAL_EMAIL_NOTIFICATIONS_ENABLED=false`다.
- [ ] Slack 알림을 쓰지 않으면 `SLACK_NOTIFICATIONS_ENABLED=false`다.

## DB와 배포

- [ ] `corepack pnpm lint`가 통과한다.
- [ ] `corepack pnpm typecheck`가 통과한다.
- [ ] `corepack pnpm test`가 통과한다.
- [ ] `corepack pnpm build`가 통과한다.
- [ ] `corepack pnpm db:validate`가 통과한다.
- [ ] `corepack pnpm db:generate`가 통과한다.
- [ ] 운영 DB에는 `corepack pnpm prisma migrate deploy`만 사용한다.
- [ ] 운영 DB에서 `prisma migrate reset`을 사용하지 않는다.
- [ ] `corepack pnpm preflight`가 통과하거나 WARN/FAIL 사유를 기록한다.

## 핵심 운영 플로우

- [ ] OWNER가 로그인할 수 있다.
- [ ] OWNER가 대시보드, 직원 목록, 조직/팀 관리에 접근할 수 있다.
- [ ] 직원 초대 링크와 1회용 가입 인증 코드가 생성된다.
- [ ] 직원이 초대 링크와 가입 인증 코드로 가입할 수 있다.
- [ ] 가입 완료 후 같은 초대 코드와 링크를 재사용할 수 없다.
- [ ] 직원이 연차/반차/맞춤휴가를 요청할 수 있다.
- [ ] OWNER 또는 담당 LEAD가 휴가를 승인/반려/취소할 수 있다.
- [ ] 직원별 휴가 보유 현황과 내 휴가 화면의 잔여가 일치한다.
- [ ] AuditLog에 고위험 작업이 기록된다.

## 권한과 보안

- [ ] MANAGER는 `/admin/*`에 접근할 수 없다.
- [ ] LEAD는 담당 범위 밖 휴가 승인과 첨부 다운로드를 할 수 없다.
- [ ] EXTERNAL_PARTNER는 내부 기능에 접근할 수 없다.
- [ ] OWNER 권한 변경, 직원 비활성화, 직원 영구 삭제, CSV export는 Step-up 재인증을 요구한다.
- [ ] 마지막 OWNER를 비활성화하거나 권한 제거할 수 없다.
- [ ] 자기 자신을 비활성화하거나 OWNER 권한에서 강등할 수 없다.
- [ ] session token, invitation token, shortToken, verification code 원문은 DB에 저장되지 않는다.
- [ ] tokenHash/codeHash/passwordHash/secret은 화면, CSV, AuditLog에 노출되지 않는다.
- [ ] 로그아웃 후 revoked session으로 protected route에 접근할 수 없다.

## 휴가와 Job

- [ ] 생일 반차 dry-run을 실행하고 결과를 확인한다.
- [ ] 생일 반차가 지급된 직원의 `/leaves/me`와 휴가 요청 화면에 생일 반차가 표시된다.
- [ ] LeaveLedger validate 결과에 blocker가 없다.
- [ ] 미승인 휴가 자동 확정 job dry-run 결과를 확인한다.
- [ ] 연차 촉진 사용계획은 시작일/종료일 기반으로 수량을 자동 계산한다.
- [ ] 사용계획 제출은 LeaveRequest와 LeaveLedger를 생성하지 않는다.

## 모바일 UX

- [ ] 360px/390px/430px에서 `/login` 화면에 가로 스크롤이 없다.
- [ ] 390px에서 `/invitations/accept` 가입 form이 1열로 표시된다.
- [ ] 390px에서 `/notifications` 알림 카드와 버튼 라벨이 정상 표시된다.
- [ ] 390px에서 `/leaves/approvals` 승인 목록이 카드형 또는 내부 스크롤로 읽힌다.
- [ ] 390px에서 `/admin/leaves/settings` 탭이 가로 스크롤되고 글자가 세로로 깨지지 않는다.
- [ ] 390px에서 `/admin/leaves/types`와 `/admin/leaves/balances` 목록이 카드형으로 표시된다.
- [ ] 390px에서 `/leaves/me/use-plan` 사용계획 form이 1열로 표시된다.
- [ ] 모든 protected page 우측 상단에 알림 아이콘이 보인다.
- [ ] 읽지 않은 알림이 있으면 빨간 badge와 진동 animation이 보인다.
- [ ] 휴가 캘린더에서 연차는 파란색, 반차는 주황색, 유형 숨김 휴가는 중립색으로 표시된다.

## 배포 후 smoke test

- [ ] 배포 URL 접속
- [ ] OWNER 로그인
- [ ] 직원 초대/가입
- [ ] 휴가 요청/승인
- [ ] 알림센터 확인
- [ ] 모바일 주요 화면 확인
- [ ] 보안 대시보드 확인
- [ ] AuditLog 확인
- [ ] 비활성 직원 삭제/익명화 테스트
- [ ] 캘린더 구독 링크 생성
- [ ] Vercel/Neon/GitHub 접근권한 변경 이력 확인

## 3차 릴리즈 후보 주의

- [ ] 근태/출퇴근 기능을 이번 릴리즈에 포함할지 결정한다.
- [ ] 근태를 포함한다면 `/attendance`, `/attendance/history`, `/admin/attendance` 구현과 별도 QA가 필요하다.

## 직원 오픈 준비

- [ ] production URL `https://interal-admin-app.vercel.app` 접속이 가능하다.
- [ ] OWNER/직원 테스트 계정으로 production smoke test를 수행했다.
- [ ] 직원에게 전달할 안내문을 준비했다.
- [ ] OWNER 운영 체크리스트를 운영 담당자가 확인했다.
- [ ] 장애 대응 runbook을 운영 담당자가 확인했다.
- [ ] 1차 오픈 대상, 대표 + 테스트 직원 1~2명을 정했다.
- [ ] 2차 오픈 대상, 핵심 운영 직원 3~5명을 정했다.
- [ ] 전체 직원 오픈 전 문의 채널과 담당자를 정했다.
- [ ] 초대 링크와 가입 인증 코드를 공개 채널에 공유하지 않도록 안내했다.

관련 문서:

- `docs/employee-open-message-final.md`
- `docs/employee-invitation-rollout-checklist.md`
- `docs/employee-rollout-tracker-template.md`
- `docs/first-week-operations-monitoring.md`
- `docs/employee-open-issue-response.md`
- `docs/daily-admin-checklist.md`
- `docs/employee-faq.md`
- `docs/employee-open-readiness-report.md`

## 휴가 Import 운영 반영 전 확인

- [ ] 실제 개인정보 엑셀 원본을 GitHub 또는 public 폴더에 저장하지 않았다.
- [ ] OWNER 계정으로 `/admin/leaves/import` preview-only 리허설을 수행했다.
- [ ] 월별 연차 사용 내역 파일의 header, 잔여 연차, 월별 사용량 파싱을 확인했다.
- [ ] 휴가 사용 상세 내역 파일의 header 자동 탐색, Excel serial date 변환, 상태 매핑을 확인했다.
- [ ] 미매칭 row가 없다.
- [ ] UNKNOWN 상태 row가 없다.
- [ ] 중복 의심 row를 운영자가 확인했다.
- [ ] 취소 row가 사용량으로 차감되지 않는지 확인했다.
- [ ] Step-up 없이 최종 반영이 실패한다.
- [ ] Step-up 후 소수 row 반영부터 수행한다.
- [ ] batch 재반영이 차단된다.
- [ ] 반영 후 직원별 휴가 현황과 batch reconciliation을 확인한다.
- [ ] AuditLog에 엑셀 원문, token, secret, 민감 row 전체가 저장되지 않는다.
- [ ] `docs/leave-import-operation-runbook.md`와 `docs/leave-import-pre-apply-checklist.md`를 운영자가 확인했다.

## ������ �ް� ��Ȳ / ���� ���ε� � ���� üũ

- [ ] OWNER ������ �ް� ��Ȳ ��ȸ ����
- [ ] LEAD ��� ���� �ް� ��Ȳ ��ȸ ����
- [ ] MANAGER Ÿ�� �ް� ��Ȳ ���� ����
- [ ] EXTERNAL_PARTNER ���� �ް� ��Ȳ ���� ����
- [ ] OWNER ���� ���ø� �ٿ�ε� ����
- [ ] ���ø��� �ֹε�Ϲ�ȣ, ���¹�ȣ, �ּ�, �޿�, ��������, token/hash/secret ����
- [ ] ���� ���ε� �̸����� ����
- [ ] �̸�Ī, UNKNOWN, ERROR row �ݿ� ����
- [ ] Step-up ���� ���� �ݿ� ����
- [ ] Step-up �� ���� �ݿ� ����
- [ ] batch ��ݿ� ����
- [ ] Step-up ���� �ݿ� ��� ����
- [ ] Step-up �� APPLIED ���� batch �ݿ� ��� ����
- [ ] �ݿ� ��Ҵ� ���� ��� ������ �ƴ϶� ������ LeaveAdjustment/LeaveLedger�� ó��
- [ ] AuditLog�� import, template, reverse ����� ���� �ΰ������� ����
- [ ] `/admin/leaves/balances`, `/admin/leaves/import`, `/admin/leaves/import/[batchId]` ����� ȭ�� Ȯ��

## 휴가 Import Step-up UI 체크

- [ ] 휴가 import 최종 반영 버튼 클릭 시 Step-up 비밀번호 재인증 모달 표시
- [ ] 올바른 비밀번호 입력 후에만 import 최종 반영 진행
- [ ] 잘못된 비밀번호 입력 시 반영/보정/취소가 진행되지 않음
- [ ] 반영 취소/역조정 버튼도 Step-up 모달을 거쳐 실행
## 휴가 Import 기준연도 체크

- [ ] 업로드 화면 기준연도가 반영 대상 연도인지 확인
- [ ] 2026년 휴가 현황 업로드 시 기준연도 2026 선택
- [ ] 직원 입사연도가 기준연도로 표시되지 않는지 확인
- [ ] 엑셀 기준연도와 업로드 화면 기준연도가 불일치하면 오류 row 확인
- [ ] 잔여 연차 정합성 검증 표시 연도와 실제 계산 연도 일치 확인
## 기존 잘못된 기준연도 Batch 처리 체크

- [ ] 기준연도 2019 등 예상과 다른 미리보기 batch는 최종 반영하지 않음
- [ ] `pnpm.cmd jobs:fix-leave-import-reference-year -- --dry-run --from=2019 --to=2026` 먼저 실행
- [ ] dry-run에서 APPLIED/REVERSED batch 제외 여부 확인
- [ ] PARSED/VALIDATED/FAILED/CANCELLED batch만 apply 보정
- [ ] 이미 APPLIED된 batch는 역조정/취소 후 올바른 기준연도로 재업로드