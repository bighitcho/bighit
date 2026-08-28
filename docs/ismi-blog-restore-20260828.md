# ISMI Office 블로그 자동발행 복구 + 서버형 전환 작업 기록 (2026-08-28)

> 세션: claude/ismi-blog-auto-publish-restore-vetlai
> 대상 시스템: bighitcho/blog-automation (발행 엔진, GitHub Actions), bighitcho/ismi-office (관제 대시보드, Vercel + Supabase)

## 1. 중단 원인 (확정)

- 정상 작동하던 경로: ISMI Office(콘텐츠 지시판) → `content_channel_controls`/`content_publish_jobs` →
  `blog-automation`의 **10분 cron GitHub Actions**(`monetization_scheduler.yml`) → `scheduler_dispatch.py`
  → `publish_slot.py`(네이버 리서치 → Gemini 집필 → 품질 게이트 → 채널별 썸네일 → Blogger API 실제 발행).
- 2026-08-27 09:23 KST 커밋 `d37ef19` *"stop unintended automatic publishing and cancel stale campaign runs"* 이
  **cron 트리거를 제거**하고 기본값을 dry-run으로 변경 → 이후 어떤 슬롯도 실제 발행되지 않음.
- 2026-08-28 20:42 KST에 14개 채널(21:06~23:34 KST, 일 5건)이 설정되고 작업이 큐에 들어갔지만,
  실행 주체(cron)가 없어 **전부 queued/processing 상태로만 남음**. 12개 Blogger 블로그 + 3개 WordPress
  사이트 모두 이날 실제 발행 0건으로 교차 확인.

## 2. 복구 내용 (기존 경로 유지)

- `monetization_scheduler.yml`: `*/10 * * * *` cron 복원, schedule/dispatch 실행은 실발행,
  push는 dry-run 유지. dry-run이 scheduler_state를 오염시키지 않도록 상태 저장 조건 보강.
- `publish_slot.py`: `--publish-at` 추가 — Blogger 네이티브 예약발행(초안 insert → publishDate publish).
- `restore_dispatch.py` + `restore_publish.yml`: 기존 publish_slot 파이프라인을 그대로 부르는
  복구 디스패처 (즉시발행 + URL 200 검증 / 채널별 겹치지 않는 랜덤 분 예약 + SCHEDULED 검증).
- `renew_cloud.make_thumb`: 채널 고유 레이아웃은 유지하면서 게시물별 variant(톤·액센트·프레임) 순환 추가.

## 3. 서버형 전환 (대표 PC 불필요)

- **인증 서버화**: `lib/blogger-server.ts` — refresh_token으로 서버에서 access_token 재발급.
  자격은 Vercel 환경변수 또는 Supabase `google_calendar_connections`(id='blogger') 행에
  AES-256-GCM 암호화 저장(service_role 전용 RLS). GitHub Secrets의 TOKEN_JSON을
  `migrate_blogger_token.yml` → `/api/integrations/blogger/ingest`로 1회 이관 —
  ingest는 전달된 토큰으로 실제 블로그 목록을 조회해 관리 blogId 소유가 증명될 때만 저장.
  token.json 원본은 GitHub/DB 어디에도 평문 저장하지 않고, 로그에도 출력하지 않음.
- **발행 함수**: `publishBloggerPost(channelKey, {title, html, scheduledAt, slug, labels})` —
  기존 blogger_slug 방식 그대로 영문 slug 초안 insert → publish(예약 포함) → 한글 제목 patch.
- **서버 워커**: `lib/publish-worker.ts` + `/api/cron/publish-worker` —
  due job 원자적 선점(queued→processing CAS), 35분 경과 작업은 발행하지 않고 failed 처리,
  재시도 최대 2회, published는 API 성공 + post id + 실제 URL 3조건 충족 시에만 기록.
  트리거: 10분 cron GitHub Actions의 워커 핑 + Vercel cron + 대시보드 즉시발행 시 인라인 실행.
- **이중발행 방지**: schedule-feed에 `server_publisher` 플래그 — 서버가 자격을 보유하면
  GitHub 디스패처는 Blogger 채널을 건너뜀.
- **대시보드**: 작업별 실패 사유 표시 + 재발행/취소 버튼 추가 (기존 지시판 UI 유지).

## 4. 오늘 실제 발행 결과

(최종 결과표는 세션 보고 참조 — reports/restore_publish_immediate_latest.json,
reports/restore_publish_schedule_latest.json 에 기계 판독 가능한 원본이 커밋됨)

## 5. 남은 운영 확인 사항

- GitHub cron은 재등록 후 첫 실행까지 지연될 수 있음 — schedule 이벤트 재개 확인 필요.
- mydooba-wp / sunyhill-wp 채널은 quality_status=needs_review 로 남아 있어 지시판 실행이
  차단됨 — 검토 후 audited 로 바꿔야 지시판에서 실행 가능.
- WordPress 썸네일(대표이미지)은 기존 경로에 없던 기능 — 서버형 visual profile 확장 대상.
