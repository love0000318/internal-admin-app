# OWNER 권한 보호 가이드

## 보호 원칙

- OWNER 권한 부여/해제는 ACTIVE OWNER만 수행할 수 있다.
- OWNER 권한 변경은 Step-up 재인증이 필요하다.
- 마지막 ACTIVE OWNER는 권한 제거 또는 비활성화할 수 없다.
- OWNER는 자기 자신의 OWNER 권한을 제거하거나 자기 계정을 비활성화할 수 없다.
- 권한 변경과 차단 이벤트는 AuditLog에 기록한다.

## 서버 검증

직원 수정 server action은 다음을 서버에서 검증한다.

- actor가 OWNER인지 확인
- target 사용자가 존재하는지 확인
- 마지막 OWNER 보호
- 자기 자신 비활성화 차단
- 자기 자신의 OWNER 권한 강등 차단
- 고위험 변경 시 Step-up 비밀번호 검증

UI에서 버튼이 보이지 않더라도 서버 검증을 통과하지 못하면 작업은 실패한다.

## 차단 이벤트

- `LAST_OWNER_PROTECTION_TRIGGERED`
- `SELF_ROLE_CHANGE_BLOCKED`
- `ROLE_CHANGE_BLOCKED`
- `EMPLOYEE_DEACTIVATION_BLOCKED`

## 대상자 알림

권한 또는 계정 상태가 변경되면 대상자에게 내부 Notification을 생성한다. 알림에는 민감한 내부 사유를 넣지 않는다.

## 후속 권장

- OWNER 권한 부여 2인 승인
- OWNER 권한 변경 정기 리뷰
- OWNER 계정 MFA
- GitHub/Vercel/Neon 관리자 권한 최소화
