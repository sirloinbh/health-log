# #5 포트를 중앙 표준(슬롯 03)으로 바꾸고 AGENTS 고유 규칙 분리

- 이슈: https://github.com/sirloinbh/health-log/issues/5
- 중앙 추적 이슈: https://github.com/sirloinbh/project-standards/issues/99

## 목적

- 8개 앱의 포트가 서로 겹치지 않도록 중앙 레지스트리가 다시 배정한 포트를 적용한다(project-standards ADR-0006).
- 중앙 표준 첫 동기화가 AGENTS.md를 공통 지침으로 바꾸기 전에, 이 프로젝트의 PR 리뷰·병합 규칙을 AGENTS.project.md로 옮겨 보존한다.

## 변경

| 종류              | 이전  | 이후      |
| ----------------- | ----- | --------- |
| 웹                | 8093  | 8103      |
| API               | 3013  | 3103      |
| Vite              | 5183  | 5203      |
| 호스트 DB         | 55443 | 15403     |
| e2e API·웹 (예약) | 없음  | 3203·5303 |

- 포트를 바꾼 파일: `.env.example`, `README.md`, `backend/Dockerfile`, `backend/src/server.ts`, `compose.yaml`, `frontend/nginx.conf`, `frontend/vite.config.ts`, `backend/test/dev-ports.test.ts`, `AGENTS.md`
- `AGENTS.md`의 절차 5번(자동 코드 리뷰·병합 규칙)을 문구 그대로 `AGENTS.project.md`의 "작업 절차"로 옮기고, `AGENTS.md`는 그 파일을 반드시 읽게 했다.
- `docs/changes/`, `docs/daily/`, `docs/next-steps/`의 과거 기록은 당시 상태라서 고치지 않았다.

## 사용자가 할 일

- 로컬 `.env`의 `DATABASE_URL` 포트를 `55443`에서 `15403`로, `PORT`를 `3013`에서 `3103`로 바꾼다. `.env`는 커밋하지 않는다.

## 검증

- 2026-10-22: 결과는 PR 본문에 적는다.
