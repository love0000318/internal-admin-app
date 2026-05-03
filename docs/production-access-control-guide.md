# Production 접근권한 통제 가이드

## 핵심 원칙

앱 내부 권한 체계는 production DB, Vercel 환경변수, GitHub 배포 권한을 가진 내부자의 모든 행위를 완전히 막을 수 없습니다.

따라서 앱 보안과 별도로 GitHub, Vercel, Neon 접근권한 통제와 정기 감사가 반드시 필요합니다.

## GitHub

- main branch protection을 활성화합니다.
- production 배포 브랜치는 PR review를 필수로 합니다.
- force push를 금지합니다.
- GitHub admin 권한자는 최소화합니다.
- CODEOWNERS를 도입해 보안/DB/배포 파일 변경에 리뷰어를 지정하는 것을 권장합니다.
- 외주/직원 퇴사 시 GitHub access를 즉시 회수합니다.
- secret, `.env`, DB URL은 repository, issue, PR, 채팅에 평문으로 공유하지 않습니다.

## Vercel

- project owner/admin 권한자를 최소화합니다.
- production deploy 권한자를 제한합니다.
- environment variable 조회/수정 권한자를 최소화합니다.
- preview와 production 환경변수를 분리합니다.
- production secret은 개인 메신저로 공유하지 않습니다.
- secret 유출 또는 담당자 변경 시 즉시 rotation합니다.
- Vercel team member 권한을 정기 리뷰합니다.

## Neon DB

- Neon DB admin 접근자를 최소화합니다.
- production DB 직접 수정은 원칙적으로 금지합니다.
- 운영 DB 변경은 migration으로만 수행합니다.
- migration 담당자를 지정합니다.
- 운영 DB에서 `migrate reset`을 절대 사용하지 않습니다.
- migration 전 백업 또는 restore 가능 상태를 확인합니다.
- query console 접근 권한을 제한합니다.
- DB password와 connection string을 주기적으로 rotation합니다.

## 운영 절차

- OWNER 권한 부여는 2인 승인 절차를 권장합니다.
- AuditLog를 주간 검토합니다.
- `OWNER_ROLE_GRANTED`, `OWNER_ROLE_REVOKED`, `REPORT_EXPORTED`, `AUDIT_LOG_EXPORTED`, `INVITATION_REISSUED` 이벤트를 정기 확인합니다.
- 첨부파일 다운로드 로그를 정기 확인합니다.
- 초대 재발급 로그를 정기 확인합니다.
- 보안 사고 발생 시 활성 세션 revoke, secret rotation, Vercel/Neon/GitHub 접근권한 회수를 함께 수행합니다.

## 직원 입퇴사 / 외주 종료

- 퇴사자 또는 종료된 외주 인력의 GitHub 접근권한을 제거합니다.
- Vercel team 권한을 제거합니다.
- Neon DB 접근권한을 제거합니다.
- 공유된 secret이 있었으면 rotation합니다.
- 앱 계정은 DEACTIVATED 처리하고 활성 세션을 폐기합니다.

## 보안 사고 대응

1. 보안 대시보드에서 CRITICAL/HIGH 이벤트를 확인합니다.
2. 영향 계정의 세션을 폐기합니다.
3. 관련 secret을 rotation합니다.
4. GitHub/Vercel/Neon 접근 이력을 확인합니다.
5. 필요한 경우 production deploy를 중단하고 DB backup/restore 가능성을 확인합니다.
6. 사고 내용과 조치 내역을 별도 운영 기록으로 남깁니다.

## 후속 권장

- OWNER 권한 부여 2인 승인
- MFA
- SSO
- IP allowlist
- Vercel Firewall/WAF
- 관리자 권한 정기 리뷰
- 보안 이벤트 외부 알림
