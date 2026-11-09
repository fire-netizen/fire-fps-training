// 소화약제 목록 (5번 임무: 소화약제 선택 실습) — 키 1~6
export const AGENTS = [
  { id: 'water', name: '물', color: '#6fc3ff', visual: 'hose', rate: 5, info: '냉각소화 (옥내소화전·관창)' },
  { id: 'powder', name: 'ABC 분말', color: '#f1efe6', visual: 'ext', rate: 5, info: '억제·질식 (분말소화기)' },
  { id: 'co2', name: '이산화탄소', color: '#cfe6ff', visual: 'ext', rate: 6, info: '질식·냉각 (CO₂ 소화기)' },
  { id: 'foam', name: '포(폼)', color: '#efe3b8', visual: 'ext', rate: 5, info: '질식·냉각 (포소화약제)' },
  { id: 'sand', name: '팽창질석·마른모래', color: '#c4a46a', visual: 'ext', rate: 7, info: '질식 (금속화재용)' },
  { id: 'kagent', name: 'K급(강화액)', color: '#c9ef8f', visual: 'ext', rate: 5, info: '비누화·냉각 (주방용)' },
];
export const AGENT_IDS = AGENTS.map((a) => a.id);
