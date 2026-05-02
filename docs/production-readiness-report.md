# Production Readiness Report

작성일: 2026-05-01

## 1. 배포 가능 여부 요약

현재 상태는 **제한적으로 운영 배포 가능**입니다.

앱 코드, 테스트, production build, Prisma schema validate/generate는 통과했습니다. 다만 실제 운영 배포 전에는 운영 PostgreSQL을 준비하고 `pnpm db:deploy`, `pnpm db:seed`, `pnpm preflight`를 실제 DB 연결 상태에서 통과시켜야 합니다.

## 2. 추천 배포 방식

1순위는 **Vercel + Managed PostgreSQL**입니다.

- Next.js App Router와 가장 잘 맞습니다.
- 서버 운영 부담이 작습니다.
- DB는 Supabase, Neon, Railway, Render PostgreSQL 등을 사용할 수 있습니다.

회사 내부 서버를 선호하거나 네트워크 통제가 중요하면 Docker/VPS 방식을 선택할 수 있습니다. 이 경우 `Dockerfile`과 `docker-compose.example.yml`을 참고하세요.

## 3. 현재 구현된 기능

- OWNER 초대 링크 가입
- 전화번호/비밀번호 로그인
- 로그아웃과 세션 관리
- 대시보드
- 조직/팀/직원/초대 관리
- 휴가 정책/회사 휴일/직원별 휴가 조정
- 내 휴가 현황과 휴가 요청/철회
- OWNER/LEAD 휴가 승인/반려/승인 취소
- 감사 로그 조회와 민감정보 마스킹
- 역할별 권한 guard

## 4. 운영 전 필수 환경변수

- `DATABASE_URL`
- `APP_BASE_URL`
- `NODE_ENV=production`
- `APP_SECRET`
- `SESSION_SECRET`
- `TOKEN_SECRET`
- `INVITATION_TOKEN_SECRET`
- `INVITATION_EXPIRES_IN_DAYS`
- `SESSION_EXPIRES_IN_DAYS`
- `SEED_OWNER_EMAIL`
- `SEED_OWNER_NAME`
- `SEED_OWNER_TITLE`

선택:

- `COOKIE_DOMAIN`
- `EMAIL_PROVIDER`
- `EMAIL_FROM`
- `IDENTITY_VERIFICATION_PROVIDER`
- `LOG_LEVEL`

## 5. Migration/seed 절차

```bash
pnpm db:generate
pnpm db:validate
pnpm db:deploy
pnpm db:seed
pnpm preflight
```

`pnpm db:seed`는 OWNER 초대 URL을 콘솔에 한 번 출력합니다. DB에는 token hash만 저장됩니다.

## 6. OWNER 최초 가입 절차

1. seed 출력의 OWNER 초대 URL에 접속합니다.
2. 대표 이름, 전화번호, 비밀번호를 입력합니다.
3. 가입 완료 후 `/dashboard`로 이동합니다.
4. 같은 초대 링크는 재사용할 수 없습니다.

## 7. Smoke test 절차

[smoke-test.md](smoke-test.md)를 따릅니다.

핵심:

- OWNER 가입
- 팀 생성
- 직원 초대/가입
- 휴가 요청
- 휴가 승인
- 권한 차단
- AuditLog 확인

## 8. 보안 점검 결과

- production cookie secure 적용 구조 확인
- httpOnly/sameSite lax 이상 적용 구조 확인
- production mock provider 차단 구조 확인
- invitation/session token 원문 DB 저장 금지
- password 원문 DB 저장 금지
- AuditLog 민감정보 마스킹
- 관리자 route와 server action 권한 guard 적용

## 9. 테스트/빌드 결과

최근 검증 결과:

- `pnpm install`: 통과
- `pnpm db:validate`: 통과
- `pnpm db:generate`: 통과
- `pnpm lint`: 통과
- `pnpm typecheck`: 통과
- `pnpm test`: 통과
- `pnpm test:unit`: 통과
- `pnpm test:integration`: 통과
- `pnpm e2e`: 통과
- `pnpm build`: 통과

환경 한계:

- 현재 로컬 환경에는 Docker CLI가 없고 PostgreSQL이 실행 중이지 않아 `pnpm db:status`, `pnpm db:seed`, `pnpm preflight`의 DB 연결 항목은 실패했습니다.

## 10. 아직 남은 위험 요소

- 실제 운영 DB migration/seed를 아직 수행하지 않았습니다.
- 실제 이메일 발송이 없어 초대 링크 전달은 수동입니다.
- 실제 본인인증 provider가 없어 production 운영 절차가 필요합니다.
- Playwright 브라우저 E2E는 향후 보강이 필요합니다.

## 10-1. 운영 시작 전 남은 위험 요소

### 실제 이메일 발송 미연동

- 위험 요소: 초대 링크를 운영자가 직접 복사해 전달해야 합니다.
- 영향도: 중간
- 현재 대응: 관리자 화면에 초대 링크를 표시하고 수동 전달합니다.
- 운영 전 반드시 해결해야 하는지: 아니오
- 2차 개발로 넘겨도 되는지: 예

### 실제 본인인증 미연동

- 위험 요소: production에서 mock provider는 차단되며, 실제 업체 연동 전에는 운영 절차로 신원 확인이 필요합니다.
- 영향도: 높음
- 현재 대응: 초대된 이름/전화번호 확인과 운영자 검수 절차를 사용합니다.
- 운영 전 반드시 해결해야 하는지: 회사 보안 정책에 따라 결정
- 2차 개발로 넘겨도 되는지: 제한적으로 가능

### 파일 업로드 스토리지 미연동

- 위험 요소: 병가/예비군/경조사 증빙은 파일 업로드가 아니라 URL 입력 중심입니다.
- 영향도: 중간
- 현재 대응: 첨부 URL 필드와 정책상 증빙 필요 여부를 사용합니다.
- 운영 전 반드시 해결해야 하는지: 아니오
- 2차 개발로 넘겨도 되는지: 예

### 휴가 정책의 법무/노무 검토 필요

- 위험 요소: 연차 계산은 내부 관리 참고값이며 회사 취업규칙과 최신 법령 검토가 필요합니다.
- 영향도: 높음
- 현재 대응: LeaveAdjustment로 수동 조정 가능하게 설계했습니다.
- 운영 전 반드시 해결해야 하는지: 예, 최소 정책 검토 필요
- 2차 개발로 넘겨도 되는지: 계산 자동화 고도화는 가능

### 운영 DB 백업 정책 필요

- 위험 요소: 사용자, 휴가, 감사 로그 데이터 손실 가능성
- 영향도: 높음
- 현재 대응: 백업/복구 가이드 작성
- 운영 전 반드시 해결해야 하는지: 예
- 2차 개발로 넘겨도 되는지: 아니오

### 관리자 비밀번호 분실 대응 절차 필요

- 위험 요소: OWNER가 로그인하지 못하면 운영이 중단될 수 있습니다.
- 영향도: 높음
- 현재 대응: 마지막 OWNER 보호, 운영자 복구 절차 문서화
- 운영 전 반드시 해결해야 하는지: 절차 문서 확인 필요
- 2차 개발로 넘겨도 되는지: 비밀번호 재설정 기능은 2차 가능

### 초대 링크 유출 위험

- 위험 요소: PENDING 초대 링크가 외부에 노출될 수 있습니다.
- 영향도: 높음
- 현재 대응: token hash 저장, 만료 시간, 1회 사용, 취소/재발급 기능
- 운영 전 반드시 해결해야 하는지: 운영자 교육 필요
- 2차 개발로 넘겨도 되는지: 이메일/알림 고도화는 가능

### 모바일 화면 최적화 부족 가능성

- 위험 요소: 모바일에서 일부 표 화면 사용성이 떨어질 수 있습니다.
- 영향도: 중간
- 현재 대응: MVP는 데스크톱 운영 중심으로 검수합니다.
- 운영 전 반드시 해결해야 하는지: 아니오
- 2차 개발로 넘겨도 되는지: 예

### 대량 직원 데이터 성능 검증 부족 가능성

- 위험 요소: 직원 수가 많아질 때 목록/필터 성능 저하 가능성
- 영향도: 중간
- 현재 대응: query parameter 기반 필터 구조를 사용합니다.
- 운영 전 반드시 해결해야 하는지: 초기 소규모 운영이면 아니오
- 2차 개발로 넘겨도 되는지: 예

## 11. 실제 운영 시 주의사항

- OWNER 초대 URL은 유출되지 않게 전달합니다.
- raw token은 다시 조회할 수 없습니다.
- DB migration 전 백업합니다.
- AuditLog를 임의 삭제하지 않습니다.
- 직원 삭제는 비활성화로 처리합니다.

## 12. 2차 개발 추천 기능

- 실제 이메일 발송 연동
- 실제 본인인증 연동
- 비밀번호 재설정
- 파일 업로드 스토리지
- 알림 기능
- 휴가 캘린더
- 관리자 통계 대시보드
- 업무 Task 관리
- 회의 일정/회의록
- 성과 관리
- 프로젝트 이슈 관리

## 최종 판단

**제한적으로 운영 배포 가능**

코드와 배포 준비는 운영 가능한 수준입니다. 실제 서비스 오픈 전 운영 PostgreSQL에서 migration, seed, preflight, smoke test를 완료해야 합니다.
