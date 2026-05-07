# 비활성 직원 계정 삭제 운영 가이드

## 목적

비활성화된 직원 계정의 로그인 권한과 개인정보를 제거하되, 휴가, 근태, 감사 로그 등 업무 기록은 보존한다.

## 삭제 방식

기본 정책은 안전 삭제다.

- `User.status`를 `DELETED`로 변경한다.
- `User.deletedAt`, `deletedByUserId`, `deletionReason`을 기록한다.
- 활성 세션을 revoke한다.
- pending 초대와 가입 token을 revoke한다.
- 캘린더 구독 token을 revoke한다.
- 개인정보와 HR 민감정보를 null 처리하거나 “삭제된 직원”으로 익명화한다.
- 휴가, 근태, 감사 로그, 휴가 장부 기록은 삭제하지 않는다.

## 삭제 가능 조건

- actor는 ACTIVE OWNER여야 한다.
- 대상 직원은 `DEACTIVATED` 상태여야 한다.
- 대상 직원은 actor 본인이 아니어야 한다.
- 대상 직원은 이미 삭제된 계정이 아니어야 한다.
- Step-up 재인증이 성공해야 한다.
- 마지막 OWNER 보호 규칙을 통과해야 한다.

## 차단 조건

- ACTIVE 직원 삭제 시도
- 본인 계정 삭제 시도
- 마지막 OWNER 삭제 시도
- OWNER가 아닌 사용자의 삭제 시도
- Step-up 재인증 실패
- 이미 삭제된 계정 재삭제 시도

## 익명화 항목

- 이름: `삭제된 직원`
- 이메일: `deleted-{userId}@deleted.internal`
- 전화번호, 직급, 팀, 입사일, 생일: null
- 비밀번호 hash: 로그인 불가능한 tombstone 값
- EmployeeProfile 기본 개인정보: null 또는 `삭제된 직원`
- EmployeeSensitiveProfile, 가족, 보상, 경력, 학력, 자격, 교육 정보: 삭제
- pending profile change request: 취소

## 보존되는 업무 기록

- LeaveRequest
- LeaveLedger
- LeaveGrant
- LeaveAdjustment
- AttendanceRecord
- AttendanceChangeRequest
- AuditLog
- JobRun 등 운영 추적 기록

## AuditLog 원칙

삭제 전 이메일, 전화번호, 주민등록번호, 계좌번호, token, hash, password는 AuditLog metadata에 저장하지 않는다.

기록되는 정보는 다음 수준으로 제한한다.

- actorUserId
- targetUserId
- previousStatus / newStatus
- retainedRecordsSummary
- anonymizedFields
- deletionMode: `SAFE_DELETE`

## 운영 절차

1. OWNER로 로그인한다.
2. 직원을 먼저 비활성화한다.
3. 직원 목록 또는 상세에서 비활성 직원의 `계정 삭제`를 선택한다.
4. 현재 비밀번호로 Step-up 재인증을 수행한다.
5. 확인 문구 `DELETE`를 입력한다.
6. 삭제 후 직원 목록 기본 화면에서 사라지는지 확인한다.
7. `상태 전체` 또는 `DELETED` 필터에서 익명화된 직원만 표시되는지 확인한다.
8. 삭제 직원으로 로그인할 수 없는지 확인한다.
9. 휴가/근태/감사 로그가 유지되는지 확인한다.

## 금지

- ACTIVE 직원 삭제
- 기존 LeaveRequest / LeaveLedger / LeaveGrant / LeaveAdjustment 삭제
- AttendanceRecord / AttendanceChangeRequest 삭제
- AuditLog 삭제
- 운영 DB에서 `prisma migrate reset`
- production DB 대상 `prisma migrate dev`

## 휴가 계산 회귀 보호

이 기능은 계정 개인정보 삭제 기능이며 휴가 잔여 계산과 무관하다. `calculateUnderOneYearFiscalProratedLeave`, `roundUpToHalfDay`, `calculateCanonicalLeaveBalanceForUserYear`는 수정하지 않는다.
