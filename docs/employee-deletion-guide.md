# 비활성 직원 영구 삭제 가이드

## 목적

비활성화된 직원의 개인정보를 운영 화면에서 제거하되, 휴가, 근태, 리포트, AuditLog 같은 업무 기록의 정합성은 유지하기 위한 기능입니다.

운영 UI에서는 “영구 삭제”라고 표시하지만, 기록이 있는 직원은 실제 User row를 삭제하지 않고 개인정보를 익명화합니다. 문서상 명칭은 “업무 기록 보존을 위한 개인정보 익명화 삭제”입니다.

## 삭제 가능 조건

- 대상 직원 상태가 `DEACTIVATED`입니다.
- 대상이 현재 로그인한 OWNER 본인이 아닙니다.
- 대상이 마지막 ACTIVE OWNER가 아닙니다.
- 실행자는 ACTIVE OWNER입니다.
- 실행자는 `EMPLOYEE_PERMANENT_DELETE` Step-up 재인증을 완료했습니다.
- 대상이 이미 `DELETED` 처리되지 않았습니다.

## 삭제 불가 조건

- ACTIVE 직원입니다.
- 자기 자신입니다.
- 마지막 총괄 관리자 보호 규칙에 걸립니다.
- OWNER가 아닌 사용자가 시도합니다.
- Step-up 재인증이 없거나 만료되었습니다.
- 이미 삭제 처리된 직원입니다.

## 삭제 방식

### Hard delete

다음 핵심 기록이 없는 경우에만 User row를 물리 삭제할 수 있습니다.

- 휴가 요청, 휴가 장부, 휴가 지급
- 감사 로그 actor/target 기록
- HR 프로필 및 민감 프로필
- 휴가 보유, 휴가 조정, 연차 사용계획, 캘린더 구독, JobRun 등 업무 기록

### 익명화 삭제

기록이 있으면 기본적으로 익명화 삭제합니다.

- `User.status = DELETED`
- 이름은 `삭제된 직원`으로 변경
- 이메일은 `deleted-{userId}@deleted.local` 형식으로 변경
- 전화번호, 생년월일, 직급, 팀, 입사일 등 개인정보 null 처리
- HR 민감정보, 가족, 경력, 학력, 자격, 보상, 계약 기록 삭제
- 세션 revoke
- pending invitation revoke
- Notification 삭제
- AuditLog는 삭제하지 않음

## 화면 동작

- 직원 상세 화면에서 비활성 직원에게만 Danger Zone이 표시됩니다.
- OWNER는 삭제 영향 분석 건수를 확인합니다.
- 현재 비밀번호 Step-up 재인증이 필요합니다.
- 확인 문구 `DELETE`를 입력해야 실행됩니다.
- 직원 목록 기본 조회에서는 `DELETED` 직원을 숨깁니다.
- OWNER는 상태 필터에서 삭제됨 또는 전체를 선택해 확인할 수 있습니다.

## 보존되는 기록

업무 정합성을 위해 다음 기록은 유지될 수 있습니다.

- 휴가 요청 및 승인 이력
- LeaveLedger
- 근태/Job/리포트 관련 기록
- AuditLog

이 기록에서 직원은 `삭제된 직원`으로 표시되어야 하며, 이메일/전화번호/주민등록번호/계좌번호 등 개인정보는 표시하지 않습니다.

## AuditLog

다음 이벤트를 기록합니다.

- `EMPLOYEE_DELETE_IMPACT_ANALYZED`
- `EMPLOYEE_PERMANENT_DELETE_REQUESTED`
- `EMPLOYEE_ANONYMIZED`
- `EMPLOYEE_HARD_DELETED`
- `EMPLOYEE_DELETE_BLOCKED`

AuditLog metadata에는 token, passwordHash, codeHash, 주민등록번호, 계좌번호, fileKey, private path를 저장하지 않습니다.

## 운영 주의사항

- 운영 DB에서 `migrate reset`을 사용하지 마세요.
- 삭제 전 HR/노무/회계상 보존 의무가 있는지 확인하세요.
- 증명자료 파일의 물리 삭제는 별도 보존/파기 정책에 따라 처리해야 합니다.
- 삭제 후 복구는 기본 제공하지 않습니다.
