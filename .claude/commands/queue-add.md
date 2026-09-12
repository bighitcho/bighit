---
description: 소재 큐(data/queue.json)에 유튜브 링크·웹 링크·주제어를 추가한다
argument-hint: "<유튜브 링크 | 웹 링크 | 주제어>"
---

`$ARGUMENTS` 를 `data/queue.json` 에 추가해줘.

- `youtube.com` / `youtu.be` 로 시작하면 `type: "youtube"`
- 그 밖의 `http` 로 시작하면 `type: "link"`
- 링크가 아니면 `type: "topic"`

`id` 는 기존 항목과 겹치지 않게 붙이고 `used: false` 로 넣어줘.
추가한 뒤 큐에 남은 미사용 소재가 몇 개인지 알려줘. 큐가 비면 인스타 트렌드·구글 뉴스에서 자동 발굴로 넘어가.
