# Internal Ops 업무 관리 MVP

## 범위

- OWNER 전용 테스트 기능입니다.
- ClickUp Task는 Internal Ops DB의 mirror로 단방향 수집합니다.
- ClickUp Docs/회의록은 DB 구조와 service skeleton, 준비 상태 UI까지만 포함합니다.
- Internal Ops에서 수정한 내부 상태, 팀 배정, 작업일, 메모, 변경 요청은 ClickUp에 반영하지 않습니다.

## 설정

아래 값은 환경변수 또는 추후 관리자 설정으로 주입합니다. 실제 값은 코드, 로그, 문서에 기록하지 않습니다.

- `CLICKUP_API_TOKEN`
- `CLICKUP_TEAM_ID`
- `CLICKUP_SPACE_ID`
- `CLICKUP_FOLDER_ID`
- `CLICKUP_LIST_ID`

필수 값이 없으면 OWNER 화면은 “ClickUp 연결 정보가 아직 설정되지 않았습니다.” 또는 “동기화 준비 중입니다.” 상태를 표시하고 서비스는 중단되지 않습니다.

## 데이터 구조

- `ClickUpTaskMirror`: ClickUp Task 원본의 최소 mirror입니다.
- `WorkTaskLocalState`: Internal Ops 내부 상태, 담당 팀, 작업일, 메모를 저장합니다.
- `ClickUpDocMirror`: ClickUp Docs/회의록 mirror를 위한 구조입니다.
- `WorkTaskDocumentLink`: Task와 Docs 연결 구조입니다.
- `WorkTaskChangeRequest`: 회의록 기반 변경 요청/수정 사항 기록입니다.
- `WorkTaskActivity`: OWNER 화면에서 확인할 내부 이력입니다.

## 운영 주의

- ClickUp 쓰기, 댓글 생성, 상태 변경, 문서 수정은 구현하지 않았습니다.
- 알림은 Internal Ops `Notification`의 in-app 기록만 사용합니다.
- AuditLog metadata에는 secret, token, raw 문서 내용, 민감한 메모 원문을 저장하지 않습니다.
- migration 적용 전 운영 DB 반영 승인이 필요합니다.
