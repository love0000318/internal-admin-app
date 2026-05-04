# 3차 Production 배포 가이드

이 문서는 3차 릴리즈를 production에 배포하기 전후 확인할 절차를 정리합니다. 실제 secret, token, DB URL은 문서에 기록하지 않습니다.

## 운영 URL

```txt
https://interal-admin-app.vercel.app
```

실제 Vercel project URL이 다르면 운영 URL 기준으로 smoke test와 문서를 업데이트합니다.

## 배포 전 필수 확인

- [ ] `lint`, `typecheck`, `test`, `build`가 통과한다.
- [ ] `db:validate`, `db:generate`가 통과한다.
- [ ] Prisma migration이 최신인지 확인한다.
- [ ] 운영 Neon DB에는 `prisma migrate deploy`만 사용한다.
- [ ] `prisma migrate reset`은 운영 DB에서 절대 사용하지 않는다.
- [ ] 실제 개인정보 엑셀 파일, `.env`, `private/` 파일이 GitHub에 포함되어 있지 않다.
- [ ] Vercel production env가 `.env.production.example`의 필수 항목을 포함한다.
- [ ] token, secret, DATABASE_URL 값은 문서와 로그에 기록하지 않는다.

## 배포 전 명령

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm db:validate
corepack pnpm db:generate
corepack pnpm prisma migrate status
```

## 운영 DB migration

운영 DB에는 다음만 사용합니다.

```powershell
$env:DATABASE_URL='Neon DATABASE_URL'
corepack pnpm prisma migrate deploy
```

금지:

```powershell
corepack pnpm prisma migrate reset
corepack pnpm prisma migrate dev
```

`migrate dev`는 로컬 개발 DB에서만 사용합니다.

## Vercel 배포

Vercel CLI가 연결되어 있으면 다음 명령으로 배포합니다.

```powershell
vercel --prod
```

또는 GitHub 연동 배포를 사용할 수 있습니다.

## 휴가 엑셀 Import 기능 배포 시 추가 확인

휴가 사용내역 엑셀 업로드 기능은 DB migration이 필요합니다. 운영 Neon DB에는 반드시 `prisma migrate deploy`만 사용합니다.

운영 배포 전 확인:

- [ ] 실제 개인정보가 포함된 엑셀 파일이 GitHub에 포함되어 있지 않다.
- [ ] 실제 엑셀 원본이 `public/` 폴더에 저장되어 있지 않다.
- [ ] `.env`, `.env.*`, `private/`, `.xlsx`, `.xls` 파일이 의도치 않게 commit 대상에 포함되어 있지 않다.
- [ ] `/admin/leaves/import`는 OWNER만 접근 가능하다.
- [ ] 최종 반영과 차이 보정에는 Step-up 재인증이 필요하다.
- [ ] UNKNOWN 상태 row는 자동 반영되지 않는다.
- [ ] 휴가취소 row는 used로 차감되지 않는다.
- [ ] 같은 batch는 두 번 반영되지 않는다.

배포 명령 예시:

```powershell
git add .
git commit -m "Finalize leave import production flow"
git push

$env:DATABASE_URL='Neon DATABASE_URL'
corepack pnpm prisma migrate deploy

vercel --prod
```

실제 `Neon DATABASE_URL`, token, secret 값은 문서나 로그에 기록하지 않습니다.

## 휴가 Import 운영 반영 순서

1. 휴가 사용 상세 내역 파일을 먼저 업로드한다.
2. 미리보기에서 직원 매칭, 휴가 유형 매핑, 상태 매핑, UNKNOWN row, 중복 의심 row를 확인한다.
3. Step-up 후 상세 사용 내역을 반영한다.
4. 월별 연차 사용 내역 파일을 업로드한다.
5. 엑셀 잔여 연차와 시스템 잔여 연차를 비교한다.
6. 차이가 있는 직원만 Step-up 후 보정한다.
7. 구성원 휴가 현황, LeaveLedger, AuditLog, reconciliation 결과를 확인한다.

## 배포 후 smoke test

1. production URL 접속
2. OWNER 로그인
3. 직원 초대와 가입
4. 직원 휴가 요청
5. OWNER 휴가 승인
6. 알림센터 확인
7. 보안 대시보드 확인
8. AuditLog 확인
9. 모바일 주요 화면 확인
10. `/admin/leaves/import` 접근과 preview-only 업로드 확인
11. import 적용 후 reconciliation 결과 확인

## rollback 기준

다음 중 하나가 발생하면 직원 오픈 또는 휴가 import 운영 반영을 중단하고 hotfix 또는 rollback을 검토합니다.

- OWNER 로그인 불가
- 직원 초대/가입 불가
- 휴가 요청/승인 불가
- Step-up 없이 고위험 작업 가능
- token/hash/secret 노출
- 운영 DB migration 실패
- 휴가 import가 중복 차감을 만들 가능성
- UNKNOWN row 또는 휴가취소 row가 잘못 차감됨
