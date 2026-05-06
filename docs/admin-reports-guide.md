# 관리자 리포트 가이드

## 범위

`/admin/reports`는 운영 리포트 허브입니다.

- OWNER는 전체 회사 범위의 휴가, 직원, 데이터 이상, 보안/감사 요약을 볼 수 있습니다.
- LEAD는 담당 팀과 하위 팀 범위의 휴가/직원 요약만 볼 수 있습니다.
- MANAGER와 EXTERNAL_PARTNER는 관리자 리포트에 접근할 수 없습니다.

LEAD 범위 제한은 UI 필터가 아니라 서버 query 단계에서 적용합니다. 클라이언트에 전체 직원 데이터를 내려놓고 필터링하지 않습니다.

## 리포트 섹션

- 휴가 리포트: 승인 완료, 승인 대기, 사용 완료, 소멸 장부 이벤트, 휴가 사용/장부/지급 상세
- 근태 리포트: 현재 안정 커밋에는 근태 월별 마감/상세 모델이 없으므로 TODO 상태로 표시
- 직원 리포트: 전체, ACTIVE, INVITED, DEACTIVATED, 대기 초대
- 데이터 이상 리포트: 팀 미지정 직원, 담당 팀 없는 LEAD, 과도한 조정값, 1년 미만/연차 장부 검토 필요 항목
- 보안/감사 리포트: OWNER만 볼 수 있으며 HIGH/CRITICAL AuditLog와 차단 이벤트를 요약

## Export 보안

CSV export는 OWNER만 사용할 수 있으며 `REPORT_EXPORT` Step-up 재인증이 필요합니다.

CSV에는 다음 값을 포함하지 않습니다.

- password/passwordHash
- token/tokenHash/codeHash
- 주민등록번호/외국인등록번호
- 계좌번호
- 주소, 가족정보, 급여정보
- fileKey, privatePath, attachment private URL
- secret, DATABASE_URL

CSV injection 방어를 위해 `=`, `+`, `-`, `@`로 시작하는 셀 값은 `'` prefix로 escape합니다.

## AuditLog

CSV export 성공 시 `REPORT_EXPORTED` AuditLog를 남깁니다.

metadata에는 reportType, filterSummary, rowCount, exportedAt 같은 운영 추적 정보만 저장합니다. CSV 본문과 민감정보 원문은 저장하지 않습니다.

Step-up 없이 export하면 `REPORT_EXPORT_STEP_UP_REQUIRED`를 남기고 차단합니다.

## 휴가 계산 회귀 보호

관리자 리포트는 기존 안정 휴가 계산 helper를 수정하지 않습니다.

보존 대상:

- 근로 기간 1년 미만 직원에게만 회계연도 기준 비례 연차 적용
- 1년 이상 직원 기존 계산값 불변
- 양태식 케이스 잔여 10.5일 유지
- 장기근속자에게 월차 11일/입사 1년차 연차 15일 반복 합산 금지
- 사용 완료와 조정 분리

리포트에서 이상 징후가 보이면 자동 수정하지 않고 `jobs:audit-fix-leave-integrity -- --dry-run --year=YYYY`로 REVIEW_REQUIRED 항목을 확인합니다.

## 모바일 확인

- 요약 카드는 1열 또는 2열로 줄바꿈됩니다.
- 필터는 모바일에서 한 줄에 하나씩 표시됩니다.
- 상세 리포트 표는 table wrapper 내부에서만 가로 스크롤됩니다.
- export 버튼은 OWNER 화면에서만 표시됩니다.
