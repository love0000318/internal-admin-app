# 조직/권한 관리 고도화 가이드

## 보존 원칙

- 이 기능은 조직/RBAC 관리 복구이며 휴가 잔여 계산 로직을 변경하지 않는다.
- 1년 미만 직원 회계연도 비례 연차, 양태식 케이스, 장기근속자 반복 합산 방지 테스트는 보존 대상이다.
- LEAD 범위는 서버에서 팀/직원 조회 조건으로 제한하며, 클라이언트에 전체 직원 데이터를 내려서 필터링하지 않는다.

## 역할

- OWNER: 전체 조직, 직원, 권한, 리포트, 감사 기능을 관리한다.
- LEAD: 담당자로 지정된 팀과 모든 하위 팀 범위만 조회/처리한다.
- MANAGER: 본인 정보와 본인 휴가 중심으로 접근한다.
- EXTERNAL_PARTNER: 내부 조직, 직원, 휴가, 근태, 리포트에 접근하지 않는다.

## 팀 담당자

- 팀 담당자는 `Team.leadUserId`로 관리한다.
- 담당자는 ACTIVE 상태의 OWNER 또는 LEAD만 지정할 수 있다.
- MANAGER나 EXTERNAL_PARTNER를 담당자로 지정하려면 먼저 역할 변경 정책을 검토해야 하며, 서버 액션은 이를 차단한다.
- 담당자 지정, 변경, 해제는 OWNER만 가능하며 Step-up 확인이 필요하다.
- 팀 parent 변경은 순환 구조를 만들 수 없다.

## LEAD 담당 범위

- LEAD가 담당자인 팀을 루트로 삼는다.
- 루트 팀과 모든 하위 팀이 담당 범위에 포함된다.
- 비활성 팀은 담당 범위에서 제외한다.
- 비활성 직원과 EXTERNAL_PARTNER는 내부 담당 범위 계산에서 제외한다.

## 권한 미리보기

OWNER는 `/admin/organization/permissions-preview`에서 다음을 확인한다.

- 현재 role과 소속 팀
- 담당 팀과 하위 팀 포함 범위
- 볼 수 있는 팀 수와 직원 수
- 휴가 현황, 휴가 승인, 근태, 리포트 접근 범위
- role/team 변경 시 영향 설명
- 이 직원을 볼 수 있는 LEAD 목록

권한 미리보기는 읽기 전용이며, 실제 변경은 직원 상세 화면에서 Step-up 후 저장한다.

## 보호 정책

- OWNER 권한 부여/해제는 Step-up이 필요하다.
- 마지막 OWNER 강등 또는 비활성화는 차단한다.
- 본인이 자신의 OWNER 권한을 제거하거나 본인을 비활성화할 수 없다.
- team 변경은 LEAD 가시 범위에 영향을 주므로 AuditLog에 남긴다.
- 직원 삭제는 hard delete가 아니라 비활성화/익명화 정책을 따른다.

## AuditLog

현재 schema에 존재하는 AuditAction을 사용한다.

- `TEAM_CREATED`
- `TEAM_UPDATED`
- `TEAM_DEACTIVATED`
- `USER_ROLE_UPDATED`
- `USER_TEAM_UPDATED`
- `OWNER_ROLE_GRANTED`
- `OWNER_ROLE_REVOKED`
- `ROLE_CHANGE_BLOCKED`
- `LAST_OWNER_PROTECTION_TRIGGERED`
- `SELF_ROLE_CHANGE_BLOCKED`
- `USER_DEACTIVATED`

AuditLog metadata에는 role, teamId, status, 변경 필드와 같은 추적 정보만 저장하고 token, password, 민감 인사정보 원문은 저장하지 않는다.

## 운영 주의

- 메뉴 숨김은 UX 편의일 뿐이며 서버 guard를 대체하지 않는다.
- LEAD scope helper는 휴가, 근태, 리포트 조회에서 재사용할 수 있지만 휴가 계산 helper 내부 로직을 변경하지 않는다.
- schema 변경 없이 기존 `Team.leadUserId`, `Team.parentTeamId`, `User.teamId`를 사용한다.
