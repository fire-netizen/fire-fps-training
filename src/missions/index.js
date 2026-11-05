import { GearMission } from './m1-gear.js';
import { ExteriorMission } from './m2-exterior.js';
import { SmokeMission } from './m3-search.js';
import { ExtinguishMission } from './m4-extinguish.js';

export const MISSIONS = [
  {
    id: 'm1', no: '01', title: '출동 준비 — 보호장비 착용', dispatch: false, par: 110,
    summary: '방화복·두건·공기호흡기·헬멧·장갑을 올바른 순서로 착용하고 동료와 상호 점검합니다.',
    goal: '개인보호장비(PPE) 착용 순서와 의미',
    call: ['신임 소방사 현장 투입 전 장비 점검 훈련입니다.', '장비 테이블의 보호장비를 올바른 순서로 착용하세요.'],
    objectives: ['6가지 보호장비를 올바른 순서로 착용', '동료 대원과 상호 점검(버디 체크)'],
    tip: '순서를 틀리면 감점됩니다. 오른쪽 목표 목록의 번호가 착용 순서입니다. (기관별 SOP에 따라 세부 순서는 다를 수 있음)',
    create: (G, d) => new GearMission(G, d),
  },
  {
    id: 'm2', no: '02', title: '주택 화재 — 외부 진압', dispatch: true, site: 'siteA', par: 170,
    summary: '화염이 분출하는 3층 건물. 호스를 전개하고 화점의 뿌리를 겨냥해 5곳을 진압합니다.',
    goal: '냉각소화 · 방수 요령 · 용수 관리 · 안전거리',
    call: ['[출동 지령] 3층 연립주택 2·3층 창문에서 화염 분출, 외부로 연소 확대 중.', '인명 피해 없음 확인. 외부 진압 후 지휘관에게 보고 바람.', '진입 금지 — 붕괴·낙하물 위험구역(적색 선) 밖에서 방수할 것.'],
    objectives: ['호스 전개 후 관창 장착 (소방차)', '화점 5곳 진압 (불꽃의 뿌리를 겨냥)', '용수가 부족하면 소화전/소방차에서 보충', '지휘관에게 상황 종료 보고'],
    tip: 'Q 키로 직사/분무를 바꿉니다. 위쪽 화점은 마우스를 위로 올려 조준하세요. 불꽃의 윗부분보다 아랫부분(뿌리)에 맞출수록 효과가 큽니다.',
    create: (G, d) => new ExteriorMission(G, d),
  },
  {
    id: 'm3', no: '03', title: '연기 속 인명검색·구조', dispatch: true, site: 'siteB', par: 190,
    summary: '연기가 가득한 공동주택 실내. 수색하고, 뜨거운 문을 안전하게 열어 요구조자를 구조합니다.',
    goal: '낮은 자세 · 문 개방 절차(백드래프트) · 공기 관리 · 구조',
    call: ['[출동 지령] 5층 아파트 2층 세대 화재, 거주자 1명 미확인.', '현관 진입 후 실내 수색 및 인명구조 바람.', '공기호흡기 잔량에 유의하고 복귀 공기를 확보할 것.'],
    objectives: ['출입구에서 면체 착용 (E)', '거실 수색 후 분필 표시 · 안쪽 방 문 온도 확인', '낮은 자세(C)로 문 옆에서 개방 → 실내 화점 진압', '요구조자를 구조해 출구로 탈출'],
    tip: '연기와 열기는 위로 모입니다. C 키로 자세를 낮추세요. T 키 열화상 카메라는 연기 속 사람과 열원을 보여 줍니다. 건물 앞 현관에서 E 키로 진입합니다.',
    create: (G, d) => new SmokeMission(G, d),
  },
  {
    id: 'm4', no: '04', title: '초기 소화 — 화재 유형별 대응', dispatch: true, site: 'siteC', par: 150,
    summary: '식당에서 동시에 난 일반·유류·전기 화재. 알맞은 소화수단과 소화기 사용법(PASS)을 익힙니다.',
    goal: '화재 분류(A·B·C) · 소화기 사용법(PASS) · 사거리/자세',
    call: ['[출동 지령] 상가 1층 식당 화재 신고, 주방·분전반·쓰레기통에서 각각 발화.', '건물 안 초기 소화 가능 범위. 화재 유형을 구분해 대응 바람.'],
    objectives: ['소화기를 가져와 안전핀을 뽑는다', '화재 3곳을 알맞은 소화수단으로 진압', '출입구에서 상황 종료 보고'],
    tip: '물(옥내소화전)은 일반화재에만 안전합니다. 유류·전기화재에 물을 쓰면 감점과 피해가 생깁니다. 소화기는 3~5m에서 쓸어 뿌리듯 분사하세요.',
    create: (G, d) => new ExtinguishMission(G, d),
  },
];

export const missionById = (id) => MISSIONS.find((m) => m.id === id);
