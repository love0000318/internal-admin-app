# 보안 운영 체크리스트

운영 시작 전과 정기 점검 시 확인한다.

## Secret과 환경

- [ ] `SESSION_SECRET`이 충분히 길고 예측 불가능하다.
- [ ] `ENCRYPTION_SECRET`이 충분히 길고 `SESSION_SECRET`과 다르다.
- [ ] cron endpoint를 사용할 경우 `CRON_SECRET`이 설정되어 있다.
- [ ] production에서 mock identity provider와 mock verified flow가 차단된다.
- [ ] `pnpm preflight`가 통과한다.

## 민감정보

- [ ] 주민등록번호/외국인등록번호는 평문 저장하지 않는다.
- [ ] 가족 주민등록번호는 평문 저장하지 않는다.
- [ ] 계좌번호는 평문 저장하지 않는다.
- [ ] 화면에는 기본 마스킹된 값만 표시한다.
- [ ] HR import 원본은 public/git에 넣지 않는다.

## AuditLog/Notification/JobRun

- [ ] AuditLog metadata에 민감정보 원문이 없다.
- [ ] AuditLog에 token/tokenHash/session/fileKey/private path가 없다.
- [ ] Notification metadata에 민감정보가 없다.
- [ ] JobRun resultSummary/errorSummary는 집계 중심이다.
- [ ] CSV 내용 전체를 AuditLog에 저장하지 않는다.

## CSV export

- [ ] OWNER만 export 가능하다.
- [ ] 주민등록번호/계좌번호 원문이 없다.
- [ ] token/tokenHash/passwordHash/session token이 없다.
- [ ] fileKey/private path/다운로드 URL이 없다.
- [ ] CSV injection 방어가 적용된다.
- [ ] UTF-8 BOM과 CSV escaping이 적용된다.

## 첨부파일

- [ ] 첨부파일은 public 폴더에 저장하지 않는다.
- [ ] `PRIVATE_UPLOAD_DIR`가 public 하위가 아니다.
- [ ] 다운로드 route에서 인증과 권한을 검증한다.
- [ ] OWNER/담당 LEAD/요청자 외 접근이 차단된다.
- [ ] MIME type과 파일 크기를 검증한다.
- [ ] 원본 파일 내용은 log나 AuditLog에 저장하지 않는다.

## 권한

- [ ] MANAGER는 타인 HR 정보에 접근할 수 없다.
- [ ] MANAGER는 타인 첨부파일에 접근할 수 없다.
- [ ] MANAGER는 관리자 리포트/export에 접근할 수 없다.
- [ ] LEAD는 담당 범위 밖 휴가/첨부를 처리할 수 없다.
- [ ] LEAD는 자기 휴가를 승인/반려할 수 없다.
- [ ] EXTERNAL_PARTNER는 내부 기능에 접근할 수 없다.
- [ ] 모든 server action/API가 서버 권한 검증을 수행한다.

## Token/session

- [ ] invitation token 원문은 DB에 없다.
- [ ] session token 원문은 DB에 없다.
- [ ] cookie는 httpOnly다.
- [ ] production cookie는 secure다.
- [ ] sameSite lax 이상이다.
- [ ] logout 시 session이 revoke된다.

## 정기 점검

- [ ] `pnpm leave:ledger:validate`를 실행한다.
- [ ] 주요 Job dry-run을 실행한다.
- [ ] `/admin/audit-logs`에서 민감 원문 노출 여부를 표본 점검한다.
- [ ] `/admin/jobs`에서 실패 Job을 확인한다.
