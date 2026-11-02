# #42 백업과 복원 확인

- 이슈: [#42](https://github.com/sirloinbh/health-log/issues/42)
- 브랜치: `chore/42-backup-restore`

## 목적

수면·식단 기록은 잃어버리면 다시 만들 수 없다. 백업 파일로 데이터가 그대로 돌아오는지 확인하고, 복원 방법을 문서로 남긴다.

## 변경 — 2026-11-02

- `database/README.md`에 백업, 복원, 확인, 교체 절차를 추가했다.

## 검증

Docker 데몬이 `500 Internal Server Error`로 응답하지 않아 `scripts/backup.ps1`은 실행하지 못했다. 대신 임시 PostgreSQL 17 클러스터(포트 55902)에서 같은 `pg_dump` 옵션(`--no-owner --no-acl -f`)으로 확인했다. 기존 로컬 DB는 건드리지 않았다.

테스트 데이터는 지어낸 값이다. 마이그레이션 전체(조사 음식 95개 포함)에 수면 2건, 식사 3건, 음식 1건, 설정 1건을 더했다.

| 항목            | 복원 전                  | 복원 후              |
| --------------- | ------------------------ | -------------------- |
| `app_settings`  | 1행                      | 1행, 내용 해시 동일  |
| `foods`         | 96행                     | 96행, 내용 해시 동일 |
| `meal_entries`  | 3행                      | 3행, 내용 해시 동일  |
| `sleep_records` | 2행                      | 2행, 내용 해시 동일  |
| 시퀀스 값       | foods 96, meal_entries 3 | 동일                 |
| 제약·인덱스     | 34개, 6개                | 동일                 |

- 한글, 따옴표, 이모지가 그대로 돌아왔다(`테스트 간식 '따옴표' 😀`).
- 복원한 DB에 새 식사를 넣으면 다음 id(4)를 받아 정상 동작한다.
- 비어 있지 않은 DB에 다시 복원하면 첫 테이블에서 오류로 멈춘다(종료 코드 3). 기존 데이터와 섞이지 않는다.
- 백업 파일에 `OWNER TO`, `GRANT` 구문이 없다.
- `git check-ignore -v backups/x.sql`: `.gitignore:9:backups/`로 제외됨을 확인했다.
- `npm run check`: PR에 적는다.

## 남은 일 (이슈를 닫기 전에 필요)

- **Docker로 실제 실행:** `scripts/backup.ps1`과 `database/README.md`의 Docker 명령은 아직 실행하지 못했다. 데몬이 정상일 때 문서대로 처음부터 복원해 본다.
- **PC 밖 보관 위치:** 사용자가 정한다. 이 저장소는 OneDrive 폴더 안에 있어 `backups/`도 OneDrive로 동기화될 수 있다. 의료 기록이 클라우드에 올라가는 셈이므로 동기화 여부를 함께 확인한다.
- 서버의 `deploy/backup.sh`는 이번 범위가 아니다. 서버 배포 전에 확인한다.
