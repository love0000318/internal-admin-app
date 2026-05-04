# Production Readiness Report

작성일: 2026-05-04  
운영 URL: `https://interal-admin-app.vercel.app`

## 배포 일시

현재 문서 작성 세션에서는 Vercel deployment metadata를 조회하지 못했다. Vercel dashboard에서 실제 production 배포 시각과 commit을 확인해야 한다.

## production URL 확인

- URL: `https://interal-admin-app.vercel.app`
- 확인 결과: HTTP 200 응답 확인
- 페이지 title: `Internal Ops MVP`
- 비인증 상태에서 `/attendance`, `/attendance/history`, `/admin/attendance`는 모두 404 응답

## 검수한 기능

현재 세션에서 인증 계정과 테스트 초대 코드가 제공되지 않아 로그인 이후 기능은 직접 완료 처리하지 않았다. 대신 운영자가 수행할 smoke test 문서를 작성했다.

직접 확인:

- production URL 기본 접근성
- 문서와 운영 체크리스트 정리

문서 기반 확인 필요:

- OWNER 로그인
- 직원 초대/가입
- 휴가 요청/승인
- 알림센터
- 보안 대시보드
- AuditLog
- 직원 삭제/익명화
- 외부 캘린더 ICS
- 모바일 주요 화면
- 근태 출근/퇴근, 릴리즈 포함 시

## 통과한 smoke test

- production URL HTTP 200
- production page title 확인

## 실패 또는 미수행 smoke test

- OWNER 로그인: 인증 정보 없음으로 미수행
- 직원 초대/가입: 운영 테스트 계정 없음으로 미수행
- 휴가 요청/승인: 운영 테스트 계정 없음으로 미수행
- 근태 출근/퇴근: 현재 코드 기준 route 부재가 릴리즈 후보 보고서에 blocker로 기록됨
- 모바일 실기기 검수: 미수행
- role별 권한 우회 검수: 운영 계정 없음으로 미수행

## 남은 P0 blocker

- 근태/출퇴근 및 근태 수정 요청을 이번 릴리즈 범위에 포함한다면 route/lib 부재가 P0다.
- production에서도 `/attendance`, `/attendance/history`, `/admin/attendance`가 404로 확인되었다.
- Neon 운영 DB migration/preflight 결과가 아직 문서화되지 않았다.

## 남은 P1 개선 항목

- 실제 모바일 기기 또는 브라우저 viewport 기반 smoke test 필요
- Vercel production env dashboard 확인 필요
- 외부 알림 provider 활성/비활성 정책 확인 필요
- local attachment storage 사용 시 운영 storage 전환 필요

## 남은 P2 후속 항목

- 카카오 알림톡
- GPS 근태 인증
- 급여 정산
- 전자계약
- SSO/MFA
- Google Calendar 양방향 OAuth
- 파일 바이러스 검사
- 고급 리포트

## 모바일 검수 결과

문서화 상태: 검수 체크리스트 작성 완료  
실제 모바일 수행 상태: 미수행

운영자는 최소 360px, 390px, 430px viewport에서 다음 화면을 확인한다.

- `/login`
- `/invitations/accept`
- `/dashboard`
- `/leaves/me`
- `/leaves/me/requests/new`
- `/leaves/calendar`
- `/notifications`
- `/admin/leaves/settings`
- `/admin/leaves/types`
- `/admin/security`

## 보안 검수 결과

문서화 상태: 보안 체크리스트 작성 완료  
실제 운영 계정 기반 검수: 미수행

운영자는 다음을 확인한다.

- MANAGER admin 접근 실패
- LEAD 담당 범위 밖 승인 실패
- Step-up 없이 고위험 작업 실패
- Step-up 후 고위험 작업 가능
- 마지막 OWNER 보호
- AuditLog metadata에 token/passwordHash/secret/fileKey 없음

## 직원 오픈 가능 여부

**직원 오픈 보류**

사유:

- 인증 기반 production smoke test가 아직 완료되지 않았다.
- 근태를 이번 릴리즈 범위에 포함한다면 기능 부재가 blocker다.
- Neon migration/preflight 결과가 운영 기준으로 확인되지 않았다.

근태를 제외하고, OWNER/직원 초대/휴가/보안/모바일 smoke test가 production에서 통과하면 **제한적으로 직원 오픈 가능**으로 변경할 수 있다.

## 권장 오픈 방식

전 직원에게 한 번에 오픈하지 말고 단계적으로 진행한다.

1. 1차: 대표 + 테스트 직원 1~2명
2. 2차: 핵심 운영 직원 3~5명
3. 3차: 전체 직원

각 단계에서 확인할 것:

- 가입 성공 여부
- 모바일 사용성
- 휴가 요청/승인
- 출근/퇴근, 릴리즈 포함 시
- 알림 수신
- 오류 문의 여부

## 오픈 전 필수 체크

- [ ] Neon `prisma migrate deploy` 완료
- [ ] `preflight` 통과 또는 FAIL 사유 해소
- [ ] Vercel production env 확인
- [ ] OWNER 로그인 확인
- [ ] 테스트 직원 초대/가입 확인
- [ ] 휴가 요청/승인 확인
- [ ] 모바일 주요 화면 확인
- [ ] 보안 대시보드와 AuditLog 확인
- [ ] 근태 포함 여부 결정
