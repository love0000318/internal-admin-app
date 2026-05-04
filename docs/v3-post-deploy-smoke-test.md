# 3차 배포 후 Smoke Test

운영 URL: `https://interal-admin-app.vercel.app`

이 문서는 production 배포 후 직원 오픈 전에 실제 운영 계정으로 수행할 smoke test다. 실제 secret, token, DB URL, 가입 인증 코드 원문은 문서에 기록하지 않는다.

## 1. 기본 접근성

- [ ] production URL에 접속한다.
  - 기대 결과: 페이지가 로드된다.
  - 2026-05-04 확인: HTTP 200, title `Internal Ops MVP`.

## 2. OWNER 기본 흐름

- [ ] OWNER 로그인
- [ ] 대시보드 접근
- [ ] 우측 상단 알림 아이콘 표시 확인
- [ ] 직원 목록 접근
- [ ] 조직/팀 관리 접근
- [ ] 휴가 승인 요청 접근
- [ ] AuditLog 접근
- [ ] 보안 대시보드 접근

## 3. 직원 초대/가입 흐름

- [ ] OWNER가 테스트 직원 초대 생성
- [ ] 단축 초대 URL 생성 확인
- [ ] 1회용 가입 인증 코드 생성 확인
- [ ] 시크릿 브라우저에서 초대 URL 접속
- [ ] 인증 코드 입력
- [ ] 직원 가입 완료
- [ ] 동일 인증 코드 재사용 실패 확인
- [ ] 직원 로그인 확인

## 4. 휴가 요청/승인 흐름

- [ ] 직원 계정으로 로그인
- [ ] 내 휴가 현황 확인
- [ ] 연차 요청
- [ ] 승인 대기 상태 확인
- [ ] OWNER 계정으로 로그인
- [ ] 휴가 승인 요청 확인
- [ ] 승인 처리
- [ ] 직원 화면에서 승인 완료 확인
- [ ] 잔여 일수 정합성 확인
- [ ] AuditLog 확인

## 5. 근태 흐름

근태를 이번 릴리즈에 포함한 경우에만 수행한다.

- [ ] 직원 `/attendance` 접속
- [ ] 출근 버튼 클릭
- [ ] 출근 시각 표시 확인
- [ ] 중복 출근 차단 확인
- [ ] 퇴근 버튼 클릭
- [ ] 근무 시간/상태 표시 확인
- [ ] `/attendance/history` 확인
- [ ] OWNER `/admin/attendance` 확인

현재 릴리즈 후보 코드 기준으로는 근태 route가 확인되지 않았고, production에서도 `/attendance`, `/attendance/history`, `/admin/attendance`가 404로 확인되었다. 근태를 포함하면 P0 blocker다.

## 6. 모바일 흐름

모바일 실기기 또는 브라우저 모바일 viewport에서 확인한다.

- [ ] 로그인
- [ ] 초대 가입
- [ ] 대시보드
- [ ] 휴가 요청
- [ ] 휴가 승인 목록
- [ ] 휴가 관리 설정
- [ ] 알림센터
- [ ] 근태 출근/퇴근, 릴리즈 포함 시

확인 항목:

- [ ] 글자 잘림 없음
- [ ] 버튼 텍스트 깨짐 없음
- [ ] 전체 가로 스크롤 없음
- [ ] form 화면 밖 이탈 없음
- [ ] 탭이 깨지지 않음
- [ ] 알림 아이콘 표시

## 7. 보안 흐름

- [ ] MANAGER가 admin 페이지 접근 실패
- [ ] LEAD가 담당 범위 밖 승인 실패
- [ ] Step-up 없이 고위험 작업 실패
- [ ] Step-up 후 고위험 작업 가능
- [ ] 마지막 OWNER 보호 확인
- [ ] token/hash/secret 노출 없음
- [ ] AuditLog metadata에 민감정보 없음

## 8. 외부 캘린더

- [ ] `/leaves/calendar/settings`에서 내 휴가 캘린더 구독 링크 생성
- [ ] ICS 응답 Content-Type 확인
- [ ] APPROVED 휴가만 포함 확인
- [ ] 휴가 사유/증명자료/반려 사유가 포함되지 않음 확인
- [ ] revoke 후 접근 실패 확인

## 9. 직원 삭제/익명화

- [ ] 테스트 직원 비활성화
- [ ] ACTIVE 직원 삭제 버튼 미표시 확인
- [ ] 비활성 직원 삭제 버튼 표시 확인
- [ ] Step-up 없으면 삭제 실패
- [ ] Step-up 후 삭제/익명화 성공
- [ ] 기록에서는 `삭제된 직원` 표시
- [ ] AuditLog 확인

## 결과 기록

| 항목 | 결과 | 담당자 | 비고 |
| --- | --- | --- | --- |
| 기본 접근성 | PASS | Codex | HTTP 200, title 확인 |
| OWNER 흐름 | NOT_RUN | 운영자 | 계정 필요 |
| 직원 초대/가입 | NOT_RUN | 운영자 | 테스트 초대 필요 |
| 휴가 요청/승인 | NOT_RUN | 운영자 | 테스트 계정 필요 |
| 근태 | BLOCKED | Codex | production에서 `/attendance`, `/attendance/history`, `/admin/attendance` 404 |
| 모바일 | NOT_RUN | 운영자 | 실기기 또는 viewport 필요 |
| 보안 | NOT_RUN | 운영자 | role별 계정 필요 |
| 외부 캘린더 | NOT_RUN | 운영자 | 로그인 필요 |
| 직원 삭제/익명화 | NOT_RUN | 운영자 | 테스트 직원 필요 |
