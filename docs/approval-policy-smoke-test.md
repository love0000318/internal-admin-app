# 휴가 승인 정책 Smoke Test

- [ ] OWNER로 `/admin/leaves/approval-policies`에 접속한다.
  - 기대 결과: 휴가 승인 정책 목록과 생성 폼이 표시된다.
  - 실패 시 확인: OWNER 권한, route policy, migration 적용 여부

- [ ] `자동 승인` 정책을 생성하고 테스트 휴가 유형에 연결한다.
  - 기대 결과: 정책 생성 후 휴가 유형별 정책 연결 목록에 반영된다.
  - 실패 시 확인: 정책 코드 중복, 휴가 유형 선택 여부

- [ ] 직원이 자동 승인 정책이 연결된 휴가를 요청한다.
  - 기대 결과: 요청이 즉시 `APPROVED` 상태가 되고 Notification/AuditLog가 기록된다.
  - 실패 시 확인: LeaveType 승인 정책 연결, 요청 생성 server action

- [ ] `담당 리드 또는 OWNER` 정책이 연결된 휴가를 요청한다.
  - 기대 결과: 요청이 `PENDING` 상태로 생성되고 OWNER/담당 LEAD 승인 화면에 표시된다.
  - 실패 시 확인: LEAD 담당 팀 설정, 승인 정책 사용 여부

- [ ] 담당 범위 밖 LEAD 또는 MANAGER가 승인 시도한다.
  - 기대 결과: 접근 또는 server action이 차단된다.
  - 실패 시 확인: 서버 권한 helper, route policy

- [ ] 병가 또는 예비군 휴가 유형에 `증명자료 확인 후 승인` 정책을 연결한다.
  - 기대 결과: 증명자료 상태가 `ACCEPTED`가 아니면 승인 시 `attachment-not-accepted` 오류가 표시된다.
  - 실패 시 확인: ApprovalPolicy.requireAttachmentAcceptedBeforeApproval, LeaveRequest.attachmentStatus

- [ ] 증명자료를 확인 완료 처리한 뒤 같은 요청을 승인한다.
  - 기대 결과: 승인 처리가 성공하고 LeaveLedger/AuditLog가 기록된다.
  - 실패 시 확인: 증명자료 검수 action, 승인 action 서버 권한
