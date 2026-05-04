# Production 장애 대응 Runbook

이 문서는 production 장애 발생 시 운영자가 확인할 순서를 정리한다. 실제 secret, token, DB URL은 문서나 채팅에 기록하지 않는다.

## 공통 원칙

- 운영 DB에서 `prisma migrate reset`을 절대 실행하지 않는다.
- 장애 조치 전후 시각, 담당자, 조치 내용을 기록한다.
- secret 유출이 의심되면 값을 공유하지 말고 rotation 절차를 시작한다.
- 보안 사고가 의심되면 세션 revoke, 비밀번호 변경, Vercel/Neon/GitHub 권한 확인을 우선한다.

## 로그인 안 될 때

확인 순서:

1. Vercel deployment 상태 확인
2. production URL 접속 가능 여부 확인
3. Neon DB 상태 확인
4. `DATABASE_URL` production env 존재 여부 확인
5. `SESSION_SECRET`, `TOKEN_SECRET`, `APP_SECRET` 변경 여부 확인
6. 최근 배포와 migration 적용 여부 확인
7. 사용자 status가 ACTIVE인지 확인
8. AuditLog에서 로그인 실패/차단 이벤트 확인

조치:

- 최근 배포가 원인이라면 rollback을 검토한다.
- secret rotation이 있었다면 기존 세션이 무효화될 수 있음을 안내한다.

## 직원 초대가 안 될 때

확인 순서:

1. Invitation 관련 migration 적용 여부 확인
2. `INVITATION_TOKEN_SECRET`, `INVITATION_SHORT_TOKEN_SECRET`, `INVITATION_VERIFICATION_CODE_SECRET` 설정 확인
3. 초대 만료 여부 확인
4. 인증 코드 attempt 초과 여부 확인
5. 초대가 이미 accepted/revoked/consumed 상태인지 확인
6. AuditLog에서 초대 생성/실패/재발급 이벤트 확인

조치:

- 코드 분실 또는 만료 시 초대를 재발급한다.
- 재발급된 새 링크와 새 인증 코드를 직원에게 다시 전달한다.

## 휴가 요청/승인이 안 될 때

확인 순서:

1. DB 연결 상태 확인
2. LeaveType seed 존재 여부 확인
3. ApprovalPolicy 설정 확인
4. LeaveBalance/LeaveGrant/LeaveLedger 정합성 확인
5. 증명자료 승인 필수 정책 여부 확인
6. AuditLog와 서버 로그 확인

조치:

- LeaveType이 비활성화되었는지 확인한다.
- 잔여 수량 이슈는 LeaveLedger validate로 원인을 확인한다.

## 모바일 화면이 깨질 때

확인 순서:

1. 최근 배포 확인
2. 브라우저 캐시와 Vercel 배포 cache 영향 확인
3. 360px/390px/430px viewport에서 재현 여부 확인
4. 해당 화면 screenshot 저장
5. 사용 기기, OS, 브라우저 버전 기록

조치:

- 텍스트 잘림, 탭 깨짐, 버튼 overflow는 UI issue로 등록한다.
- 핵심 기능 사용 불가이면 P0로 분류한다.

## 근태 출근/퇴근이 안 될 때

근태 기능을 운영 범위에 포함한 경우:

1. `/attendance` route 존재 여부 확인
2. AttendancePolicy 설정 확인
3. 오늘이 회사 휴일인지 확인
4. 직원 status가 ACTIVE인지 확인
5. 이미 출근 기록이 있는지 확인
6. 퇴근 전 출근 기록이 존재하는지 확인
7. `/admin/attendance`에서 관리자 조회가 되는지 확인

현재 코드에서 근태 route가 없다면, 근태는 이번 릴리즈에서 제외된 기능으로 안내한다.

## 보안 사고 의심 시

확인 순서:

1. 의심 사용자 session revoke
2. OWNER 비밀번호 변경
3. Vercel/Neon/GitHub 접근권한 확인
4. AuditLog에서 로그인, 권한 변경, 초대 재발급, CSV export 확인
5. 필요 시 secret rotation
6. 직원 초대 링크 재발급
7. 모든 OWNER에게 사고 내용을 공유하고 조치 기록 작성

우선 조치:

- 유출 의심 계정 비활성화
- 관련 초대 revoke
- 관련 세션 revoke
- secret rotation
- Vercel/Neon/GitHub 권한 회수

## DB 장애 시

1. Neon dashboard 상태 확인
2. connection limit 확인
3. 최근 migration 확인
4. production DB 백업/restore 가능 상태 확인
5. 앱 배포 rollback 필요 여부 판단

금지:

- production에서 `migrate reset` 실행
- 임의 SQL로 데이터 삭제
- 백업 없이 destructive 변경
