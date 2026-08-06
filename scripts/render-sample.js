import { renderCardNews } from "../src/render/cardRenderer.js";

const sampleDeck = {
  themeName: process.argv[2] || "gray",
  handle: "@my_instagram",
  slides: [
    {
      type: "cover",
      date: "2026.07.04",
      eyebrow: "AI가 자동으로 정리해주는",
      headline: "매일 아침\n경제 뉴스 브리핑",
      subheadline: "청년 미래적금: 3년 만에 목돈 만드는 정부 지원, 나도 받을 수 있을까?",
    },
    {
      type: "content",
      index: 1,
      label: "문제",
      heading: "적금만 붓고 있지 않나요?",
      body: "월급을 일반 적금에만 넣으면\n정부 지원금을 그냥 놓치게 됩니다.",
    },
    {
      type: "content",
      index: 2,
      label: "원인",
      heading: "몰라서 못 받는 지원금",
      body: "청년 미래적금은 신청 기간이 정해져 있어\n모르고 지나가는 사람이 대부분입니다.",
    },
    {
      type: "content",
      index: 3,
      label: "해결 1",
      heading: "가입 조건부터 확인하세요",
      body: "만 19~34세, 개인소득 7,500만원 이하,\n가구소득 중위 180% 이하면 신청할 수 있습니다.",
    },
    {
      type: "content",
      index: 4,
      label: "해결 2",
      heading: "매달 자동이체로 세팅",
      body: "매달 일정 금액을 저축하면\n정부가 지원금을 추가로 얹어줍니다.",
    },
    {
      type: "content",
      index: 5,
      label: "정리",
      heading: "오늘 할 일 3가지",
      body: "1. 내 소득 조건 확인하기\n2. 은행 앱에서 신청 기간 알림 설정\n3. 자동이체 금액 정하기",
    },
    {
      type: "outro",
      heading: "나중에 다시 보려면 저장하세요",
      subheading: "매일 아침 8시, 경제 뉴스로 찾아올게요",
    },
  ],
};

const files = await renderCardNews(sampleDeck, "./out/sample");
console.log("생성된 파일:", files);
