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

## 변경 — 신체 기록 반영

#44 병합에 맞춰 행 수 비교 목록에 `body_records`를 더했다. 임시 DB 복원 검증은 이 테이블이 생기기 전에 했다.

## 변경 — 2026-11-08 최신 스키마 반영

- `origin/main`을 병합했다. `database/README.md` 충돌은 main의 실행기·파일 규칙을 그대로 두고 백업 절차를 뒤에 붙여 풀었다.
- 확인 쿼리를 [`database/restore-check.sql`](../../database/restore-check.sql)로 옮겼다. 하드코딩한 테이블 목록 대신 `information_schema.tables`에서 모든 테이블을 읽는다. 테이블마다 행 수와 전체 행의 MD5를, 시퀀스마다 마지막 값을 출력한다. 서버의 `deploy/backup.sh`와 같은 `query_to_xml` 방식이다.
  - `database/migrations/`는 Docker 초기화 폴더로 마운트되므로 확인 쿼리를 그 안에 두지 않았다.
- 저장소가 Dev Drive(`D:\github\health-log`)로 옮겨져 OneDrive 동기화 우려는 해당하지 않는다. PC 밖 보관 선택지를 README에 정리했다.

### 검증 — 2026-11-08

임시 PostgreSQL 17(포트 5472, `health_test`)에 `npm run db:migrate`로 001–016(010 없음, 15개)을 적용했다. 지어낸 값만 넣었다(날짜 1983년). 실제 기록은 쓰지 않았다.

- 넣은 데이터: 설정 1, 음식 1(조사 음식 286개 포함 287), 수면 2, 식사 3, 신체 1, 조합 1·항목 1, 습관 2·술 2, 하루 체크 2, 목표 3, 병원 방문 2·시술 2, 약 2.
- `pg_dump --no-owner --no-acl -f` → 새 DB `health_restore`(`-E UTF8 -T template0`)에 `psql -v ON_ERROR_STOP=1 -f`로 복원 → 두 DB에서 `restore-check.sql` 실행 → `diff` 결과 차이 없음.

| 항목                                                    | 결과                                   |
| ------------------------------------------------------- | -------------------------------------- |
| 테이블 15개(`schema_migrations` 포함)                   | 행 수와 내용 해시 모두 같음            |
| 시퀀스 5개(음식 287, 식사 3, 조합 1, 병원 방문 2, 약 2) | 같음                                   |
| 제약·인덱스·사용자 트리거                               | 90개, 26개, 0개로 같음                 |
| 복원 DB의 값 하나를 바꾼 뒤 다시 확인                   | 해당 테이블(`medications`) 해시만 다름 |

- 한글, 따옴표, 이모지가 그대로 돌아왔다(`테스트 간식 '따옴표' 😀`, `가상의원|테스트 방문 '메모'`).
- 복원한 DB에 병원 방문·식사·약을 새로 넣으면 다음 id(3, 4, 3)를 받는다.
- 비어 있지 않은 DB에 다시 복원하면 첫 테이블에서 오류로 멈춘다(종료 코드 3).
- 백업 파일에 `OWNER TO`, `GRANT` 구문이 없다.
- 확인한 뒤 임시 DB와 덤프 파일을 지웠다.

## 남은 일 (이슈를 닫기 전에 필요)

- **Docker로 실제 실행:** `scripts/backup.ps1`과 `database/README.md`의 Docker 명령(PowerShell 비교 명령 포함)은 실행하지 않았다. 사용자가 문서대로 처음부터 복원해 본다.
- **PC 밖 보관 위치:** 사용자가 정한다. 선택지는 `database/README.md`의 "PC 밖 보관"에 있다.
- 서버의 `deploy/backup.sh`는 이번 범위가 아니다. 서버 배포 전에 확인한다.
