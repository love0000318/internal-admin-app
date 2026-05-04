# 보안·개인정보 운영 가이드

## 기본 원칙

- 권한 검증은 UI 숨김만으로 처리하지 않고 protected page, server action, route handler에서 수행한다.
- 비밀번호 원문, session token 원문, invitation token 원문, shortToken 원문, verification code 원문은 DB에 저장하지 않는다.
- tokenHash/codeHash/passwordHash/secret은 화면, API 응답, CSV, AuditLog에 노출하지 않는다.
- 주민등록번호, 계좌번호, 가족 정보, 증명자료는 최소 권한으로 접근한다.
- AuditLog, Notification metadata, JobRun summary에는 민감정보 원문을 저장하지 않는다.
- 첨부파일은 public directory에 저장하지 않는다.

## 세션과 로그인

- session cookie는 httpOnly, sameSite lax 이상, production secure를 사용한다.
- 로그아웃 시 현재 세션을 revoke한다.
- 만료 또는 revoked session은 protected route 접근이 불가해야 한다.
- rememberMe 세션도 로그아웃 시 revoke된다.
- production에서 mock login, dev quick login, hardcoded owner login은 금지한다.

## 초대와 가입 인증 코드

- invitation token과 shortToken은 생성 직후 URL에만 포함되고 DB에는 hash만 저장한다.
- 가입 인증 코드는 생성 직후 한 번만 표시하고 DB에는 hash만 저장한다.
- 가입 인증 코드는 만료, maxAttempts, consumed/revoked 상태를 사용한다.
- 초대 재발급 시 기존 token, shortToken, verification code는 폐기한다.

## OWNER와 Step-up

- OWNER 권한 부여/제거는 ACTIVE OWNER만 수행할 수 있다.
- OWNER 권한 변경, 직원 비활성화, 직원 영구 삭제, CSV export는 Step-up 재인증이 필요하다.
- 마지막 ACTIVE OWNER는 제거, 강등, 비활성화, 삭제할 수 없다.
- 자기 자신을 비활성화하거나 OWNER 권한에서 직접 강등할 수 없다.

## 직원 영구 삭제와 익명화

- ACTIVE 직원은 영구 삭제할 수 없다.
- 비활성 직원만 OWNER + Step-up으로 삭제할 수 있다.
- 업무 기록이 없는 직원은 hard delete가 가능하다.
- 휴가/근태/AuditLog 등 업무 기록이 있는 직원은 개인정보를 삭제하고 `삭제된 직원`으로 익명화한다.
- AuditLog는 삭제하지 않는다.

## AuditLog

- AuditLog metadata는 저장 전 sanitize한다.
- password, token, tokenHash, codeHash, secret, fileKey, private path는 저장하지 않는다.
- AuditLog 조회는 OWNER 전용이다.
- AuditLog export는 OWNER + Step-up이 필요하다.

## 운영 주의사항

- 운영 DB에서 `prisma migrate reset`을 사용하지 않는다.
- secret 값은 문서, issue, PR, chat, 로그에 기록하지 않는다.
- GitHub/Vercel/Neon 권한자는 최소화하고 정기 감사한다.
- 내부자가 production DB나 Vercel env에 직접 접근할 수 있으면 앱 권한 체계를 우회할 수 있으므로 인프라 접근 통제가 반드시 필요하다.
# 휴가 사용내역 import 보안

휴가 사용내역 엑셀 import는 OWNER만 사용할 수 있으며, 최종 반영에는 Step-up 재인증이 필요합니다. 원본 엑셀 파일은 public에 저장하지 않고, AuditLog에는 row 전체나 과도한 개인정보를 저장하지 않습니다. import 이력에는 batch id, row count, matched/error count 같은 운영 추적 정보만 남깁니다.

UNKNOWN 상태 row는 자동 승인 처리하지 않습니다. 취소 상태 row는 사용량 장부로 차감하지 않습니다. 같은 row 또는 같은 idempotencyKey가 다시 반영되지 않도록 서버에서 차단합니다.

구성원 휴가 현황 엑셀 업로드는 직원 매칭과 잔여 조정 미리보기만 저장하며, 업로드 원본 전체를 public 또는 AuditLog에 보관하지 않습니다. 이메일은 화면 표시와 row 요약에서 필요한 경우 마스킹하고, 전화번호 원문과 민감 HR 정보는 import row/AuditLog metadata에 저장하지 않습니다.

엑셀 템플릿 다운로드에는 ACTIVE 내부 직원의 이름, 이메일, 사번, 팀, 기준연도, 휴가 수량 참고값만 포함합니다. 주민등록번호, 계좌번호, 주소, 급여, 가족정보, 증명자료 내용은 템플릿에 포함하지 않습니다.

잘못 반영한 월별 휴가 현황 batch를 취소할 때도 기존 LeaveAdjustment, LeaveLedger, LeaveRequest를 삭제하지 않습니다. 반영 취소는 OWNER + Step-up으로만 가능하며, 반대 방향 LeaveAdjustment와 LeaveLedger `IMPORT_REVERSE_ADJUSTMENT` 이벤트를 새로 생성해 추적 가능성을 유지합니다.

## 휴가 현황 조회 보안

구성원 휴가 현황은 민감 HR 정보가 아닌 휴가 운영 정보만 표시합니다. 화면에는 주민등록번호, 계좌번호, 주소, 급여 정보, 가족 정보, 증명자료 파일 내용이나 private fileKey를 표시하지 않습니다.

권한 정책:

- OWNER: 전체 ACTIVE 내부 직원의 휴가 현황 조회 가능
- LEAD: 담당 팀과 하위 팀 직원만 조회 가능
- MANAGER: 본인 휴가 현황만 조회 가능
- EXTERNAL_PARTNER: 내부 휴가 현황 접근 불가

LEAD에게 전체 직원 데이터를 내려준 뒤 클라이언트에서 필터링하지 않습니다. 서버에서 scope userIds를 계산하고 DB query에 적용합니다. 담당 범위 밖 직원 상세 URL을 직접 호출해도 서버에서 차단되어야 합니다.

## Secret/Token 노출 방지 점검

- 실제 `DATABASE_URL`, API key, webhook URL, session/invitation/calendar token 원문은 코드, 문서, AuditLog, Notification, JobRun, CSV export에 저장하지 않습니다.
- DB에는 session token, invitation token, short token, verification code, calendar subscription token의 hash만 저장합니다.
- `.env`, `.env.local`, `.env.production`, `.vercel`, `private/`, 엑셀 원본, key 파일은 Git에 포함하지 않습니다.
- `.env.example`과 `.env.production.example`에는 placeholder만 둡니다.
- 초대 URL과 가입 인증 코드를 seed/reissue script에서 1회 출력하는 경우, 출력 로그를 안전하게 관리하고 노출 시 즉시 폐기/재발급합니다.
- secret 노출이 의심되면 값을 문서에 복사하지 말고 위치와 유형만 기록한 뒤 해당 secret을 rotate합니다.
- 정기 점검 결과는 `docs/security-secret-scan-report.md`에 원문 없이 기록합니다.
