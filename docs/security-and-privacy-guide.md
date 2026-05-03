# 보안·개인정보 운영 가이드

## 기본 원칙

- 권한 검증은 UI 숨김만으로 끝내지 않고 protected page, server action, route handler에서 수행한다.
- 비밀번호, session token, invitation token 원문은 DB에 저장하지 않는다. DB에는 hash 또는 passwordHash만 저장한다.
- 주민등록번호, 외국인등록번호, 가족 주민등록번호, 급여계좌번호 같은 민감 식별정보는 새로 저장할 때 암호화한다.
- 민감정보는 화면과 리포트에서 기본 마스킹한다.
- AuditLog, Notification metadata, JobRun summary에는 민감 원문을 저장하지 않는다.
- 첨부파일은 public 폴더에 저장하지 않고 인증된 다운로드 route를 통해서만 제공한다.

## 개인정보 분류

민감정보:

- 주민등록번호 또는 외국인등록번호
- 가족 주민등록번호
- 급여계좌번호
- 증명자료 파일 내용
- token, tokenHash, session token, passwordHash
- 급여·임금 계약 상세

보호 필요 정보:

- 휴대전화번호
- 개인 이메일
- 집주소
- 생년월일
- 가족 정보
- 병가·경조사 등 민감할 수 있는 휴가 정보

## 암호화 대상

다음 값은 `encryptSensitiveText`로 암호화해 저장한다.

- `EmployeeSensitiveProfile.residentIdEncrypted`
- `EmployeeSensitiveProfile.bankAccountEncrypted`
- `FamilyMember.residentIdEncrypted`
- 민감정보 변경 요청에 포함되는 주민번호·계좌번호

운영 환경에서는 `ENCRYPTION_SECRET`이 필요하다. `SESSION_SECRET`과 같은 값을 사용하면 안 된다. 기존 DB에 평문 데이터가 남아 있다면 별도 검수와 암호화 migration script가 필요하다.

## 마스킹 정책

- 주민등록번호: `970118-1******`
- 계좌번호: `110***605`
- 휴대전화번호: `010-****-4186`
- 이메일: `h***@example.com`
- 주소: `서울특별시 강남구 ****`
- 생년월일: `1997-**-**`

화면, CSV, 운영 로그에 민감정보를 표시해야 하는 경우 `src/lib/security/masking.ts`의 helper를 사용한다.

## HR 권한

- OWNER: 전체 HR 정보 조회·수정 가능. 민감정보는 기본 마스킹한다.
- LEAD: 이번 단계에서는 타 직원 HR 민감정보 조회 불가. 팀원 제한 조회를 추가하더라도 민감정보, 급여, 가족, 계약, 계좌 정보는 제외한다.
- MANAGER: 자기 정보만 조회 가능하고 허용된 항목만 직접 수정 가능하다.
- EXTERNAL_PARTNER: HR 정보 접근 불가.

직원이 직접 수정할 수 없는 항목:

- role, team, hireDate, jobGrade, contract, compensation, salary, retirementDate, disciplinary records

민감정보 변경은 `EmployeeProfileChangeRequest`로 관리하며 AuditLog에는 변경 필드명만 남긴다.

## 증명자료 파일 보안

- 저장 위치는 `private/uploads/leave-attachments` 계열 private 경로다.
- `public/` 아래에 저장하지 않는다.
- `fileKey`와 내부 저장 경로는 화면, CSV, AuditLog에 노출하지 않는다.
- 다운로드 route는 로그인 사용자와 요청자/OWNER/담당 LEAD 권한을 확인한다.
- MIME type과 파일 크기를 검증한다.
- 운영 환경에서는 외부 private storage, 백업 정책, 바이러스 검사 도입을 검토한다.

## 휴가 캘린더 공개 범위

- `PUBLIC_WITH_TYPE`: 공개 가능한 사용자에게 휴가 유형까지 표시한다.
- `PUBLIC_AS_LEAVE`: 다른 구성원에게 `휴가`로만 표시한다.
- `PRIVATE_TO_APPROVERS`: 요청자, OWNER, 승인권자에게만 표시한다.

캘린더에는 휴가 사유, 증명자료 상태, 파일명, 반려 사유, 승인 코멘트, HR 민감정보를 포함하지 않는다. 서버에서 권한 필터링된 이벤트만 반환해야 한다.

## CSV Export 보안

CSV export는 OWNER만 가능하다. export helper는 report별 allowlist 기반으로 동작한다.

CSV에 포함 금지:

- 주민등록번호/외국인등록번호/가족 주민등록번호 원문
- 계좌번호 원문
- passwordHash, token, tokenHash, session token
- fileKey, private path, 내부 storage 경로
- 증명자료 파일 내용
- AuditLog metadata 전체
- 급여·보상 상세 원문

CSV는 UTF-8 BOM을 포함하고, 쉼표·따옴표·줄바꿈 escape와 CSV injection 방어를 적용한다. export 실행은 `REPORT_EXPORTED` AuditLog로 남긴다.

## AuditLog 원칙

AuditLog metadata는 다음 중심으로 남긴다.

- `targetUserId`
- `section`
- `changedFields`
- `requestId`
- `attachmentId`
- `reportType`
- `rowCount`
- `jobRunId`
- `statusBefore` / `statusAfter`

민감한 before/after 값은 저장하지 않는다. 화면 표시와 신규 helper 경로에서는 `sanitizeAuditMetadata`와 `redactAuditValue`를 사용한다.

## Notification 원칙

Notification은 짧은 title, message, linkUrl 중심으로 생성한다. metadata에는 주민번호, 계좌번호, token, fileKey, private path, 급여 정보, 증명자료 내용 등을 넣지 않는다. 공통 생성 helper는 metadata를 sanitize한다.

## JobRun 원칙

JobRun resultSummary와 errorSummary는 집계 중심으로 기록한다.

예:

```json
{
  "checkedCount": 20,
  "createdCount": 5,
  "skippedCount": 2,
  "failedCount": 1
}
```

HR import row 전체, 주소 전체, 가족 정보 원문, fileKey/private path, token/tokenHash, 급여 상세는 기록하지 않는다.

## Token·Session 보안

- invitation token 원문은 생성 직후 또는 재발급 직후에만 표시한다.
- DB에는 `tokenHash`만 저장한다.
- 초대는 만료 시간이 있고, 사용·취소된 초대는 재사용할 수 없다.
- session token 원문은 cookie에만 있고 DB에는 hash만 저장한다.
- cookie는 httpOnly, sameSite lax 이상, production secure로 설정한다.
- logout 시 session을 revoke한다.

## Cron Endpoint 보안

- `CRON_SECRET`이 설정되어 있어야 한다.
- production에서 `CRON_SECRET`이 없으면 cron endpoint 실행을 차단한다.
- `X-Cron-Secret` 또는 `Authorization: Bearer` header로 검증한다.
- query string token 방식은 사용하지 않는 것을 권장한다.
- 응답에는 민감정보와 stack trace를 포함하지 않는다.

## Preflight 점검

`pnpm preflight`는 다음을 확인한다.

- 필수 env와 secret 길이
- `SESSION_SECRET`과 `ENCRYPTION_SECRET` 분리
- production mock provider 차단
- `CRON_SECRET` 설정 상태
- 기본 OWNER 또는 OWNER invitation
- 기본 휴가/연차/승인 정책 seed
- Notification, JobRun, LeaveLedger table 접근
- private upload dir가 public 하위가 아닌지
- local attachment storage 운영 주의사항

## 운영 전 체크리스트

- [ ] production secret이 모두 32자 이상이고 서로 다른 값인지 확인
- [ ] `CRON_SECRET`을 배포 환경에 설정
- [ ] `PRIVATE_UPLOAD_DIR`가 public 경로가 아닌지 확인
- [ ] CSV export 샘플에서 민감정보가 없는지 확인
- [ ] 첨부파일 다운로드를 타 계정으로 시도해 차단되는지 확인
- [ ] AuditLog 상세에서 token/fileKey/계좌/주민번호가 `[민감정보 숨김]`으로 표시되는지 확인
- [ ] JobRun 실패 summary에 민감정보가 없는지 확인

## 3차 보안 고도화 후보

- MFA
- SSO
- IP allowlist
- 관리자 접근 로그 고도화
- 외부 private file storage
- 바이러스 검사
- DLP
- 보안 이벤트 알림
- 정기 권한 리뷰
- 퇴사자 접근 자동 차단
- 암호화 key rotation

## 초대 가입 인증 코드 보안

- 초대 가입 인증 코드는 원문을 DB, AuditLog, Notification metadata, CSV export에 저장하지 않는다.
- 저장 값은 `verificationCodeHash`이며 화면에는 생성 직후 원문 코드만 1회 표시한다.
- 실패 메시지는 `가입 인증 코드가 올바르지 않거나 만료되었습니다.`처럼 단일 문구로 유지해 공격자가 상태를 추측하지 못하게 한다.
- 초대 token 원문은 기존처럼 DB에 저장하지 않고 `tokenHash`만 저장한다.
- production에서 `mock-verified` 인증은 허용하지 않는다.
## 내부 단축 초대 URL 보안 원칙

- 외부 URL 단축 서비스에 초대 token이나 shortToken을 전달하지 않는다.
- shortToken 원문은 생성 직후 OWNER 화면 또는 seed/reissue script 출력에만 표시한다.
- DB에는 `shortTokenHash`만 저장하고 shortToken 원문은 저장하지 않는다.
- AuditLog, Notification metadata, CSV export에는 shortToken 원문과 shortTokenHash를 포함하지 않는다.
- 초대가 만료, 취소, 재발급, 가입 완료되면 해당 단축 URL은 다시 사용할 수 없다.
- `/i/[shortToken]` 검증 실패 시 상세한 실패 사유를 사용자에게 노출하지 않는다.
- 가입에는 단축 초대 URL만으로 충분하지 않으며, 별도의 1회용 가입 인증 코드가 함께 필요하다.

## 자동 로그인 유지 보안 원칙

- 자동 로그인 유지는 정상 로그인 성공 후 세션 만료 기간을 길게 설정하는 기능이다.
- 비밀번호, session token 원문, tokenHash를 화면, 문서, AuditLog, Notification metadata, CSV에 노출하지 않는다.
- session token 원문은 httpOnly cookie에만 저장하고 DB에는 tokenHash만 저장한다.
- cookie는 `httpOnly`, `sameSite=lax`, `path=/`를 사용하며 production에서는 `secure=true`다.
- 기본 만료 기간은 `SESSION_EXPIRES_IN_DAYS=14`, 자동 로그인 유지는 `REMEMBER_ME_SESSION_EXPIRES_IN_DAYS=30`이다.
- 공용 PC에서는 자동 로그인 유지를 사용하지 않도록 로그인 화면에 안내한다.
- 로그아웃 시 현재 세션을 revoke하고 cookie를 삭제해 자동 로그인 유지도 함께 해제한다.
- production에서 demo login, mock login, admin quick login은 허용하지 않는다.

## External Notification Security

외부 알림에는 최소 운영 정보만 포함합니다. 이메일/Slack에는 주민등록번호, 계좌번호, 증명자료 내용, fileKey, private path, passwordHash, token, tokenHash, session token, API key, Slack webhook URL을 포함하지 않습니다.

휴가 반려 사유 원문과 증명자료 파일명/내용은 기본 이메일에 넣지 않고 시스템 링크로 확인하게 합니다. 초대 이메일은 직원 가입을 위해 초대 URL과 1회용 가입 인증 코드를 포함할 수 있으나, 이 원문 값은 AuditLog, Notification metadata, JobRun, CSV export에 저장하지 않습니다.

production에서 EMAIL_PROVIDER=console은 허용하지 않습니다. RESEND_API_KEY와 SLACK_WEBHOOK_URL은 Vercel 환경변수로만 관리합니다.
## 외부 캘린더 구독 보안

- 캘린더 구독 URL은 로그인 없이 외부 캘린더 앱이 읽는 secret URL이다.
- calendar subscription token 원문은 DB, AuditLog, CSV export에 저장하지 않고 hash만 저장한다.
- ICS에는 승인 완료 휴가의 최소 정보만 포함한다.
- 휴가 사유, 증명자료, 반려 사유, 승인 코멘트, HR 민감정보는 포함하지 않는다.
- 공개 범위가 `PUBLIC_AS_LEAVE`인 휴가는 실제 유형 대신 “휴가”로 표시한다.
- `PRIVATE_TO_APPROVERS` 휴가는 권한 없는 팀 캘린더 구독에는 포함하지 않는다.
- 링크 유출이 의심되면 즉시 비활성화하거나 재발급한다.
## 3차 보안 강화: step-up 재인증

- 역할 변경, OWNER 권한 부여/해제, 직원 비활성화는 현재 OWNER 비밀번호 재입력을 요구한다.
- 성공/실패는 AuditLog에 기록한다.
- 마지막 ACTIVE OWNER 보호 규칙은 유지한다.
- OWNER 권한 부여 2인 승인은 후속 권장 사항이다.

## 내부자/운영자 위험 통제

앱 코드만으로 GitHub main, Vercel owner, Neon DB admin 권한을 가진 내부자 위험을 완전히 제거할 수 없다. 운영 권한 분리와 감사 절차는 `docs/production-access-control-guide.md` 기준으로 관리한다.
# 세션·토큰·초대 보안 운영 메모

- 세션, 초대, 단축 초대 URL, 가입 인증 코드는 원문을 DB에 저장하지 않고 hash만 저장한다.
- 로그인 실패는 해시된 identifier 기준으로 최근 15분 5회 이상이면 일시 차단한다.
- 자동 로그인 유지 세션은 `REMEMBER_ME_SESSION_EXPIRES_IN_DAYS`를 따르며 로그아웃 시 즉시 폐기된다.
- production에서는 mock/dev 인증, quick login, hardcoded admin login을 허용하지 않는다.
- token/hash/secret/passwordHash/codeHash는 화면, API 응답, CSV, AuditLog에 노출하지 않는다.
- 자세한 변경 내역은 [security-token-session-hardening-report.md](./security-token-session-hardening-report.md)를 참고한다.

## OWNER 권한과 Step-up 재인증

- OWNER 권한 부여/제거, 직원 role 변경, 직원 비활성화, 초대 재발급, CSV export는 고위험 작업으로 분류한다.
- 고위험 작업은 현재 비밀번호를 다시 확인하는 Step-up 재인증이 필요하다.
- 마지막 ACTIVE OWNER는 권한 제거 또는 비활성화할 수 없다.
- OWNER는 자기 자신의 OWNER 권한을 제거하거나 자기 계정을 비활성화할 수 없다.
- 앱 코드로 막을 수 없는 production DB/Vercel/GitHub 관리자 권한 위험은 [production-access-control-guide.md](./production-access-control-guide.md)를 따른다.
## AuditLog 및 보안 대시보드

- AuditLog는 생성 후 앱 UI에서 수정하거나 삭제하지 않습니다.
- AuditLog metadata는 저장 직전에 sanitize되며 password, token, tokenHash, codeHash, secret, fileKey, private path는 `[REDACTED]` 처리됩니다.
- AuditLog는 `category`와 `severity`로 분류됩니다.
- OWNER만 `/admin/audit-logs`와 `/admin/security`에 접근할 수 있습니다.
- AuditLog CSV export는 OWNER 권한과 Step-up 재인증이 필요합니다.
- `CRITICAL`/`HIGH` 이벤트는 보안 대시보드에서 우선 확인합니다.
- production DB, Vercel 환경변수, GitHub 배포 권한을 가진 내부자의 모든 행위는 앱 코드만으로 완전히 막을 수 없으므로 `docs/production-access-control-guide.md`의 운영 통제를 함께 적용합니다.
