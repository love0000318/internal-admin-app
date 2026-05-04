# Production 접근권한 통제 가이드

앱 내부 권한 체계는 production DB, Vercel 환경변수, GitHub 배포 권한을 가진 내부자의 모든 행위를 완전히 막을 수 없다. 따라서 앱 보안과 별도로 인프라 접근권한 통제와 정기 감사가 반드시 필요하다.

## GitHub

- main branch protection을 활성화한다.
- production 배포 브랜치에는 PR review를 필수로 한다.
- force push를 금지한다.
- GitHub admin 권한자는 최소 인원으로 제한한다.
- CODEOWNERS를 사용해 보안, DB, 배포 관련 파일 변경에 리뷰어를 지정하는 것을 권장한다.
- 외주/퇴사자/권한 변경 대상자의 GitHub access를 즉시 회수한다.
- secret, `.env`, DB URL, token은 repository, issue, PR, chat에 평문으로 공유하지 않는다.

## Vercel

- project owner/admin 권한자는 최소화한다.
- production deploy 권한자를 제한한다.
- environment variable 조회/수정 권한자를 최소화한다.
- preview와 production 환경변수를 분리한다.
- production secret은 개인 메신저로 공유하지 않는다.
- secret 유출 또는 담당자 변경 시 즉시 rotation한다.
- Vercel team member 권한을 정기 리뷰한다.

## Neon DB

- Neon DB admin 접근자를 최소화한다.
- production DB 직접 수정은 원칙적으로 금지한다.
- 운영 DB 변경은 migration으로만 수행한다.
- migration 담당자를 지정한다.
- 운영 DB에서 `prisma migrate reset`을 절대 사용하지 않는다.
- migration 전 백업 또는 restore 가능 상태를 확인한다.
- query console 접근 권한을 제한한다.
- DB password와 connection string은 주기적으로 rotation한다.

## 운영 감사

- OWNER 권한 부여/제거 이력을 정기 확인한다.
- Step-up 실패, 로그인 차단, 비인가 접근 차단을 정기 확인한다.
- 리포트 export, AuditLog export, 첨부파일 다운로드 이력을 정기 확인한다.
- 초대 재발급과 OWNER 초대 재발급 이력을 정기 확인한다.
- 보안 사고 시 전체 세션 revoke, secret rotation, DB 접근권한 회수를 우선 수행한다.

## 3차 RC 주의사항

- 2026-05-04 기준 현재 작업 환경에서는 Vercel CLI가 없어 production env 목록을 확인하지 못했다.
- 운영자는 Vercel dashboard에서 `.env.production.example`의 필수 env 이름과 production 적용 여부를 직접 확인해야 한다.
- 운영 DB에는 `prisma migrate deploy`만 사용한다.
