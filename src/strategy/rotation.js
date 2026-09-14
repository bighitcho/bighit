// 게시물마다 "무슨 목적 / 어떤 후킹 / 어떤 설득 원리"를 자동으로 돌려쓰는 로테이션 엔진.
// 같은 형식만 반복하면 도달이 정체되고, 같은 문구 패턴 반복은 스팸 신호가 되기 때문에
// history.json 의 누적 기록을 보고 다음 게시물의 전략을 결정한다.

/**
 * 콘텐츠 비율 4:3:2:1 법칙.
 * 10개 중 도달형 4 / 저장형 3 / 공감형 2 / 전환형 1 비율이 되도록 배분한다.
 */
export const CONTENT_GOALS = [
  {
    key: "reach",
    label: "도달형",
    weight: 4,
    brief: "신규 유입 담당. 아직 나를 모르는 사람이 봐도 바로 이해되는 넓은 공감 주제로, 후킹을 가장 세게 잡는다.",
    cta: "저장",
  },
  {
    key: "save",
    label: "저장형",
    weight: 3,
    brief: "정보·꿀팁 담당. 체크리스트·수치·순서처럼 '나중에 다시 꺼내 볼' 형식으로 정리해 저장률을 노린다.",
    cta: "저장",
  },
  {
    key: "empathy",
    label: "공감형",
    weight: 2,
    brief: "신뢰·댓글 담당. 겪어본 사람만 아는 시행착오와 감정을 구체적으로 짚어 댓글을 유도한다.",
    cta: "댓글",
  },
  {
    key: "convert",
    label: "전환형",
    weight: 1,
    brief: "리드 확보 담당. 무료 자료가 왜 필요한지 납득시키고 댓글 키워드로 자료를 받아가게 만든다.",
    cta: "댓글키워드",
  },
];

/**
 * 첫 3초에 스크롤을 멈추게 하는 후킹 5유형.
 * 매 게시물마다 순서대로 돌려써서 표지 카피가 한 패턴으로 굳는 것을 막는다.
 */
export const HOOK_TYPES = [
  { key: "problem", label: "문제 제기형", pattern: "아직도 OO 하고 계세요?", note: "독자가 지금 하고 있는 방식을 콕 찌른다" },
  { key: "result", label: "결과 먼저형", pattern: "OO 했더니 △△ 됐습니다", note: "결과를 먼저 보여주고 과정을 궁금하게 만든다" },
  { key: "reversal", label: "반전형", pattern: "OO 하지 마세요, 오히려 △△", note: "상식을 뒤집어 기대를 위반한다" },
  { key: "list", label: "리스트형", pattern: "OO 하는 3가지 방법", note: "개수를 못 박아 읽는 부담을 없앤다" },
  { key: "secret", label: "비밀 공개형", pattern: "아무도 안 알려주는 OO", note: "정보 격차를 건드린다" },
];

/**
 * 카피에 하나씩 얹는 설득 원리.
 * 자동 생성 콘텐츠가 사실로 뒷받침할 수 없는 원리(희소성·마감 임박·FOMO 같은 인위적 긴급성)는
 * 없는 사실을 지어내게 만들기 때문에 의도적으로 제외했다.
 */
export const PERSUASION_PRINCIPLES = [
  { key: "curiosity-gap", label: "호기심 갭", how: "정보를 다 주지 않고 빈틈을 남겨 다음 장을 넘기게 만든다" },
  { key: "specific-number", label: "구체적 숫자", how: "두루뭉술한 표현 대신 확인 가능한 숫자를 쓴다" },
  { key: "question", label: "질문형 카피", how: "독자가 속으로 답하게 만드는 질문을 던진다" },
  { key: "pattern-break", label: "패턴 깨기", how: "다들 맞다고 믿는 상식을 먼저 부정한다" },
  { key: "one-person", label: "한 사람 지목", how: "'모두'가 아니라 한 사람의 상황을 지목해 말한다" },
  { key: "two-sided", label: "단점 먼저 공개", how: "한계를 먼저 밝혀 나머지 주장의 신뢰도를 올린다" },
  { key: "concreteness", label: "구체성", how: "추상적 약속 대신 실제 과정·절차를 보여준다" },
  { key: "small-ask", label: "작은 약속", how: "큰 행동 대신 댓글·저장 같은 작은 행동부터 요청한다" },
  { key: "reciprocity", label: "상호성", how: "먼저 쓸 만한 것을 주고 나서 다음 행동을 제안한다" },
  { key: "because", label: "이유 제시", how: "요청에 '왜냐하면'을 붙여 납득시킨다" },
  { key: "before-after", label: "Before / After", how: "바뀌기 전과 후를 나란히 놓아 변화를 눈으로 보여준다" },
  { key: "future-self", label: "미래 상상", how: "기능이 아니라 적용한 뒤 달라질 모습을 묘사한다" },
  { key: "story", label: "스토리텔링", how: "정보를 사람이 겪은 이야기 형태로 전달한다" },
  { key: "identity", label: "정체성 소구", how: "'이런 사람이라면'으로 독자의 정체성에 말을 건다" },
];

function pickGoalByRatio(goalCounts) {
  // 누적 비율이 목표 비율(4:3:2:1)에서 가장 많이 뒤처진 유형을 고른다.
  const totalWeight = CONTENT_GOALS.reduce((sum, g) => sum + g.weight, 0);
  const totalPosts = CONTENT_GOALS.reduce((sum, g) => sum + (goalCounts[g.key] || 0), 0);

  let best = CONTENT_GOALS[0];
  let bestDeficit = -Infinity;
  for (const goal of CONTENT_GOALS) {
    const expected = ((totalPosts + 1) * goal.weight) / totalWeight;
    const deficit = expected - (goalCounts[goal.key] || 0);
    if (deficit > bestDeficit) {
      bestDeficit = deficit;
      best = goal;
    }
  }
  return best;
}

/**
 * 다음 게시물의 전략을 결정한다.
 * @param {{posts?: Array<{contentGoal?: string, hookType?: string, principle?: string}>}} history
 */
export function planNextPost(history) {
  const posts = Array.isArray(history?.posts) ? history.posts : [];

  const goalCounts = {};
  for (const post of posts) {
    if (post.contentGoal) goalCounts[post.contentGoal] = (goalCounts[post.contentGoal] || 0) + 1;
  }
  const goal = pickGoalByRatio(goalCounts);

  // 후킹·설득 원리는 최근에 쓴 것을 피해서 순환시킨다.
  const recentHooks = posts.slice(-3).map((p) => p.hookType);
  const hook = HOOK_TYPES.find((h) => !recentHooks.includes(h.key)) || HOOK_TYPES[posts.length % HOOK_TYPES.length];

  const recentPrinciples = posts.slice(-5).map((p) => p.principle);
  const principle =
    PERSUASION_PRINCIPLES.find((p) => !recentPrinciples.includes(p.key)) ||
    PERSUASION_PRINCIPLES[posts.length % PERSUASION_PRINCIPLES.length];

  return { goal, hook, principle };
}
