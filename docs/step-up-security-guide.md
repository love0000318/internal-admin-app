# Step-up 재인증 보안 가이드

## 목적

Step-up 재인증은 로그인된 OWNER라도 고위험 작업을 실행하기 전에 현재 비밀번호를 다시 확인하는 절차다. 세션 탈취나 자리 비움 상태에서 관리자 권한이 오남용되는 위험을 낮춘다.

## 적용 대상

- OWNER 권한 부여
- OWNER 권한 제거
- 직원 role 변경
- 직원 비활성화
- 직원 초대 재발급
- 관리자 리포트 CSV export
- 세션 강제 로그아웃, 보안 설정 변경, 정책 변경은 후속 확대 대상

## 동작 방식

1. 사용자가 고위험 작업을 시도한다.
2. 서버가 Step-up 인증이 필요한 작업인지 판단한다.
3. 사용자는 현재 비밀번호를 다시 입력한다.
4. 비밀번호가 맞으면 `StepUpVerification`이 생성된다.
5. 기본 5분 동안 같은 목적의 작업이 허용된다.
6. 만료, consumed, revoked 상태의 Step-up은 사용할 수 없다.

## 환경변수

- `STEP_UP_EXPIRES_IN_MINUTES=5`
- `STEP_UP_MAX_ATTEMPTS=5`

## AuditLog

다음 이벤트를 기록한다.

- `STEP_UP_VERIFICATION_SUCCEEDED`
- `STEP_UP_VERIFICATION_FAILED`
- `STEP_UP_VERIFICATION_CONSUMED`
- `REPORT_EXPORT_STEP_UP_REQUIRED`
- `INVITATION_REISSUED_WITH_STEP_UP`
- `EMPLOYEE_DEACTIVATED_WITH_STEP_UP`

AuditLog에는 비밀번호 원문, passwordHash, session token, tokenHash, secret 값을 저장하지 않는다.

## 운영 주의사항

- 공용 PC에서는 작업 후 반드시 로그아웃한다.
- OWNER 권한 변경은 가능하면 별도 운영 승인 절차를 거친다.
- Step-up은 앱 내부 보호 장치이며, production DB나 Vercel 환경변수에 직접 접근할 수 있는 내부자 위험까지 완전히 차단하지는 못한다.
## 휴가 Import Step-up UI

- 휴가 import 최종 반영, 반영 취소/역조정, 반영 후 잔여 차이 보정은 모두 Step-up 재인증 대상이다.
- 버튼 클릭 시 공통 Step-up 모달이 열리고, 사용자는 현재 계정 비밀번호를 다시 입력한다.
- 비밀번호 검증은 서버 action에서 수행하며, 성공 시 StepUpVerification만 생성한다. 비밀번호 원문이나 token 원문은 저장하지 않는다.
- Step-up 모달 성공 후에만 원래 import apply/reverse/reconciliation form submit이 이어진다.
- 서버의 `assertRecentStepUp` 검증을 제거하지 않는다. UI 인증이 없거나 만료되면 서버 action은 실패해야 한다.
