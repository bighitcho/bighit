# AGENTS.md

이 저장소의 작업 규칙·스택·제약은 **[CLAUDE.md](./CLAUDE.md)** 에 정리되어 있습니다.
Codex를 포함한 모든 코딩 에이전트는 작업 시작 전에 그 파일을 먼저 읽어주세요.

빠른 참고:

- 코드를 고친 뒤에는 항상 `npm run check` 를 실행합니다 (API 키 없이 전략→검수→렌더 전 구간 확인).
- `src/quality/checklist.js` 의 검수 규칙은 우회하지 않습니다. 게시 차단은 의도된 동작입니다.
- 콘텐츠 관련 설정은 `data/brand-config.json` 한 곳에서만 바꿉니다.
- 인스타그램 관련 작업은 메타 공식 API만 사용합니다.
