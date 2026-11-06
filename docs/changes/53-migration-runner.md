# #53 배포 스크립트가 실행할 마이그레이션 실행기

- 이슈: [#53](https://github.com/sirloinbh/health-log/issues/53)
- 브랜치: `chore/53-migration-runner`

## 목적

`deploy/remote-deploy.sh`는 배포 중 `node dist/migrate.js`를 실행한다. 이 저장소에는 그 파일이 없어서 첫 서버 배포가 `set -e`로 이 단계에서 멈출 것이었다. 배포 스크립트가 실행할 실행기를 들인다.

## 정한 것

이슈의 추천안대로 다른 앱과 중앙 스캐폴드를 확인한 뒤, 새로 만들지 않고 중앙 표준을 그대로 들였다. 사용자 확인 없이 정했고 이슈 댓글에 남겼다.

- **확인한 것:** 중앙 [DB 마이그레이션 규칙](https://github.com/sirloinbh/project-standards/blob/main/docs/conventions/database.md)과 스캐폴드 `scaffold/app/backend/src/migrations.ts`, `migrate.ts`(2026-11-05 `origin/main` 기준). life-journal, plan-routine, study-log, workout-memo가 같은 실행기를 쓴다.
- **방식:** `schema_migrations(name, checksum, applied_at)`에 적용 기록을 남기고, 기록에 없는 파일만 이름순으로 실행한다.
  - 파일마다 한 트랜잭션이다. 실패하면 그 파일만 되돌리고 멈춘다.
  - 기록된 파일이 없어졌거나 내용이 바뀌었거나, 기록된 마지막 파일보다 앞선 번호의 새 파일이 있으면 아무것도 적용하지 않고 실패한다.
  - advisory lock(고정 키 `581_003`)으로 동시에 한 실행기만 적용한다.
- **새 파일:** 010 이후 파일도 이름 형식만 맞으면 따로 등록하지 않아도 적용된다. 이 PR은 마이그레이션 파일을 추가하지 않는다.
- **스캐폴드와 다른 점:** `migrations.ts`의 BOM 문자를 `﻿` 이스케이프로 썼다(life-journal과 같음). `migrate.ts`는 배포 사용법 주석만 더했다.
- **`deploy/*`:** 고칠 점이 없었다. 배포 스크립트가 마운트하는 `/database/migrations`는 이미지 안 `/app/dist/migrate.js`에서 `../../database/migrations/`로 찾는 경로와 같다.

## 변경 — 2026-11-06

- **실행기** `backend/src/migrations.ts`, `backend/src/migrate.ts`: 위 방식. `npm run build`가 `backend/dist/migrate.js`를 만든다.
- **명령** 루트·`backend/package.json`에 `db:migrate`를 추가했다. 공통 CI는 이 스크립트가 있으면 psql로 한 번 적용한 뒤 실행기를 실행한다.
- **문서** `database/README.md`의 적용 방법을 실행기 기준으로 바꿨다. `docs/project-setup.md` 6.3절의 기존 DB 적용 방법도 맞췄다.

## 검증

- 테스트
  - `backend/test/migrations.test.ts`(스캐폴드와 같음): 체크섬이 줄바꿈·BOM을 무시하는지, 파일 이름 형식과 번호 중복, 대기 목록과 바뀐·없어진·앞선 번호 파일 오류를 DB 없이 검사한다.
  - `backend/test/migrations.integration.test.ts`: `health_test`일 때만 돈다. 테스트마다 빈 스키마를 만들어 쓰고 지우므로 `health_test`의 테이블과 병렬로 도는 다른 통합 테스트에 닿지 않는다.
    - 빈 스키마에 모든 파일이 순서대로 적용되고 기록된다.
    - 하루 체크 한 줄을 넣은 뒤 다시 실행하면 적용할 파일이 없고, 모든 테이블의 모든 행이 그대로다(음식 시드 포함).
    - 기록 테이블 없이 이미 적용된 DB(빈 Docker 볼륨)에서는 모든 파일을 한 번 더 적용하며 기록하고, 데이터는 그대로다.
    - 바뀐 파일은 아무것도 실행하기 전에 멈춘다. 뒤에 붙인 새 파일은 그 파일만 실행되고, 실패한 파일은 혼자 되돌려지며 이름이 오류에 나온다.
    - `migrate.ts` 명령을 별도 프로세스로 두 번 실행하면 "적용 완료: 001…009" 뒤 "적용할 마이그레이션이 없습니다."를 출력하고, `--status`는 모두 "적용됨"이다.
- 임시 PostgreSQL 17 클러스터(포트 5472)
  - `health_test`에 CI처럼 psql로 9개를 적용한 뒤 실행기를 두 번 실행했다. 첫 번째는 9개를 기록하며 다시 적용했고, 두 번째는 적용할 파일이 없었다.
  - `npm run build` 뒤 `backend/dist/migrate.js`를 새 빈 DB에 두 번 실행했다. 9개 적용 뒤 "적용할 마이그레이션이 없습니다.", 종료 코드 0. 확인 후 그 DB를 지웠다.
  - 연결할 수 없는 주소로 실행하면 종료 코드 1로 끝난다(배포가 멈춘다).
- `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5472/health_test npm run check`: 통과.
  - 백엔드: 170개 통과, 0개 건너뜀.
  - 프런트엔드: 323개 통과, 2개 건너뜀. 건너뛴 2개는 이 변경과 관계없는 기존 조건부 테스트다.
  - 스킬 검사: 4개 통과.
- `npm run knip`: 통과.

## 못 한 것

- 실제 서버 배포(`deploy/remote-deploy.sh`)로는 실행하지 않았다. 지금은 서버에 배포하지 않는다.
- Docker 이미지 안에서 `node dist/migrate.js`를 직접 실행해 보지는 않았다. 경로는 위처럼 코드로 확인했고, CI가 이미지를 빌드한다.
