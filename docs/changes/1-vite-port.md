# #1 Vite 개발 포트 충돌 수정

- 이슈: [#1](https://github.com/sirloinbh/health-log/issues/1)
- 브랜치: `fix/1-vite-port`

## 문제

Vite 개발 서버 포트 `5173`이 workout-memo의 Vite 기본 포트와 같았다. 두 앱의 개발 서버를 동시에 띄우면 `strictPort` 때문에 health-log가 시작하지 않는다.

## 변경

- `frontend/vite.config.ts`: 포트 `5183`. `strictPort`와 `/api` → `127.0.0.1:3013` 프록시는 유지했다.
- README·AGENTS.md의 포트 안내를 갱신했다.
- `backend/test/dev-ports.test.ts`(신규): Vite 포트가 5183이고 다른 개인 앱 개발 포트(5172~5178, workout-memo 5173)와 겹치지 않는지, `strictPort`와 API 프록시를 검사한다. frontend 소스가 없는 backend 하위 저장소에서는 건너뛴다.

## 검증

- 회귀 테스트: 수정 전 **0 pass / 1 fail**(actual 5173, expected 5183), 수정 후 **1 pass / 0 fail**.
- 실제 실행: health-log API(3013)와 Vite를 띄워 `http://localhost:5183/`가 앱 HTML(`<title>식단·수면·건강 기록</title>`)을 반환하고, `http://localhost:5183/api/health` 프록시가 `{"ok":true,"service":"health-log",…}`를 반환함을 확인했다. 5173에는 health-log가 바인딩하지 않았다.
- 전용 테스트 DB `health_log_test`로 `npm run check`: **exit 0**. 앱·DB 9 pass / 0 fail / 0 skip(새 포트 테스트 포함), 스킬 4 pass, 포맷·lint·타입·빌드 통과.
