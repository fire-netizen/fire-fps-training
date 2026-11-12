// HUD · 모달 · 퀴즈 · 결과 화면 (DOM)
import { RANKS, LEVEL_EXP } from '../data/progress.js';
import { fmtTime, shuffle } from '../core/util.js';
import { IS_TOUCH } from '../core/device.js';
import { APP_VERSION } from '../core/version.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.getElementById(id);

export class UI {
  constructor(root, G) {
    this.G = G;
    root.insertAdjacentHTML('beforeend', `
      <div class="fx" id="fxHurt"></div>
      <div class="fx" id="fxSmoke"></div>
      <div class="fx" id="fxTic"><div class="tic-frame"><span>TIC · 열화상</span><span id="ticTemp">--°C</span></div></div>
      <div id="hud" class="hidden">
        <div class="card" id="pcard">
          <div class="who"><div class="badge" id="rankBadge">사</div>
            <div><div class="pname" id="pname">-</div><div class="prank"><span id="prank">소방사</span> · Lv.<b id="plv">1</b></div></div></div>
          <div class="bar exp"><i id="expBar"></i></div>
          <div class="vital"><label>기력</label><div class="bar hp"><i id="hpBar"></i></div><span id="hpTxt"></span></div>
          <div class="vital" id="airRow"><label>공기</label><div class="bar air"><i id="airBar"></i></div><span id="airTxt"></span></div>
          <div class="vital" id="agentRow"><label id="agentLabel">용수</label><div class="bar water"><i id="agentBar"></i></div><span id="agentTxt"></span></div>
          <div class="vital" id="survRow"><label>요구조자</label><div class="bar surv"><i id="survBar"></i></div><span id="survTxt"></span></div>
        </div>
        <div class="card" id="mission">
          <div class="mhead"><b id="mTimer">00:00</b></div>
          <ul id="objList"></ul>
          <div id="passBox" class="hidden"></div>
          <div id="notes"></div>
        </div>
        <div class="card hidden" id="hint"></div>
        <div id="tools">
          <div class="slot" id="slotHose"><kbd>1</kbd><span>관창</span><small id="modeTxt">직사</small></div>
          <div class="slot" id="slotExt"><kbd>2</kbd><span>소화기</span><small id="pinTxt">안전핀</small></div>
          <div class="slot hidden" id="slotLamp"><kbd>L</kbd><span>헬멧 랜턴</span><small id="lampTxt">OFF</small></div>
          <div class="slot" id="slotTic"><kbd>T</kbd><span>열화상</span><small id="ticTxt">OFF</small></div>
        </div>
        <div id="keys"><span><kbd>WASD</kbd> 이동</span><span><kbd>Shift</kbd> 달리기</span><span><kbd>C</kbd> 자세 낮춤</span><span><kbd>E</kbd> 상호작용</span><span><kbd>클릭</kbd>/<kbd>Space</kbd> 방수</span><span><kbd>Q</kbd> 직사/분무</span><span><kbd>Esc</kbd> 일시정지</span></div>
        <div id="cross"><i></i></div>
        <div id="prompt" class="hidden"><div class="pk">E</div><div class="pt" id="promptTxt"></div><div class="pbar"><i id="promptBar"></i></div></div>
        <div id="marker" class="hidden"><div class="mk"></div><div class="ml" id="markerTxt"></div></div>
        <div id="banner" class="hidden"></div>
      </div>
      <div id="modal" class="hidden"></div>
      <div id="fade"></div>`);
    this.hud = $('hud');
    this.modal = $('modal');
    this.fadeEl = $('fade');
    this.last = {};
    addEventListener('resize', () => this.fit());
    addEventListener('orientationchange', () => setTimeout(() => this.fit(), 250));
  }

  // ───────── HUD ─────────
  show(v) { this.hud.classList.toggle('hidden', !v); }

  // 게임 중 안내문구: 화면 가운데가 아니라 우측 상단 패널의 목표 아래에 쌓음 (PC 3개 · 모바일 1개, 몇 초 뒤 사라짐)
  toast(msg, kind = 'info') {
    const box = $('notes');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    box.append(el);
    const max = IS_TOUCH ? 1 : 3;
    while (box.children.length > max) box.firstChild.remove();
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4800);
  }

  // 힌트 패널(팝업이 열려 있는 동안에는 숨김)
  setHint(html) {
    this._hint = html || null;
    const h = $('hint');
    if (h) h.innerHTML = html || '';
  }

  banner(text, ms = 2600) {
    const b = $('banner');
    b.textContent = text;
    b.classList.remove('hidden');
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    clearTimeout(this._bt);
    this._bt = setTimeout(() => b.classList.add('hidden'), ms);
  }

  setPrompt(text, progress = null) {
    const p = $('prompt');
    if (!text) { p.classList.add('hidden'); return; }
    p.classList.remove('hidden');
    $('promptTxt').textContent = text;
    $('promptBar').style.width = progress == null ? '0%' : `${Math.round(progress * 100)}%`;
    p.classList.toggle('hold', progress != null && progress > 0);
  }

  setMarker(x, y, label, dist) {
    const m = $('marker');
    if (x == null) { m.classList.add('hidden'); return; }
    m.classList.remove('hidden');
    m.style.transform = `translate(${x}px, ${y}px)`;
    const t = `${label}${dist != null ? ` · ${Math.round(dist)}m` : ''}`;
    if (this.last.marker !== t) { $('markerTxt').textContent = t; this.last.marker = t; }
  }

  setObjectives(title, list) { // 임무 제목은 HUD에 표시하지 않음(맨 윗줄은 경과시간만)
    this._objs = list;
    this.renderObjectives();
  }

  renderObjectives() {
    const ul = $('objList');
    ul.innerHTML = (this._objs || []).map((o) => `<li class="${o.done ? 'done' : ''} ${o.active ? 'active' : ''}"><i>${o.done ? '✔' : o.active ? '▶' : '○'}</i><span>${esc(o.text)}${o.count != null ? ` <b>${o.count}</b>` : ''}</span></li>`).join('');
  }

  setPass(steps) {
    const b = $('passBox');
    if (!steps) { b.classList.add('hidden'); return; }
    b.classList.remove('hidden');
    b.innerHTML = `<div class="pass-t">소화기 사용법 (PASS)</div>` + steps.map((s) => `<div class="ps ${s.done ? 'done' : ''}"><b>${esc(s.k)}</b> ${esc(s.t)}</div>`).join('');
  }

  update(d) {
    const P = d.player, st = P.stats, pr = d.progress;
    const set = (id, v) => { if (this.last[id] !== v) { $(id).textContent = v; this.last[id] = v; } };
    const w = (id, pct) => { const v = Math.max(0, Math.min(100, pct)).toFixed(1); if (this.last[id + 'w'] !== v) { $(id).style.width = v + '%'; this.last[id + 'w'] = v; } };
    set('pname', pr.name); set('prank', pr.rank); set('plv', pr.level);
    set('rankBadge', pr.rank.slice(2));
    const need = pr.expToNext;
    w('expBar', need ? (pr.expInLevel / need) * 100 : 100);
    w('hpBar', (st.hp / st.maxHp) * 100); set('hpTxt', `${Math.ceil(st.hp)}`);
    $('hpBar').parentElement.classList.toggle('low', st.hp / st.maxHp < 0.3);
    $('airRow').classList.toggle('hidden', !d.showAir);
    w('airBar', st.air); set('airTxt', `${Math.ceil(st.air)}%`);
    $('airBar').parentElement.classList.toggle('low', st.air < 30);
    const tool = P.tool;
    $('agentRow').classList.toggle('hidden', !(tool === 'hose' || tool === 'ext' || tool === 'spray' || (tool === 'agent' && P.agentSel)));
    if (tool === 'agent') { set('agentLabel', '약제'); w('agentBar', st.ext); set('agentTxt', `${Math.ceil(st.ext)}%`); }
    else if (tool === 'spray') { set('agentLabel', '퇴치제'); w('agentBar', st.ext); set('agentTxt', `${Math.ceil(st.ext)}%`); }
    else if (tool === 'ext') { set('agentLabel', '소화약제'); w('agentBar', st.ext); set('agentTxt', `${Math.ceil(st.ext)}%`); }
    else { set('agentLabel', '용수'); w('agentBar', st.water); set('agentTxt', `${Math.ceil(st.water)}%`); }
    $('survRow').classList.toggle('hidden', d.survivor == null);
    if (d.survivor != null) { w('survBar', d.survivor); set('survTxt', `${Math.ceil(d.survivor)}%`); $('survBar').parentElement.classList.toggle('low', d.survivor < 35); }
    set('mTimer', fmtTime(d.time));
    $('hint').classList.toggle('hidden', !this._hint || !this.modal.classList.contains('hidden'));
    $('slotLamp').classList.toggle('hidden', !P.allowed.lamp);
    $('slotLamp').classList.toggle('on', !!P.lamp);
    set('lampTxt', P.lamp ? 'ON' : 'OFF');
    $('slotHose').classList.toggle('on', tool === 'hose' || tool === 'spray');
    if (this._spr !== !!P.allowed.spray) { this._spr = !!P.allowed.spray; $('slotHose').querySelector('span').textContent = this._spr ? '벌 퇴치 스프레이' : '관창'; $('slotHose').querySelector('small').classList.toggle('hidden', this._spr); }
    $('slotHose').classList.toggle('off', P.allowed.spray ? false : (!P.allowed.hose || !P.hoseReady));
    $('slotExt').classList.toggle('on', tool === 'ext');
    $('slotExt').classList.toggle('off', !P.allowed.ext);
    $('slotTic').classList.toggle('on', P.tic);
    $('slotTic').classList.toggle('off', !P.allowed.tic);
    set('modeTxt', P.mode === 'jet' ? '직사' : '분무');
    set('pinTxt', P.pin ? '안전핀 ●' : '해제 ✔');
    set('ticTxt', P.tic ? 'ON' : 'OFF');
    $('tools').classList.toggle('hidden', !(P.allowed.hose || P.allowed.ext || P.allowed.tic || P.allowed.spray || P.allowed.lamp));
    $('cross').style.display = (tool === 'hose' || tool === 'ext' || tool === 'agent' || tool === 'spray') && d.crosshair ? 'block' : 'none';
    // 화면 효과
    $('fxHurt').style.opacity = String(Math.min(0.85, P.hurtFlash));
    $('fxSmoke').style.opacity = String(d.smoke || 0);
    $('fxTic').style.display = P.tic ? 'block' : 'none';
    if (P.tic) set('ticTemp', `${(d.ticTemp || 24).toFixed(0)}°C`);
  }

  // 화면 번쩍임 (폭발·감전 등)
  flash(color = '#fff', ms = 600) {
    if (!this.flashEl) {
      this.flashEl = document.createElement('div');
      this.flashEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:60;opacity:0';
      document.body.append(this.flashEl);
    }
    const f = this.flashEl;
    f.style.transition = 'none'; f.style.background = color; f.style.opacity = '0.9';
    void f.offsetWidth;
    f.style.transition = `opacity ${ms}ms ease-out`; f.style.opacity = '0';
  }

  // ───────── 페이드 ─────────
  fade(on, ms = 450) {
    this.fadeEl.style.transition = `opacity ${ms}ms ease`;
    this.fadeEl.style.opacity = on ? '1' : '0';
    this.fadeEl.style.pointerEvents = on ? 'all' : 'none';
    return new Promise((r) => setTimeout(r, ms + 30));
  }

  // ───────── 모달 공통 ─────────
  open(html, cls = '') {
    this.modal.className = cls;
    this.modal.innerHTML = `<div class="sheet"><div class="sin">${html}</div></div>`;
    this.G.input.active = false;
    this.G.input.unlock();
    this.fit();
  }

  close() { this.modal.className = 'hidden'; this.modal.innerHTML = ''; }

  // 팝업이 스크롤 없이 한 화면에 들어오게: 높이를 재서 화면보다 크면 CSS zoom으로 축소(최소 50%)
  // 화면이 바뀔 때(열릴 때·퀴즈 해설 표시·창 크기 변경)마다 다시 호출
  fit() {
    const sheet = this.modal.querySelector('.sheet');
    if (!sheet || this.modal.classList.contains('hidden')) return;
    const sin = sheet.firstElementChild;
    const px = (v) => parseFloat(v) || 0;
    const useZoom = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('zoom', '1');
    const reset = () => { sin.style.zoom = ''; sin.style.transform = ''; sin.style.transformOrigin = ''; sheet.style.height = ''; };
    reset();
    const mc = getComputedStyle(this.modal), sc = getComputedStyle(sheet);
    const avail = this.modal.clientHeight - px(mc.paddingTop) - px(mc.paddingBottom) - px(sc.paddingTop) - px(sc.paddingBottom) - px(sc.borderTopWidth) - px(sc.borderBottomWidth);
    const natural = sin.scrollHeight;
    if (!(avail > 0) || natural <= avail + 1) return;
    let z = Math.max(0.5, avail / natural);
    const apply = (k) => {
      if (useZoom) sin.style.zoom = String(k);
      else { sin.style.transformOrigin = 'top center'; sin.style.transform = `scale(${k})`; sheet.style.height = Math.ceil(natural * k + (sheet.offsetHeight - sin.offsetHeight)) + 'px'; }
    };
    apply(z);
    // zoom은 가로 폭을 줄이지 않아 글이 더 넓게 퍼지므로, 실제 높이를 다시 재어 한두 번 보정
    if (useZoom) {
      for (let i = 0; i < 3; i++) {
        const h = sin.getBoundingClientRect().height;
        if (h > avail + 1 && z > 0.5) { z = Math.max(0.5, z * (avail / h)); apply(z); }
        else if (h < avail * 0.92 && z < 1) { z = Math.min(1, z * (avail / h) * 0.98); apply(z); }
        else break;
      }
    }
  }

  ask(html, buttons, cls = '') {
    return new Promise((resolve) => {
      this.open(`${html}<div class="btns">${buttons.map((b, i) => `<button class="btn ${b.primary ? 'primary' : ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>`, cls);
      this.modal.querySelectorAll('button[data-i]').forEach((el) => el.addEventListener('click', () => {
        this.G.sfx.click();
        resolve(buttons[+el.dataset.i].value);
      }));
    });
  }

  // ───────── 화면들 ─────────
  title(hasSave, name) {
    return new Promise((resolve) => {
      this.open(`
        <div class="title">
          <div class="eyebrow">소방안전 교육용 3D 롤플레잉</div>
          <h1>119 <em>FIRE HERO</em></h1>
          <p class="sub">신입 소방사로 임용되어 출동 · 진압 · 인명구조 임무를 수행하며 소방 지식을 익히는 훈련형 RPG</p>
          <label class="field">대원 이름<input id="nameIn" maxlength="10" value="${esc(name || '김소방')}" /></label>
          <div class="btns">
            ${hasSave ? '<button class="btn primary" id="bCont">이어하기</button>' : ''}
            <button class="btn ${hasSave ? '' : 'primary'}" id="bNew">${hasSave ? '새로 시작' : '훈련 시작'}</button>
          </div>
          <div class="keys-help">
            <div><kbd>W A S D</kbd> 이동 · <kbd>Shift</kbd> 달리기 · <kbd>C</kbd> 자세 낮춤</div>
            <div>마우스 시점 · <kbd>클릭</kbd>/<kbd>Space</kbd> 방수·분사 · <kbd>Q</kbd> 직사/분무 · <kbd>E</kbd> 상호작용</div>
            <div><kbd>1</kbd> 관창 · <kbd>2</kbd> 소화기 · <kbd>T</kbd> 열화상 · <kbd>M</kbd> 소리 · <kbd>Esc</kbd> 일시정지</div>
          </div>
        </div>`, 'title-bg');
      this.modal.insertAdjacentHTML('beforeend', `<div class="ver">${APP_VERSION}</div>`);
      const nm = () => ($('nameIn').value.trim() || '김소방').slice(0, 10);
      $('bNew').onclick = () => { this.G.sfx.init(); resolve({ mode: 'new', name: nm() }); };
      const c = $('bCont');
      if (c) c.onclick = () => { this.G.sfx.init(); resolve({ mode: 'continue', name: nm() }); };
    });
  }

  board(missions, pr) {
    return new Promise((resolve) => {
      const rows = missions.map((m) => {
        const rec = pr.missions[m.id] || {};
        const locked = m.id !== 'm1' && !pr.gearDone;
        const stars = '★'.repeat(rec.stars || 0) + '☆'.repeat(3 - (rec.stars || 0));
        return `<button class="mrow ${locked ? 'locked' : ''}" data-id="${m.id}" ${locked ? 'disabled' : ''}>
          <div class="mn">${esc(m.no)}</div>
          <div class="mi"><div class="mt">${esc(m.title)}</div><div class="md">${esc(m.summary)}</div><div class="mg">학습목표 · ${esc(m.goal)}</div></div>
          <div class="ms">${locked ? '🔒 1번 임무 필요' : `<span class="stars">${stars}</span><small>${rec.best ? `최고 ${rec.best}점` : '미완료'}</small>`}</div></button>`;
      }).join('');
      this.open(`<div class="board"><div class="eyebrow">출동 상황판</div><h2>임무 선택</h2><div class="mlist">${rows}</div><div class="btns"><button class="btn" id="bClose">닫기</button></div></div>`);
      this.modal.querySelectorAll('.mrow:not(.locked)').forEach((el) => el.addEventListener('click', () => { this.G.sfx.click(); resolve(el.dataset.id); }));
      $('bClose').onclick = () => resolve(null);
    });
  }

  briefing(m) {
    return this.ask(`<div class="brief"><div class="eyebrow">${m.dispatch ? '119 종합상황실 · 출동 지령' : '훈련 시작'}</div><h2>${esc(m.title)}</h2>
      <div class="callout">${m.call.map((l) => `<p>${esc(l)}</p>`).join('')}</div>
      <h3>임무 목표</h3><ul class="goals">${m.objectives.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
      <div class="tip">💡 ${esc(m.tip)}</div></div>`, [{ label: m.dispatch ? '🚒 출동!' : '시작', primary: true, value: true }, { label: '취소', value: false }]);
  }

  talk(who, lines) {
    return this.ask(`<div class="talk"><div class="who">${esc(who)}</div>${lines.map((l) => `<p>${esc(l)}</p>`).join('')}</div>`, [{ label: '확인', primary: true, value: true }]);
  }

  pause() {
    return this.ask(`<div class="brief"><h2>일시정지</h2><p class="sub">Esc 또는 아래 버튼으로 계속합니다.</p></div>`,
      [{ label: '계속하기', primary: true, value: 'resume' }, { label: '임무 포기하고 소방서로 복귀', value: 'abort' }]);
  }

  // 퀴즈: 정답 보기를 섞어서 출제
  async quiz(title, list) {
    let correct = 0;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      const opts = shuffle(it.options.map((t, k) => ({ t, ok: k === 0 })));
      const picked = await new Promise((resolve) => {
        this.open(`<div class="quiz"><div class="eyebrow">${esc(title)} · 상황판단 퀴즈 ${i + 1}/${list.length}</div><h2>${esc(it.q)}</h2>
          <div class="opts">${opts.map((o, k) => `<button class="opt" data-k="${k}"><b>${k + 1}</b><span>${esc(o.t)}</span></button>`).join('')}</div><div id="qfb"></div></div>`);
        this.modal.querySelectorAll('.opt').forEach((el) => el.addEventListener('click', () => {
          const k = +el.dataset.k, ok = opts[k].ok;
          this.modal.querySelectorAll('.opt').forEach((b, j) => { b.disabled = true; b.classList.add(opts[j].ok ? 'right' : (j === k ? 'wrong' : 'dim')); });
          ok ? this.G.sfx.ok() : this.G.sfx.bad();
          $('qfb').innerHTML = `<div class="fb ${ok ? 'good' : 'bad'}"><b>${ok ? '정답입니다!' : '아쉽습니다.'}</b> ${esc(it.explain)}</div><div class="btns"><button class="btn primary" id="qNext">${i === list.length - 1 ? '결과 보기' : '다음 문제'}</button></div>`;
          $('qNext').onclick = () => resolve(ok);
          this.fit();
        }));
        const key = (e) => { const n = parseInt(e.key, 10); if (n >= 1 && n <= opts.length) { const b = this.modal.querySelectorAll('.opt')[n - 1]; if (b && !b.disabled) b.click(); removeEventListener('keydown', key); } };
        addEventListener('keydown', key);
      });
      if (picked) correct++;
    }
    return { correct, total: list.length };
  }

  result(r) {
    const stars = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars);
    const rows = r.rows.map((x) => `<tr class="${x.kind || ''}"><td>${esc(x.k)}</td><td>${esc(x.v)}</td></tr>`).join('');
    const mist = r.mistakes.length ? `<div class="mist"><b>개선할 점</b><ul>${r.mistakes.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>` : '<div class="mist good">실수 없이 완벽하게 수행했습니다!</div>';
    const lv = r.level;
    const need = lv.need;
    return this.ask(`<div class="result ${r.success ? 'ok' : 'fail'}">
      <div class="eyebrow">${r.success ? '임무 완료' : '임무 실패'}</div><h2>${esc(r.title)}</h2>
      <div class="big"><span class="stars">${stars}</span><b>${r.score}</b><small>점</small></div>
      <table>${rows}</table>${mist}
      <div class="expbox"><div>획득 경험치 <b>+${r.exp} EXP</b></div><div class="bar exp"><i style="width:${need ? (lv.cur / need) * 100 : 100}%"></i></div>
      <div class="lvline">${esc(lv.rank)} · Lv.${lv.level}${lv.up ? ` <em>🎖 승진! ${esc(lv.prevRank)} → ${esc(lv.rank)}</em>` : ''}</div></div></div>`,
      [{ label: r.success ? '소방서로 복귀' : '소방서로 복귀', primary: true, value: 'home' }, ...(r.retry ? [{ label: '다시 도전', value: 'retry' }] : [])]);
  }
}
