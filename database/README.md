# 식단·수면·건강 기록 PostgreSQL

PostgreSQL 17. 마이그레이션 원본은 `migrations/NNN_<설명>.sql` 한 곳뿐이다. 빈 Docker 볼륨에서는 최초 실행 시 모든 파일이 이름순으로 자동 적용되고, CI도 모든 파일을 순서대로 적용한다.

기존 DB에는 새 마이그레이션을 컨테이너에 마운트된 파일로 직접 적용한다.

```powershell
docker compose exec -T db psql -U health -d health -v ON_ERROR_STOP=1 -f /docker-entrypoint-initdb.d/NNN_<설명>.sql
```

`Get-Content … | docker compose exec … psql`처럼 PowerShell 파이프로 넘기지 않는다. Windows PowerShell 5.1은 외부 프로그램으로 ASCII를 보내 한글이 `?`로 깨진다.

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

두 DB에서 같은 명령을 실행해 테이블별 행 수를 비교한다. 기록 테이블이 늘면 목록에 더한다.

```powershell
foreach ($db in 'health', 'health_restore') { docker compose exec -T db sh -c "psql -U `"`$POSTGRES_USER`" -d $db -At -c `"SELECT 'foods', count(*) FROM foods UNION ALL SELECT 'sleep_records', count(*) FROM sleep_records UNION ALL SELECT 'meal_entries', count(*) FROM meal_entries ORDER BY 1`"" }
```

### 교체

수치가 같으면 앱을 멈추고 DB를 바꾼다. 교체 전 DB는 지우지 않고 이름만 바꿔 둔다.

```powershell
docker compose stop api
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "ALTER DATABASE health RENAME TO health_old" -c "ALTER DATABASE health_restore RENAME TO health"'
docker compose start api
```

## 마이그레이션 규칙

규칙: 모든 마이그레이션은 재실행해도 안전하게 쓴다. 병렬 브랜치는 착수 시 번호를 예약한다. 기존 데이터의 의미를 보존하고, 확인하지 못한 값은 NULL로 둔다. SQL의 한글 리터럴은 가능하면 `U&'\\XXXX'` 이스케이프를 쓴다.
