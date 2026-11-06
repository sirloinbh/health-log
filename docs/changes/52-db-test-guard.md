# #52 기본 DB 테스트의 전용 DB 안전장치와 DB 문서 표기

- 이슈: [#52](https://github.com/sirloinbh/health-log/issues/52)
- 브랜치: `fix/52-db-test-guard`

## 목적

- `backend/test/db.integration.test.ts`는 `TEST_DATABASE_URL`이 어느 DB를 가리키든 실행됐다. 이 PC에서는 다른 프로젝트의 `study_test`를 대상으로도 통과해, health-log 스키마를 확인하지 않고 통과로 보였다.
- `database/README.md`의 `U&'\\XXXX'`는 백슬래시가 2개였다. 그대로 따라 쓰면 한글 대신 `\AE30` 같은 코드값 글자가 저장된다.

## 변경 — 2026-11-06

- **공용 안전장치** `backend/test/helpers.ts`의 `testDatabaseSkip(url)`
  - DB 이름이 `health_test`면 실행하고, 아니면 `health_test 전용 DB가 아닙니다: <이름 또는 없음>`을 이유로 건너뛴다.
  - 통합 테스트 11개 파일에 복사돼 있던 같은 7줄을 이 함수 호출로 바꿨다. 동작은 같다.
- **기본 DB 테스트** `db.integration.test.ts`: 읽기만 하는 테스트지만 같은 안전장치를 쓴다. `TEST_DATABASE_URL`이 없을 때만 건너뛰던 것을 바꿨다.
- **문서** `database/README.md`: 표기를 `U&'\XXXX'`(백슬래시 1개)로 고치고 `U&'\AE30\D0C0'`(기타) 예를 더했다. 이 파일은 중앙 관리 대상이 아니다(머리 주석도, project-standards 템플릿도 없다). 그래서 이 저장소에서 고쳤고, 중앙 이슈는 만들지 않았다.

## 검증

- 테스트 `backend/test/db-guard.test.ts`(DB 없이 돈다)
  - `health_test`는 실행한다. 쿼리 문자열이 붙은 주소도 같다.
  - `study_test`, `health`, 주소 없음, 빈 문자열은 이름이나 "없음"을 이유로 건너뛴다.
  - `database/README.md`에 `U&'\XXXX'` 규칙이 있고, `U&'` 리터럴 안에 백슬래시 2개가 없다.
- 임시 PostgreSQL 17 클러스터(포트 5472)
  - 같은 서버에서 `U&'\\AE30\\D0C0'`는 `\AE30\D0C0`을, `U&'\AE30\D0C0'`는 `기타`를 돌려줬다. 문서의 설명과 같다.
  - `TEST_DATABASE_URL`을 `other_test`로 두고 `db.integration.test.ts`를 실행했다. 결과는 `# SKIP health_test 전용 DB가 아닙니다: other_test`, 건너뜀 1개였다.
  - `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5472/health_test npm run check`: 통과.
    - 백엔드: 174개 통과, 0개 건너뜀.
    - 프런트엔드: 340개 통과, 2개 건너뜀. 건너뛴 2개는 이 변경과 관계없는 기존 조건부 테스트다.
    - 스킬 검사: 4개 통과.
- `npm run knip`: 통과.

## 리뷰

- **1차:** 꼭 고칠 것은 없었다. 반영한 것은 다음과 같다.
  - `postgres://host/`처럼 DB 이름이 비면 이유가 콜론 뒤에서 비어 보였다 → "없음"으로 보인다.
  - 읽을 수 없는 주소면 Node 오류가 비밀번호를 포함한 값을 그대로 출력했다 → 값을 빼고 실패한다. `db-guard.test.ts`에 두 경우를 더했다(4개 통과).
  - 반영 뒤 `TEST_DATABASE_URL` 없이 lint, 타입, 포맷, 백엔드 테스트(93개 통과, DB 테스트 77개 건너뜀), knip을 다시 돌렸다. `health_test`일 때의 판정은 바뀌지 않았고, DB 실행은 CI에서 확인한다.
  - 반영하지 않은 것: `docs/next-steps/README.md`의 #52 관련 문구. 이 작업에서는 그 파일을 고치지 않기로 했다.
