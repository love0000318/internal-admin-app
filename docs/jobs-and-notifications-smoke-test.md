# 알림센터와 JobRun 수동 테스트

## 알림센터

- [ ] 직원으로 로그인해 `/notifications`에 접근한다.
  - 기대 결과: 자기 알림만 표시된다.
- [ ] 읽지 않은 알림 필터를 선택한다.
  - 기대 결과: 읽지 않은 알림만 표시된다.
- [ ] 알림을 읽음 처리한다.
  - 기대 결과: 상태가 읽음으로 바뀐다.
- [ ] 모두 읽음 처리를 실행한다.
  - 기대 결과: 현재 사용자의 읽지 않은 알림이 모두 읽음 처리된다.
- [ ] linkUrl이 있는 알림에서 이동을 누른다.
  - 기대 결과: 알림이 읽음 처리되고 해당 링크로 이동한다.

## JobRun

- [ ] OWNER로 `/admin/jobs`에 접근한다.
  - 기대 결과: 자동 작업 관리 화면이 표시된다.
- [ ] MANAGER로 `/admin/jobs`에 접근한다.
  - 기대 결과: 접근이 차단된다.
- [ ] LeaveLedger 정합성 검증 dry-run을 실행한다.
  - 기대 결과: JobRun이 생성되고 상세 화면으로 이동한다.
- [ ] JobRun 상세를 확인한다.
  - 기대 결과: 민감정보 없이 처리 요약이 표시된다.
- [ ] 실패 Job을 강제로 만들 수 있는 테스트 환경에서 실행한다.
  - 기대 결과: JobRun FAILED와 OWNER HIGH priority 알림이 생성된다.

## Cron/Preflight

- [ ] `pnpm preflight`를 실행한다.
  - 기대 결과: Notification/JobRun/LeaveLedger table 접근이 PASS로 표시된다.
- [ ] CRON_SECRET이 없는 production 설정을 점검한다.
  - 기대 결과: production에서는 실패 또는 명확한 경고가 표시된다.
