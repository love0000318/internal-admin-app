# PDF Spec Review

Source: `C:/Users/love0/OneDrive/바탕 화면/codex_internal_admin_app_spec_final.pdf`

## 반영 요약

- PDF 텍스트를 직접 추출해 MVP 포함/제외 범위, 역할, 데이터 모델, 화면/API 명세, 휴가 계산 요구사항, 보안 요구사항을 현재 레포 구조와 대조했다.
- 이번 작업은 1단계 기반 정리이므로 실제 로그인/초대/휴가 승인 구현은 하지 않고, schema/type/route/TODO에 구현 준비 상태로 반영했다.

## 주요 반영 사항

- 초대 모델에 `email`, `expectedName`, `jobTitle`, `hireDate`, `birthday`를 추가했다.
- 대표 OWNER seed는 `SEED_OWNER_EMAIL`, `SEED_OWNER_NAME`, `SEED_OWNER_TITLE`을 사용하도록 맞췄다.
- `User`와 `EmployeeProfile`을 분리했다.
- 본인인증 결과를 보존할 `IdentityVerification` 모델과 타입을 추가했다.
- 휴가 정책을 `LeaveType`별 정책으로 재구성했다.
- `LeaveBalance`, `LeaveAdjustment`, `HalfDayPeriod`, `WITHDRAWN`, `CANCELLED`를 추가했다.
- 라우트 skeleton을 PDF 화면 명세에 맞춰 `/leaves/my`, `/leaves/approvals`, `/admin/leave-settings`, `/admin/organization`으로 정리했다.
- 제외 기능은 future route policy로만 남겼다.
- `TODO.md`를 PDF의 Codex 작업 순서와 수용 기준에 맞춰 재작성했다.
- 요청된 `src/lib/auth`, `src/lib/rbac`, `src/lib/leave`, `src/lib/audit` helper 파일을 추가했다.
- 비밀번호 정책, 초대 token hash/verify/만료, RBAC guard, 연차/근무일/반차 계산 테스트를 추가했다.

## 다음 구현 시 주의점

- LEAD는 자기 휴가를 직접 승인할 수 없다.
- 마지막 OWNER는 비활성화하거나 권한 강등할 수 없다.
- 초대 token 원문은 DB에 저장하지 않고 hash만 저장해야 한다.
- 비밀번호 hash는 Argon2id 우선, 불가하면 bcrypt high cost를 사용한다.
- production 환경에서 mock 본인인증 provider가 작동하면 안 된다.
- pending/approved 휴가와 날짜 중복 요청은 차단해야 한다.
- 반려 사유, 취소 사유, 정책 변경 전후 값은 AuditLog에 남긴다.
