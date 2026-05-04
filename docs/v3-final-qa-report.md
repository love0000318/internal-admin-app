# 3차 최종 QA 보고서

작성일: 2026-05-04  
기준: 3차 릴리즈 후보 최종 점검

## 최종 판단

**배포 불가**

3차 전체 범위에 포함된 근태/출퇴근 기능이 현재 코드에서 확인되지 않는다. `/attendance`, `/attendance/history`, `/admin/attendance`, `src/lib/attendance`가 없으므로 직원 출근/퇴근, 근태 이력, 관리자 근태 검수를 수행할 수 없다.

또한 현재 로컬 환경에서는 PostgreSQL이 실행 중이 아니어서 `prisma migrate status`, `preflight`, DB 기반 job dry-run을 완료하지 못했다. 운영 Neon DB 기준 migration deploy와 smoke test가 필요하다.

근태 기능을 이번 릴리즈에서 제외하고 Neon migration/preflight/production smoke test를 완료한다면, 휴가/초대/보안/UI 범위는 제한적으로 배포 가능하다.

## 실행한 명령과 결과

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `corepack pnpm lint` | PASS | ESLint 통과 |
| `corepack pnpm typecheck` | PASS | TypeScript 통과 |
| `corepack pnpm test` | PASS | 26 files, 171 tests passed |
| `corepack pnpm build` | PASS | production build 통과 |
| `corepack pnpm db:validate` | PASS | Prisma schema valid |
| `corepack pnpm db:generate` | PASS | Prisma Client 생성 |
| `corepack pnpm prisma migrate status` | FAIL | 로컬 DB 연결 실패 |
| `corepack pnpm preflight` | FAIL | 로컬 DB 연결 실패 |

## 기능 상태 요약

| 기능 | 상태 | 비고 |
| --- | --- | --- |
| 로그인/로그아웃 | COMPLETE | build/test 통과 |
| 자동 로그인 유지 | COMPLETE | session/env 구조 존재 |
| OWNER 가입 | COMPLETE | seed/초대 기반 구조 존재 |
| 직원 초대 | COMPLETE | 긴 URL, 단축 URL, 인증 코드 구조 존재 |
| 1회용 가입 인증 코드 | COMPLETE | hash/attempt/consumed/revoked 구조 존재 |
| 단축 초대 URL | COMPLETE | `/i/[shortToken]` route 존재 |
| 직원 가입 | COMPLETE | 초대 수락 route 존재 |
| 직원 목록/상세 | COMPLETE | OWNER route 존재 |
| 직원 비활성화 | COMPLETE | Step-up/OWNER 보호 구조 존재 |
| 비활성 직원 삭제/익명화 | COMPLETE | helper, UI, migration 존재 |
| 휴가 요청/승인/반려/취소 | COMPLETE | route/action/build 통과 |
| 휴가 캘린더 | COMPLETE | `/leaves/calendar` 존재 |
| 외부 캘린더 ICS | COMPLETE | `/api/calendar/ical` 존재 |
| 생일 반차 | COMPLETE | script/cron route 존재 |
| 연차 촉진 사용계획 | COMPLETE | date-range UI/helper 존재 |
| 모바일 UI | PARTIAL | 코드 보정 완료, 실제 브라우저 viewport 검수 필요 |
| 알림센터 | COMPLETE | `/notifications` 존재 |
| 외부 이메일 알림 | PARTIAL | provider 존재, production env 미확인 |
| Slack 알림 | PARTIAL | provider 존재, production env 미확인 |
| 근태 출근/퇴근 | NOT_STARTED | route/lib 없음 |
| 근태 수정 요청 | NOT_STARTED | route/lib 없음 |
| Step-up 재인증 | COMPLETE | model/helper/tests 존재 |
| AuditLog | COMPLETE | sanitize/classification/export 보호 존재 |
| 보안 대시보드 | COMPLETE | `/admin/security` 존재 |
| JobRun/Cron | PARTIAL | scripts/routes 존재, DB dry-run 미검증 |
| Vercel env | UNKNOWN | CLI 없음, dashboard 확인 필요 |
| Neon migration | UNKNOWN | 로컬 DB 불가, 운영 DB deploy 필요 |

## P0 blocker

- 근태/출퇴근 기능 부재
- 운영 DB migration 상태 미확인

## P1 개선 항목

- 실제 모바일 브라우저 screenshot 검수 필요
- 외부 알림 production env 확인 필요
- legacy 문서 인코딩 깨짐 정리 권장
- local attachment storage의 production 위험 정리 필요

## P2 후속 항목

- 카카오 알림톡
- GPS 근태 인증
- 급여 정산
- 전자계약
- SSO/MFA
- Google Calendar 양방향 OAuth
- 파일 바이러스 검사
- 고급 리포트

## 배포 전 필수 작업

1. 근태 기능을 이번 릴리즈에서 제외할지, 별도 구현 후 다시 QA할지 결정한다.
2. 운영 Neon DB 백업을 확인한다.
3. Vercel production env 이름과 적용 환경을 확인한다.
4. 운영 DB 기준으로 다음을 실행한다.

```powershell
$env:DATABASE_URL='Neon DATABASE_URL'
corepack pnpm prisma migrate deploy
corepack pnpm db:seed
corepack pnpm preflight
```

5. production smoke test를 수행한다.

## 배포 후 smoke test

1. OWNER 로그인
2. 직원 초대 생성
3. 직원 가입
4. 직원 휴가 요청
5. OWNER 휴가 승인
6. 알림센터 확인
7. 보안 대시보드 확인
8. AuditLog 확인
9. 모바일 주요 화면 확인
10. 비활성 직원 삭제/익명화 테스트
11. 캘린더 구독 링크 생성
12. 근태 포함 릴리즈라면 출근/퇴근/근태 이력/관리자 근태 화면 확인
