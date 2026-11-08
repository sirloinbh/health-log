# 식단·수면·건강 기록 PostgreSQL

PostgreSQL 17. 마이그레이션 원본은 `migrations/NNN_<설명>.sql` 한 곳뿐이다. 규칙과 실행기는 중앙 표준 [DB 마이그레이션 규칙](https://github.com/sirloinbh/project-standards/blob/main/docs/conventions/database.md)을 따른다.

## 적용 방법

실행기(`backend/src/migrate.ts`)가 파일 이름순으로 아직 적용하지 않은 파일만 실행하고, `schema_migrations` 테이블에 파일 이름과 체크섬을 기록한다.

| 상황      | 명령                                                       | 비고                                                                                 |
| --------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 로컬      | `npm run db:migrate`                                       | 저장소 루트에서. `.env`의 `DATABASE_URL`을 쓴다                                      |
| 로컬 확인 | `npm run db:migrate -- --status`                           | 적용됨·대기 목록과 오류만 출력한다. DB를 바꾸지 않는다                               |
| 빈 볼륨   | `docker compose up -d db` 뒤 `npm run db:migrate`          | Docker 초기화가 기록 없이 모든 파일을 먼저 실행하고, 실행기가 다시 적용하며 기록한다 |
| CI        | 공통 CI가 psql로 한 번 적용한 뒤 `npm run db:migrate`      | 다시 실행해도 안전한지 함께 확인된다                                                 |
| 서버 배포 | `deploy/remote-deploy.sh`가 덤프 뒤 `node dist/migrate.js` | 실패하면 새 버전을 시작하지 않고 멈춘다                                              |

기록 테이블이 없는 DB(이전에 psql로 적용한 DB)에서 처음 실행하면 001부터 모두 다시 적용하고 기록한다. 그 뒤로는 새 파일만 실행한다.

`Get-Content … | docker compose exec … psql`처럼 PowerShell 파이프로 SQL을 넘기지 않는다. Windows PowerShell 5.1은 외부 프로그램으로 ASCII를 보내 한글이 `?`로 깨진다. 실행기는 Node가 파일을 UTF-8로 직접 읽는다.

## 파일 규칙

- 이름은 `NNN_<영문 소문자·숫자·밑줄>.sql`이다. 번호는 빈칸 없이 하나씩 늘리고, 병렬 브랜치는 착수 시 번호를 예약한다.
- 모든 마이그레이션은 재실행해도 안전하게 쓴다(`IF NOT EXISTS`, `ON CONFLICT`). 빈 볼륨에서는 같은 파일이 두 번 실행된다.
- 실행기가 파일마다 트랜잭션으로 감싼다. 파일 안에 `BEGIN`·`COMMIT`이나 psql 메타 명령(`\i`, `\set`)을 쓰지 않는다.
- 적용한 파일은 고치지 않는다. 체크섬이 달라져 실행기가 멈춘다. 바꿀 내용은 새 번호의 파일로 추가한다.
- 기존 데이터의 의미를 보존하고, 확인하지 못한 값은 NULL로 둔다. SQL의 한글 리터럴은 가능하면 `U&'\XXXX'` 이스케이프를 쓴다(백슬래시 1개, 예: `U&'\AE30\D0C0'`는 '기타').

## 백업과 복원

백업에는 건강·의료 기록이 그대로 들어 있다. 공개 저장소이므로 절대 커밋하지 않는다. `backups/`는 Git에서 제외되어 있다.

### 백업

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup.ps1
```

`backups/health-log-<날짜>-<시각>.sql`이 생긴다. Docker의 `db` 컨테이너가 떠 있어야 한다.

### 복원

쓰던 DB에 바로 덮어쓰지 않는다. **새 DB에 복원하고 확인한 뒤** 교체한다. 비어 있지 않은 DB에 복원하면 첫 테이블에서 오류로 멈춘다. `<백업 파일>`은 `backups/` 안의 파일 이름이다.

```powershell
docker compose cp backups/<백업 파일> db:/tmp/restore.sql
docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" -E UTF8 -T template0 health_restore'
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d health_restore -q -v ON_ERROR_STOP=1 -f /tmp/restore.sql'
docker compose exec -T db rm -f /tmp/restore.sql
```

`Get-Content`이나 파이프로 넘기지 않는다. 한글이 깨진다.

### 확인

[`restore-check.sql`](restore-check.sql)을 두 DB에서 실행해 결과를 비교한다. 테이블 목록을 스키마에서 읽으므로 테이블이 늘어도 고칠 필요가 없다. 테이블마다 행 수와 전체 행의 해시를, 시퀀스마다 마지막 값을 한 줄로 출력한다. 출력은 영문과 숫자뿐이라 PowerShell로 받아도 깨지지 않는다.

```powershell
docker compose cp database/restore-check.sql db:/tmp/restore-check.sql
foreach ($db in 'health', 'health_restore') { docker compose exec -T db sh -c "psql -U `"`$POSTGRES_USER`" -d $db -At -v ON_ERROR_STOP=1 -f /tmp/restore-check.sql" > "backups/check-$db.txt" }
docker compose exec -T db rm -f /tmp/restore-check.sql
Compare-Object (Get-Content backups/check-health.txt) (Get-Content backups/check-health_restore.txt)
```

마지막 명령이 아무것도 출력하지 않고, 두 파일이 비어 있지 않으면 같다. 확인한 뒤 두 파일을 지운다.

### 교체

결과가 같으면 앱을 멈추고 DB를 바꾼다. 교체 전 DB는 지우지 않고 이름만 바꿔 둔다.

```powershell
docker compose stop api
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "ALTER DATABASE health RENAME TO health_old" -c "ALTER DATABASE health_restore RENAME TO health"'
docker compose start api
```

### PC 밖 보관

백업 파일이 PC에만 있으면 디스크 고장이나 분실 때 함께 잃는다. 어디에 둘지는 사용자가 정한다.

| 선택지                          | 장점                                                           | 주의                                                          |
| ------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| 외장 디스크·USB                 | 인터넷에 올라가지 않는다                                       | 직접 복사해야 하고, 분실에 대비해 BitLocker 등으로 암호화한다 |
| 개인 클라우드 폴더(OneDrive 등) | 자동으로 PC 밖에 복사된다                                      | 의료 기록이 클라우드에 올라간다. 암호화한 압축 파일로 올린다  |
| 서버 백업(`deploy/backup.sh`)   | 서버 DB를 매일 백업하고(버킷을 정하면 S3에도) 매주 복원해 본다 | 서버에 배포한 DB만 대상이다. 로컬 DB는 포함되지 않는다        |
