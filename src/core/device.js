// 터치(스마트폰·태블릿) 기기 판별. 주소 끝에 ?touch=1 을 붙이면 강제로 터치 모드(테스트용), ?touch=0 은 해제.
const q = new URLSearchParams(location.search).get('touch');
export const IS_TOUCH = q === '1' ? true : q === '0' ? false : !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
