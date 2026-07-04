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
      heading: "무슨 상품인가요?",
      body: "만 19~34세 청년이 매달 일정 금액을 저축하면\n정부가 지원금을 추가로 얹어주는 적금 상품입니다.",
    },
    {
      type: "content",
      index: 2,
      heading: "가입 조건은?",
      body: "개인소득 7,500만원 이하, 가구소득 중위 180% 이하면\n신청 가능합니다. 매년 접수 기간이 정해져 있어요.",
    },
    {
      type: "outro",
      heading: "다음엔 또 뭘 만들까요?",
      subheading: "매일 아침 8시, 경제 뉴스로 찾아올게요",
    },
  ],
};

const files = await renderCardNews(sampleDeck, "./out/sample");
console.log("생성된 파일:", files);
