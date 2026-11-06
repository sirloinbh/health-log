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
- 기존 데이터의 의미를 보존하고, 확인하지 못한 값은 NULL로 둔다. SQL의 한글 리터럴은 가능하면 `U&'\\XXXX'` 이스케이프를 쓴다.
