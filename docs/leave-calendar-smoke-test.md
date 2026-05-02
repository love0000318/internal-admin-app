# 휴가 캘린더 수동 검수표

- [ ] OWNER가 `/leaves/calendar`에 접근한다.
  - 기대 결과: 전체 직원의 승인 완료 휴가가 표시된다.
  - 실패 시 확인: route policy, 로그인 사용자 role, LeaveRequest 상태.

- [ ] OWNER가 상태 필터를 `승인 대기`로 바꾼다.
  - 기대 결과: 전체 PENDING 휴가가 표시된다.
  - 실패 시 확인: calendar status filter, 서버 query status.

- [ ] MANAGER가 같은 팀 직원의 연차를 확인한다.
  - 기대 결과: `양현지 - 연차`처럼 휴가 유형이 표시된다.
  - 실패 시 확인: LeaveType visibility가 `PUBLIC_WITH_TYPE`인지 확인.

- [ ] MANAGER가 같은 팀 직원의 병가를 확인한다.
  - 기대 결과: `양현지 - 휴가`처럼 일반 휴가로만 표시된다.
  - 실패 시 확인: 병가 visibility가 `PUBLIC_AS_LEAVE`인지 확인.

- [ ] MANAGER가 `PRIVATE_TO_APPROVERS` 휴가를 확인한다.
  - 기대 결과: 권한 없는 사용자에게 이벤트가 표시되지 않는다.
  - 실패 시 확인: `canViewCalendarLeaveEvent` 서버 필터.

- [ ] LEAD가 담당 팀 PENDING 휴가를 확인한다.
  - 기대 결과: 담당 팀 및 하위 팀의 승인 대기 휴가가 표시된다.
  - 실패 시 확인: Team.leadUserId, 하위 팀 parentTeamId, `managedTeamIds`.

- [ ] MANAGER가 타인의 PENDING 휴가를 확인한다.
  - 기대 결과: 표시되지 않는다.
  - 실패 시 확인: status filter와 manager visibility rule.

- [ ] 반차 휴가를 확인한다.
  - 기대 결과: `오전` 또는 `오후`가 표시된다.
  - 실패 시 확인: LeaveRequest.halfDayPeriod.

- [ ] 이벤트 상세 링크를 확인한다.
  - 기대 결과: 본인은 내 요청 상세, OWNER/LEAD는 승인 상세로 이동한다. 일반 팀원은 상세 링크가 없다.
  - 실패 시 확인: `canViewCalendarLeaveDetail`.
