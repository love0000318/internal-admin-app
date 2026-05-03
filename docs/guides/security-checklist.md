# 보안 운영 체크리스트

## 매일 확인

- [ ] `/admin/security`에서 최근 CRITICAL AuditLog를 확인한다.
- [ ] `/admin/security`에서 최근 HIGH AuditLog를 확인한다.
- [ ] 반복 `LOGIN_BLOCKED` 또는 `UNAUTHORIZED_ACCESS_BLOCKED` 이벤트가 있는지 확인한다.
- [ ] 실패한 JobRun이 있는지 확인한다.

## 매주 확인

- [ ] `OWNER_ROLE_GRANTED`, `OWNER_ROLE_REVOKED` 이벤트를 확인한다.
- [ ] `REPORT_EXPORTED`, `AUDIT_LOG_EXPORTED` 이벤트를 확인한다.
- [ ] `INVITATION_REISSUED` 계열 이벤트를 확인한다.
- [ ] `LEAVE_ATTACHMENT_DOWNLOADED` 이벤트를 확인한다.
- [ ] Vercel environment variable 접근 권한자를 확인한다.
- [ ] Neon DB admin 접근 권한자를 확인한다.
- [ ] GitHub admin/main push 권한자를 확인한다.

## 직원 입사 시

- [ ] 필요한 역할만 부여한다.
- [ ] OWNER 권한은 2인 승인 절차를 거친다.
- [ ] OWNER 권한 부여는 Step-up 재인증 후 수행한다.
- [ ] 초대 링크와 가입 인증 코드를 안전한 채널로 전달한다.

## 직원 퇴사 시

- [ ] 앱 계정을 `DEACTIVATED` 처리한다.
- [ ] 활성 세션을 폐기한다.
- [ ] GitHub 접근권한을 제거한다.
- [ ] Vercel team 접근권한을 제거한다.
- [ ] Neon DB 접근권한을 제거한다.
- [ ] 공유된 secret이 있었으면 rotation한다.

## 외주 개발자 투입 시

- [ ] GitHub 권한은 필요한 repository와 기간으로 제한한다.
- [ ] production Vercel/Neon 권한은 기본적으로 부여하지 않는다.
- [ ] secret을 개인 메신저로 공유하지 않는다.
- [ ] 작업 종료 즉시 접근권한을 회수한다.

## 배포 전

- [ ] `pnpm lint`를 통과한다.
- [ ] `pnpm typecheck`를 통과한다.
- [ ] `pnpm test`를 통과한다.
- [ ] `pnpm build`를 통과한다.
- [ ] DB 변경이 있으면 운영 DB에는 `prisma migrate deploy`만 사용한다.
- [ ] 운영 DB에서 `migrate reset`을 사용하지 않는다.

## 배포 후

- [ ] OWNER 로그인 가능 여부를 확인한다.
- [ ] 직원 초대/가입 가능 여부를 확인한다.
- [ ] 휴가 요청/승인 가능 여부를 확인한다.
- [ ] `/admin/security`에서 신규 보안 이벤트를 확인한다.
- [ ] `/admin/audit-logs`에서 민감정보가 노출되지 않는지 샘플 확인한다.

## 보안 사고 시

- [ ] 영향 계정의 세션을 폐기한다.
- [ ] 관련 secret을 rotation한다.
- [ ] GitHub/Vercel/Neon 접근권한을 점검한다.
- [ ] AuditLog와 Vercel/Neon/GitHub 로그를 함께 확인한다.
- [ ] 사고 조치 내역을 별도 운영 기록으로 남긴다.
