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
