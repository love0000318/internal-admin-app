# 보안·개인정보 Smoke Test

`docs/smoke-test.md`의 보안 점검 항목을 분리한 문서다. 운영 전 실제 계정으로 수행한다.

- [ ] MANAGER 계정으로 타인의 HR 상세 URL에 직접 접근한다.
  - 기대 결과: 접근 권한 없음 또는 자기 정보만 표시된다.
  - 실패 시 확인할 것: protected page와 server action의 권한 guard.

- [ ] MANAGER 계정으로 `/admin/reports`와 CSV export URL에 접근한다.
  - 기대 결과: 접근이 차단되고 CSV가 생성되지 않는다.
  - 실패 시 확인할 것: report page guard, export route의 OWNER 검증.

- [ ] LEAD 계정으로 담당 범위 밖 직원의 증명자료 다운로드 URL에 접근한다.
  - 기대 결과: 다운로드가 차단된다.
  - 실패 시 확인할 것: `canAccessLeaveRequestAttachments`, 하위 팀 범위 계산.

- [ ] OWNER가 CSV export를 실행한다.
  - 기대 결과: 민감 식별정보, token/tokenHash/passwordHash, fileKey, private path가 포함되지 않는다.
  - 실패 시 확인할 것: report allowlist와 `sanitizeReportRow`.

- [ ] AuditLog 상세를 확인한다.
  - 기대 결과: token, fileKey, 계좌, 주민번호 관련 값이 원문으로 표시되지 않는다.
  - 실패 시 확인할 것: `redactAuditValue`, `sanitizeAuditMetadata`.

- [ ] 첨부파일 저장 위치를 확인한다.
  - 기대 결과: 파일은 `public/` 아래가 아닌 private upload 경로에 저장된다.
  - 실패 시 확인할 것: `PRIVATE_UPLOAD_DIR`, local private storage provider.

- [ ] `pnpm preflight`를 실행한다.
  - 기대 결과: secret 길이, `CRON_SECRET`, private upload dir, Notification/JobRun/LeaveLedger table 점검이 PASS/WARN/FAIL 형식으로 출력된다.
  - 실패 시 확인할 것: `.env`, DB migration, seed.

- [ ] cron endpoint가 구현된 경우 secret 없이 호출한다.
  - 기대 결과: 401 또는 cron disabled 오류가 반환되고 민감정보는 응답에 포함되지 않는다.
  - 실패 시 확인할 것: `assertCronRequestAuthorized`, `CRON_SECRET`.
  - 현재 상태: `/api/cron/*` route는 없으며 운영은 CLI Job 중심이다.
