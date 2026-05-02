# 인사정보 원장 import 가이드

## 목적

업로드된 인사정보 엑셀을 기반으로 초대 전 직원 사전 프로필을 만들고, 직원이 초대 링크로 가입할 때 기본 인사정보를 자동 생성합니다.

## 파일 위치

엑셀 원본은 반드시 안전한 비공개 경로에 둡니다.

```bash
private/imports/employee-master.xlsx
```

금지 사항:

- `public/` 폴더에 넣지 않습니다.
- git에 커밋하지 않습니다.
- import 중 주민등록번호, 계좌번호, 가족 주민등록번호를 콘솔에 출력하지 않습니다.

## 실행 명령

```bash
pnpm hr:import private/imports/employee-master.xlsx
```

실행 전 확인:

- `.env`에 `DATABASE_URL`이 있어야 합니다.
- `.env`에 `ENCRYPTION_SECRET`이 있어야 합니다.
- migration이 적용되어 있어야 합니다.

## 지원하는 시트

필수 시트:

- `인사·개인·계약·지급·특이사항`

선택 시트:

- `가족`
- `경력`
- `학력`
- `언어`
- `자격증`
- `프로젝트·기술`
- `교육`

## 필수 컬럼

본문 시트에서 다음 컬럼은 필수입니다.

- `이름`
- `이메일`

이메일은 사전 프로필 식별과 초대 연결 기준입니다. 같은 이메일을 다시 import하면 기존 사전 프로필을 갱신합니다.

## 자동 연결 방식

1. import script가 `EmployeePrejoinProfile`을 생성하거나 갱신합니다.
2. OWNER가 직원 초대 시 같은 이메일을 입력하면 초대가 사전 프로필과 연결됩니다.
3. 직원이 초대 링크로 가입하면 `User`, `EmployeeProfile`, `EmployeeSensitiveProfile`, `EmploymentProfile` 및 경력/학력/자격/교육 records가 생성됩니다.
4. 가입 후 직원은 `/profile/confirm`에서 자동 입력된 정보를 확인합니다.

## 개인정보와 민감정보 처리

- 주민등록번호/외국인등록번호와 계좌번호는 DB 저장 전에 암호화합니다.
- 화면에서는 기본적으로 마스킹합니다.
- AuditLog에는 원문 값을 저장하지 않고 `changedFields`, `prejoinProfileId`, `requestId` 같은 추적 정보만 남깁니다.
- 엑셀 원본 전체 row를 JSON으로 저장하지 않습니다.

## 직원이 직접 수정할 수 있는 항목

- 회사 내 이름
- 영문 이름
- 개인 이메일
- 휴대전화번호
- 집주소
- 우편번호

## 승인 요청이 필요한 항목

- 주민등록번호/외국인등록번호
- 급여계좌
- 은행명
- 예금주
- 장애인/국가유공자 여부
- 체류자격
- 세금/공제 관련 정보

직원이 변경 요청을 제출하면 OWNER가 `/admin/profile-change-requests`에서 승인 또는 반려합니다.

## OWNER만 수정해야 하는 항목

- 사번
- 회사 이메일
- 재직상태
- role
- 소속 조직
- 직급/직위/직책
- 입사일/퇴직일
- 계약유형
- 임금/급여 계약 정보
- 징계 정보

## 실패 시 확인할 것

- 파일이 `private/imports/` 아래에 있는지 확인합니다.
- 필수 시트명이 정확한지 확인합니다.
- `이메일`, `이름` 컬럼이 비어 있지 않은지 확인합니다.
- `.env`의 `ENCRYPTION_SECRET`이 설정되어 있는지 확인합니다.
- `pnpm db:status`로 migration 상태를 확인합니다.
