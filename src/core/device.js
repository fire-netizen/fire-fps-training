// 터치(스마트폰·태블릿) 기기 판별.
// 주소 끝에 ?touch=1 을 붙이면 강제로 터치 모드(테스트용), ?touch=0 은 해제.
// 판정 순서: 모바일 UA → 주 입력장치가 손가락(pointer: coarse) → 터치 지점이 있고 마우스류(fine) 포인터가 없음
//   · 터치스크린 노트북(마우스 있음)은 PC 조작으로 남도록 any-pointer: fine 이면 터치로 보지 않습니다.
function detect() {
  try {
    const q = new URLSearchParams(location.search).get('touch');
    if (q === '1') return true;
    if (q === '0') return false;
    const ua = navigator.userAgent || '';
    const mp = navigator.maxTouchPoints || 0;
    const mobileUA = /Android|iPhone|iPad|iPod|Mobile|KAKAOTALK/i.test(ua) || (/Macintosh/.test(ua) && mp > 1);
    if (mobileUA) return true;
    const mm = (s) => { try { return !!(window.matchMedia && matchMedia(s).matches); } catch (e) { return false; } };
    if (mm('(pointer: coarse)')) return true;
    if (mp > 0 && !mm('(any-pointer: fine)')) return true;
  } catch (e) { /* 판정 실패 시 PC로 간주 */ }
  return false;
}
export const IS_TOUCH = detect();
