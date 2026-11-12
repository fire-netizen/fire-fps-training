// 특수 구조 임무 4종: 06 사다리 구조 · 07 로프(레펠) 구조 · 08 터널 화재·구조 · 09 말벌집 제거
import * as THREE from 'three';
import { Mission, dist2 } from './mission.js';
import { LAYOUT } from '../world/world.js';
import { Human } from '../character/human.js';
import { HoseLine } from '../world/hose.js';
import { QUIZ } from '../data/quizzes.js';
import { rand, clamp } from '../core/util.js';
import { Climb, makeLadder, makeCarriedLadder, makeRope } from '../core/climb.js';
import { makeCar, makeFireTruck, std } from '../world/props.js';

const FULL = { pants: true, boots: true, coat: true, hood: true, scba: true, helmet: true, gloves: true };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// 바닥에 깔리는 안내 원
function ringMesh(r = 1.2, color = '#ffd24a') {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.78, r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  m.rotation.x = -Math.PI / 2; m.renderOrder = 6;
  return m;
}

function box(parent, w, h, d, x, y, z, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}

// 공통 기반: 사다리·요구조자 인계 등 반복되는 동작
class FieldMission extends Mission {
  constructor(G, def) {
    super(G, def);
    this.rings = [];
    this.railSolids = [];
    this.wasps = [];
    this.buzz = 0;
  }

  baseSetup(gear = FULL) {
    const G = this.G, P = G.player;
    G.fx.clearAll();
    G.platforms = [];
    P.setGear({ ...gear });
    P.setMask(false);
    P.resetStats(G.progress);
    P.allowed = { hose: false, ext: false, tic: false };
    P.hoseReady = false; P.tether = null;
    P.equip(null);
    P.lamp = false; P.control = null;
  }

  ring(x, z, r, color) {
    const m = ringMesh(r, color);
    m.position.set(x, (this.ringY || 0) + 0.06, z);
    (this.ringParent || this.G.engine.scene).add(m);
    this.addProp(m);
    this.rings.push(m);
    return m;
  }

  hideRing(m) { if (m && m.parent) m.parent.remove(m); }

  rail(x0, z0, x1, z1, y0, parent) {
    // 난간(보이는 막대 + 충돌). 높이 1.5m: 점프로 넘을 수 없음
    const G = this.G, W = G.world;
    const w = Math.abs(x1 - x0) || 0.12, d = Math.abs(z1 - z0) || 0.12, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const mat = std('#3c4249', 0.5, 0.6);
    const g = new THREE.Group();
    box(g, w, 0.07, d, cx, y0 + 1.1, cz, mat);
    box(g, w, 0.05, d, cx, y0 + 0.55, cz, mat);
    const n = Math.max(2, Math.round(Math.max(w, d) / 0.8));
    for (let i = 0; i <= n; i++) box(g, w > d ? 0.06 : 0.12, 1.1, w > d ? 0.12 : 0.06, x0 + (x1 - x0) * (i / n), y0 + 0.55, z0 + (z1 - z0) * (i / n), mat);
    (parent || G.engine.scene).add(g);
    this.addProp(g);
    this.railSolids.push(W.solid(cx, y0 + 0.75, cz, w, 1.5, d, 'rail', { water: false, view: false }));
  }

  pickLines(ok, bad) { return ok; }

  teardown() {
    const G = this.G;
    for (const s of this.railSolids) { const k = G.world.solids.indexOf(s); if (k >= 0) G.world.solids.splice(k, 1); }
    G.platforms = [];
    G.fx.clearAll();
    this.hose && this.hose.dispose();
    this.buzz = 0;
  }

  // ── 사다리 공통 동작 ─────────────────────────────────────────
  // cfg: { truckPt, A, B, topStand(Vector3|null), label, onTop, onBottom, canClimb(), ladderObj }
  setupLadderKit(cfg) {
    const G = this.G, P = G.player;
    this.lad = cfg;
    this.hasLadder = false; this.placed = false;
    this.addInteract({
      pos: cfg.truckPt, radius: 3.6, label: '소방차에서 사다리 꺼내기', hold: 1.4,
      enabled: () => !this.hasLadder && !this.placed && (!cfg.canTake || cfg.canTake()),
      onUse: () => {
        this.hasLadder = true;
        this.carried = makeCarriedLadder();
        P.root.add(this.carried);
        G.ui.toast('사다리를 어깨에 멨습니다 — 표시된 설치 위치로 이동하세요', 'good'); G.sfx.ok();
        cfg.onTake && cfg.onTake();
      },
    });
    this.addInteract({
      pos: cfg.A, radius: 2.6, label: '사다리 설치 (벽에 기대 세우기)', hold: 1.2,
      enabled: () => this.hasLadder,
      onUse: () => {
        this.hasLadder = false; this.placed = true;
        if (this.carried) { P.root.remove(this.carried); this.carried = null; }
        const dir = cfg.B.clone().sub(cfg.A).normalize();
        const mesh = makeLadder(cfg.A, cfg.B.clone().addScaledVector(dir, cfg.extra ?? 0.9));
        G.engine.scene.add(mesh); this.addProp(mesh); this.ladderMesh = mesh;
        G.sfx.ok(); G.ui.toast('사다리를 약 70°로 설치했습니다. 하단을 잡고 확보하세요', 'good');
        this.hideRing(this.ringA);
        cfg.onPlace && cfg.onPlace();
      },
    });
    this.addInteract({
      pos: cfg.A, radius: 1.9, label: '사다리 오르기 (W / 조이스틱 위)',
      enabled: () => this.placed && !P.control && P.pos.y < 1 && !P.carry && (!cfg.canClimb || cfg.canClimb()),
      onUse: () => this.startClimb(0),
    });
    if (cfg.topStand) {
      this.addInteract({
        pos: cfg.topStand, radius: 1.8, label: '사다리로 내려가기',
        enabled: () => this.placed && !P.control && P.pos.y > 2.5,
        onUse: () => this.startClimb(1),
      });
    }
  }

  startClimb(s) {
    const G = this.G, cfg = this.lad;
    const c = new Climb(G, {
      A: cfg.A, B: cfg.B, s, speed: 1.45, face: cfg.face ?? Math.PI,
      label: '🪜 W/S (조이스틱 위·아래)로 오르내림 · 3점 지지',
      onTop: cfg.onTop ? () => cfg.onTop() : undefined,
      onBottom: () => cfg.onBottom && cfg.onBottom(),
    });
    this.climb = c;
    c.start();
  }

  // 손님/요구조자 만들기
  makeVictim(pos, opt = {}) {
    const G = this.G;
    const h = new Human({ skin: opt.skin || '#dbb08c', hair: opt.hair || '#2a1b14', shirt: opt.shirt || '#6a8fb8', pants: opt.pants || '#3d4457', longHair: !!opt.longHair });
    h.root.position.copy(pos);
    h.root.rotation.y = opt.yaw ?? 0;
    if (opt.lying) h.setLying(true);
    G.engine.scene.add(h.root);
    this.addHuman(h);
    return h;
  }

  handover(P, surv, pos, yaw) {
    P.drop(pos, yaw);
    surv.setLying(true);
  }

  tickHumans(dt) {
    for (const h of this.humans) h.update(dt, { speed: 0 });
  }
}

// ═════════════════ 06. 사다리 구조 ═════════════════
export class LadderRescueMission extends FieldMission {
  quizPool() { return QUIZ.m6; }

  async setup() {
    const G = this.G, W = G.world, P = G.player, A = LAYOUT.siteA;
    this.baseSetup();
    P.allowed = { hose: false, ext: false, tic: false };
    const front = A.z + A.d / 2; // 건물 정면 z
    const x0 = 64.5, by = 4.0;
    this.x0 = x0; this.by = by; this.front = front;

    // 발코니 (2층 높이) — 난간은 가운데만 열어 둠
    const slab = std('#9a9690', 0.9, 0.05);
    this.addProp(box(G.engine.scene, 5.4, 0.3, 2.3, x0, by - 0.15, front + 1.15, slab));
    G.platforms.push({ x0: x0 - 2.7, x1: x0 + 2.7, z0: front, z1: front + 2.3, y: by });
    this.rail(x0 - 2.7, front, x0 - 2.7, front + 2.3, by);
    this.rail(x0 + 2.7, front, x0 + 2.7, front + 2.3, by);
    this.rail(x0 - 2.7, front + 2.3, x0 - 0.75, front + 2.3, by);
    this.rail(x0 + 0.75, front + 2.3, x0 + 2.7, front + 2.3, by);

    // 연소 중인 창문(배경) + 연기
    const f1 = G.fx.addFire(W.siteA.fireSlots[0], { size: 1.15, hp: 99999, type: 'A', heat: 2.3, label: '화점' });
    const f2 = G.fx.addFire(W.siteA.fireSlots[4], { size: 1.2, hp: 99999, type: 'A', heat: 2.3, label: '화점' });
    f1.noTarget = f2.noTarget = true;
    G.fx.addSmokeSource(V(x0, by + 1.6, front + 0.4), 5, 2.4);
    G.fx.addSmokeSource(V(x0 - 6, A.floors * A.floorH, front - 1), 6, 2.2);

    // 요구조자 (발코니에서 구조 요청)
    this.surv = this.makeVictim(V(x0 - 1.4, by, front + 1.0), { yaw: 0, longHair: true, shirt: '#c06a7a' });
    this.survPos = V(x0 - 1.4, by, front + 1.0);

    // 사다리 위치 (약 70° 로 설치)
    const Apt = V(x0, 0, front + 3.95), Bpt = V(x0, by, front + 2.05);
    const tr = W.truck.position;
    this.ringA = this.ring(Apt.x, Apt.z, 1.2, '#ffd24a');
    this.amb = V(tr.x + 8.5, 0, -6.4);
    this.ambRing = this.ring(this.amb.x, this.amb.z, 1.8, '#4be08a');
    // 들것 (인계 지점)
    const st = new THREE.Group();
    box(st, 2.0, 0.12, 0.7, 0, 0.45, 0, std('#e8ebee', 0.6, 0.1));
    for (const dx of [-0.8, 0.8]) for (const dz of [-0.25, 0.25]) box(st, 0.06, 0.4, 0.06, dx, 0.2, dz, std('#6c737a', 0.5, 0.6));
    box(st, 0.5, 0.5, 0.05, 0, 1.3, 0.4, new THREE.MeshStandardMaterial({ color: '#17a35a', emissive: '#0d6b3b', emissiveIntensity: 0.6 }));
    st.position.set(this.amb.x, 0, this.amb.z); G.engine.scene.add(st); this.addProp(st);

    this.setupLadderKit({
      truckPt: V(tr.x, 0, tr.z - 2.9), A: Apt, B: Bpt, topStand: V(x0, by, front + 1.8), face: Math.PI,
      onTake: () => { this.complete('take'); },
      onPlace: () => { this.complete('place'); },
      onTop: () => {
        P.pos.set(x0, by, front + 1.55); P.heading = Math.PI; P.root.rotation.y = Math.PI; G.camRig.yaw = Math.PI;
        this.complete('up'); this._laddered = false; this._high = true;
        G.ui.toast('발코니 도착 — 요구조자에게 말을 걸어 안심시키고 구조하세요', 'info');
      },
      onBottom: () => {
        P.pos.set(Apt.x, 0, Apt.z + 1.0); P.heading = 0; P.root.rotation.y = 0; G.camRig.yaw = 0;
        this._laddered = true; this._high = false;
        if (P.carry) this.complete('down');
        G.ui.toast('지상 도착 — 구급대(들것)로 인계하세요', 'info');
      },
    });

    this.addInteract({
      pos: this.survPos, radius: 2.6, label: '요구조자 확보 (어깨에 메기)', hold: 1.6,
      enabled: () => P.pos.y > 3 && !P.carry && !this.rescued,
      onUse: () => {
        this.rescued = true;
        P.pickUp(this.surv);
        G.ui.toast('요구조자를 업었습니다 — 사다리 상단으로 이동해 천천히 내려가세요', 'good');
        this.complete('rescue');
      },
    });
    this.addInteract({
      pos: this.amb, radius: 3.2, label: '요구조자를 구급대에 인계', hold: 1.2,
      enabled: () => !!P.carry && P.pos.y < 1,
      onUse: () => {
        this.handover(P, this.surv, V(this.amb.x, 0.5, this.amb.z), 0);
        this.surv.root.position.set(this.amb.x, 0.55, this.amb.z);
        this.complete('hand'); G.ui.banner('구조 완료'); this.cheer(2.4);
        setTimeout(() => this.finish(true), 1800);
      },
    });

    this.addObj('take', '소방차에서 사다리를 꺼낸다')
      .addObj('place', '노란 원 위치에 사다리를 설치한다 (발코니 난간 틈 쪽)')
      .addObj('up', '사다리를 올라 발코니로 진입한다')
      .addObj('rescue', '요구조자를 확보한다')
      .addObj('down', '요구조자를 업고 사다리로 내려온다')
      .addObj('hand', '구급대(들것)에 인계한다');
    this.setActive('take');
  }

  update(dt) {
    const G = this.G, P = G.player;
    this.tickHumans(dt);
    if (!this.rescued && (this._wave = (this._wave || 0) + dt) > 3.5) { this._wave = 0; this.surv.play('reach', 1.3); }
    // 발코니에서 그냥 뛰어내림
    if (P.pos.y > 3) this._high = true;
    else if (this._high && P.pos.y < 1 && !P.control) { this._high = false; if (!this._laddered) this.mistake('발코니에서 뛰어내렸습니다 — 반드시 사다리로 내려와야 합니다', 140); }
    // 마커
    let t = null;
    if (!this.hasLadder && !this.placed) t = { pos: V(this.lad.truckPt.x, 2.6, this.lad.truckPt.z), label: '소방차 · 사다리' };
    else if (this.hasLadder) t = { pos: V(this.lad.A.x, 1.8, this.lad.A.z), label: '사다리 설치 위치' };
    else if (this.placed && !this.objs.find((o) => o.id === 'up').done) t = { pos: V(this.lad.A.x, 2.2, this.lad.A.z), label: '사다리 오르기' };
    else if (!this.rescued) t = { pos: V(this.survPos.x, this.by + 2.4, this.survPos.z), label: '요구조자' };
    else if (P.carry && P.pos.y > 2.5) t = { pos: V(this.x0, this.by + 1.8, this.front + 1.8), label: '사다리로 내려가기' };
    else if (P.carry) t = { pos: V(this.amb.x, 2.4, this.amb.z), label: '구급대 인계' };
    this.markerTarget = t;
  }
}

// ═════════════════ 07. 로프(레펠) 구조 ═════════════════
export class RappelMission extends FieldMission {
  constructor(G, def) { super(G, def); this.checks = 0; this.rigged = false; }
  quizPool() { return QUIZ.m7; }

  async setup() {
    const G = this.G, W = G.world, P = G.player, B = LAYOUT.siteB;
    this.baseSetup();
    const front = B.z + B.d / 2; // -19
    const roofY = B.floors * B.floorH; // 15.5
    this.front = front; this.roofY = roofY;
    const rx = B.x; // 로프 중심 x
    this.rx = rx;

    // 옥상: 발판 + 난간(전체 둘러 막음)
    G.platforms.push({ x0: B.x - B.w / 2, x1: B.x + B.w / 2, z0: B.z - B.d / 2, z1: front, y: roofY });
    const x0 = B.x - B.w / 2 + 0.2, x1 = B.x + B.w / 2 - 0.2, zb = B.z - B.d / 2 + 0.2, zf = front - 0.2;
    this.rail(x0, zb, x1, zb, roofY); this.rail(x0, zb, x0, zf, roofY); this.rail(x1, zb, x1, zf, roofY);
    this.rail(x0, zf, rx - 1.8, zf, roofY); this.rail(rx + 1.8, zf, x1, zf, roofY);
    // 하강 지점(난간 틈)은 시각만 열고 충돌은 막아 추락을 방지
    this.railSolids.push(W.solid(rx, roofY + 0.75, zf, 3.6, 1.5, 0.3, 'rail', { water: false, view: false }));
    // 앵커 볼라드
    const anchor = V(rx, roofY, front - 3.4);
    const steel = std('#aab0b6', 0.35, 0.8);
    const bol = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.7, 16), steel);
    bol.position.set(anchor.x, roofY + 0.35, anchor.z); G.engine.scene.add(bol); this.addProp(bol);
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 8, 16), std('#e0442a', 0.5, 0.2));
    eye.position.set(anchor.x, roofY + 0.78, anchor.z); eye.rotation.x = Math.PI / 2; G.engine.scene.add(eye); this.addProp(eye);
    this.anchor = anchor;

    // 로프 (선발대가 옥상 앵커에 미리 고정)
    const ux = rx - 9; // 등반용 로프는 화염이 없는 왼쪽 열
    const ropeTop = V(rx, roofY + 0.3, front + 0.55), ropeBot = V(rx, 0.1, front + 0.55);
    this.rope = makeRope(ropeBot, ropeTop);
    G.engine.scene.add(this.rope); this.addProp(this.rope);
    this.ropeA = V(rx, 0, front + 0.8); this.ropeB = V(rx, roofY, front + 0.8);
    this.upX = ux;
    const upRope = makeRope(V(ux, 0.1, front + 0.55), V(ux, roofY + 0.3, front + 0.55));
    G.engine.scene.add(upRope); this.addProp(upRope);
    this.upA = V(ux, 0, front + 0.8); this.upB = V(ux, roofY, front + 0.8);

    // 외벽 창문 화점 2곳 (로프 경로 위)
    const wp1 = W.windowPos(W.siteB, 5, 3), wp2 = W.windowPos(W.siteB, 5, 1);
    for (const p of [wp1, wp2]) {
      const f = G.fx.addFire(V(p.x, p.y - 0.5, front + 0.75), { size: 1.05, hp: 99999, type: 'A', heat: 3.1, label: '화점' });
      f.noTarget = true;
      G.fx.addSmokeSource(V(p.x, p.y + 0.5, front + 0.6), 4, 2.2);
    }

    // 요구조자 (옥상)
    this.survPos = V(B.x + 6, roofY, B.z - 2.5);
    this.surv = this.makeVictim(this.survPos, { lying: true, yaw: Math.PI * 0.7 });
    G.fx.addSmokeSource(V(this.survPos.x - 1.5, roofY + 0.5, this.survPos.z - 2), 4, 2.4);

    const tr = W.truck.position;
    this.gearPt = V(tr.x, 0, tr.z - 2.9);
    this.baseRing = this.ring(ux, front + 2.0, 1.3, '#ffd24a');
    this.amb = V(B.x - 10, 0, front + 4.8);
    this.ambRing = this.ring(this.amb.x, this.amb.z, 1.8, '#4be08a');
    const st = new THREE.Group();
    box(st, 2.0, 0.12, 0.7, 0, 0.45, 0, std('#e8ebee', 0.6, 0.1));
    for (const dx of [-0.8, 0.8]) for (const dz of [-0.25, 0.25]) box(st, 0.06, 0.4, 0.06, dx, 0.2, dz, std('#6c737a', 0.5, 0.6));
    st.position.set(this.amb.x, 0, this.amb.z); G.engine.scene.add(st); this.addProp(st);

    // 1) 장비 착용
    this.addInteract({
      pos: this.gearPt, radius: 3.6, label: '로프 장비 착용 (하네스·카라비너·하강기)', hold: 1.6,
      enabled: () => !this.rigged,
      onUse: () => {
        this.rigged = true; G.sfx.ok(); G.ui.toast('하네스·헬멧 턱끈·카라비너·하강기를 착용했습니다', 'good');
        this.complete('gear');
      },
    });
    // 2) 로프 등반
    this.addInteract({
      pos: V(ux, 0, front + 2.0), radius: 2.0, label: '로프 등반 시작 (W / 조이스틱 위)',
      enabled: () => this.rigged && !P.control && P.pos.y < 1 && !this.onRoof && !P.carry,
      onUse: () => {
        const c = new Climb(G, {
          A: this.upA, B: this.upB, s: 0, speed: 1.8, face: Math.PI, label: '🧗 W/S 로 등반 — 옥상 도착까지 계속 누르세요',
          onTop: () => {
            P.pos.set(ux, roofY, front - 1.3); P.heading = Math.PI; P.root.rotation.y = Math.PI; G.camRig.yaw = Math.PI;
            this.onRoof = true; this.complete('climb');
            G.ui.toast('옥상 도착 — 요구조자를 확보하고 앵커 점검 후 하강하세요', 'info');
          },
          onBottom: () => {},
        });
        this.climb = c; c.start();
      },
    });
    // 3) 요구조자
    this.addInteract({
      pos: this.survPos, radius: 2.6, label: '요구조자 확보 (하네스 체결)', hold: 1.8,
      enabled: () => this.onRoof && !P.carry && !this.rescued,
      onUse: () => {
        this.rescued = true; P.pickUp(this.surv);
        G.ui.toast('요구조자 하네스를 체결하고 안고 있습니다', 'good'); this.complete('rescue');
      },
    });
    // 4) 하강 전 점검 3단계
    const STEPS = ['① 앵커(고정점) 상태 확인', '② 하네스·카라비너 잠금 확인', '③ 하강기 로프 세팅 · 이중 확보 확인'];
    this.addInteract({
      pos: this.anchor, radius: 2.4, label: '', hold: 0,
      enabled: () => {
        if (!this.onRoof || this.checks >= 3) return false;
        this._it.label = '하강 전 점검 ' + STEPS[this.checks];
        return true;
      },
      onUse: () => {
        this.checks++;
        G.ui.toast(STEPS[this.checks - 1].slice(2) + ' — 이상 없음', 'good');
        if (this.checks >= 3) { this.complete('check'); G.sfx.ok(); }
      },
    });
    this._it = this.inter[this.inter.length - 1];
    // 5) 하강 시작
    this.addInteract({
      pos: V(rx, roofY, front - 1.2), radius: 2.0, label: '로프 하강 시작 (S 아래 · A/D 좌우)',
      enabled: () => this.onRoof && this.checks >= 3 && !!P.carry && !P.control,
      onUse: () => {
        const c = new Climb(G, {
          A: this.ropeA, B: this.ropeB, s: 1, speed: 1.7, face: Math.PI, lat: 5.2,
          label: '⬇ S 로 하강 · 화염 구간은 A/D 로 옆으로 피하세요',
          onTick: (cl) => { this.rope.position.x = cl.dx; },
          onBottom: () => {
            P.pos.set(rx + c.dx, 0, front + 2.2); P.heading = 0; P.root.rotation.y = 0; G.camRig.yaw = 0;
            this.rope.position.x = 0; this.complete('down');
            G.ui.toast('지상 도착 — 구급대에 인계하세요', 'info');
          },
        });
        this.climb = c; c.start();
      },
    });
    // 6) 인계
    this.addInteract({
      pos: this.amb, radius: 3.2, label: '요구조자를 구급대에 인계', hold: 1.2,
      enabled: () => !!P.carry && P.pos.y < 1 && !P.control,
      onUse: () => {
        this.handover(P, this.surv, V(this.amb.x, 0.5, this.amb.z), 0);
        this.surv.root.position.set(this.amb.x, 0.55, this.amb.z);
        this.complete('hand'); G.ui.banner('구조 완료');
        setTimeout(() => this.finish(true), 1600);
      },
    });

    this.addObj('gear', '소방차에서 로프 장비(하네스·하강기)를 착용한다')
      .addObj('climb', '왼쪽의 등반용 로프로 옥상까지 등반한다 (W)')
      .addObj('rescue', '옥상의 요구조자를 확보한다')
      .addObj('check', '하강 전 점검 3단계 (앵커 → 하네스 → 하강기)')
      .addObj('down', '요구조자와 함께 로프로 하강한다 (화염 구간 회피)')
      .addObj('hand', '구급대에 인계한다');
    this.setActive('gear');
    G.ui.toast('로프는 선발대가 옥상 앵커에 고정했습니다. 장비를 착용하고 등반하세요', 'info');
  }

  update(dt) {
    const G = this.G, P = G.player;
    this.tickHumans(dt);
    // 하강 중 화염에 너무 가까이 접근(통과)하면 감점
    if (P.control && P.control === this.climb && this.climb.lat) {
      for (const f of G.fx.fires) if (f.alive && f.pos.distanceTo(P.pos) < 1.9) { this.mistake('하강 경로의 화염 구간을 그대로 통과했습니다 — 옆으로 이동해 열원을 피해야 합니다', 120); break; }
    }
    // 옥상에서 요구조자 없이 하강 시도 방지 안내
    if (this.onRoof && this.checks >= 3 && !P.carry && !this.rescued) this.markerTarget = { pos: V(this.survPos.x, this.roofY + 1.8, this.survPos.z), label: '요구조자' };
    let t = null;
    if (!this.rigged) t = { pos: V(this.gearPt.x, 2.6, this.gearPt.z), label: '소방차 · 로프 장비' };
    else if (!this.onRoof) t = { pos: V(this.upX, 2.4, this.front + 2.0), label: '로프 등반 시작' };
    else if (!this.rescued) t = { pos: V(this.survPos.x, this.roofY + 2.0, this.survPos.z), label: '요구조자' };
    else if (this.checks < 3) t = { pos: V(this.anchor.x, this.roofY + 1.8, this.anchor.z), label: '앵커 · 하강 전 점검' };
    else if (P.carry && P.pos.y > 10 && !P.control) t = { pos: V(this.rx, this.roofY + 1.8, this.front - 1.2), label: '하강 시작' };
    else if (P.carry && P.pos.y < 1) t = { pos: V(this.amb.x, 2.4, this.amb.z), label: '구급대 인계' };
    if (!(this.onRoof && this.checks >= 3 && !P.carry && !this.rescued)) this.markerTarget = t;
    // 하강 중 열기 경고는 Player.updateHazards 가 처리 (Climb 에서 호출)
  }
}

// ═════════════════ 08. 터널 화재·구조 ═════════════════
export class TunnelMission extends FieldMission {
  constructor(G, def) {
    super(G, def);
    this.fires = []; this.victims = []; this.dropT = 7; this.rocks = []; this.warns = []; this.rubble = [];
    this.saved = 0; this.hosePt = null; this.hitCd = 0;
  }
  quizPool() { return QUIZ.m8; }

  async setup() {
    const G = this.G, W = G.world, P = G.player, I = W.intT;
    this.I = I;
    this.baseSetup();
    W.showZone('tunnel');
    this.ringParent = I.group;
    P.setGear({ ...FULL });
    P.setMask(true);
    P.allowed = { hose: true, ext: false, tic: false, lamp: true };
    P.lamp = false;
    this.showAir = true;
    P.teleport(I.spawn, 0);
    G.ui.show(true);

    // 지원 소방차 (터널 입구)
    const tk = makeFireTruck();
    tk.position.copy(I.p(-3.6, 0, -3.5)); tk.rotation.y = -Math.PI / 2;
    I.group.add(tk); this.addProp(tk);
    this.hosePt = I.p(-3.6, 0.9, 1.6);
    this.pumpPos = I.p(-3.0, 0, 2.4);
    this.hose = new HoseLine(G.engine.scene);
    this.addProp(this.hose.mesh);

    // 사고 차량 · 화점
    const mk = (x, z, ry, color) => {
      const c = makeCar(color);
      c.position.copy(I.p(x, 0, z)); c.rotation.y = ry;
      I.group.add(c); this.addProp(c);
      const cs = Math.abs(Math.sin(ry)), cc = Math.abs(Math.cos(ry));
      const w = cc * 4.4 + cs * 1.8, d = cs * 4.4 + cc * 1.8;
      const sd = G.world.solid(c.position.x, 0.9, c.position.z, w, 1.8, d, 'car', { water: false, view: false });
      (this.carSolids ||= []).push(sd);
      return c;
    };
    mk(-2.6, 22, Math.PI / 2 + 0.12, '#8aa3b8');
    mk(2.8, 34, Math.PI / 2 - 0.3, '#b8574a');
    mk(-4.0, 48, Math.PI / 2 + 0.7, '#6f7f5e');
    // 화물차(전복 직전)
    const van = new THREE.Group();
    box(van, 6.5, 2.4, 2.5, 0, 1.4, 0, std('#d8d8d4', 0.7, 0.1));
    box(van, 1.8, 1.9, 2.4, 4.2, 1.2, 0, std('#3b4a63', 0.5, 0.3));
    for (const wx of [-2.2, 2.0, 4.2]) for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 14), std('#15161a', 0.8, 0.1)); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.45, s * 1.25); van.add(w); }
    van.position.copy(I.p(3.0, 0, 62)); van.rotation.y = Math.PI / 2 + 0.08;
    I.group.add(van); this.addProp(van);
    this.carSolids.push(G.world.solid(van.position.x, 1.3, van.position.z, 2.7, 2.6, 6.6, 'car', { water: false, view: false }));

    const fdef = [
      [I.p(-2.6, 0.9, 24.4), 1.35, '승용차 ①'],
      [I.p(2.8, 0.9, 31.8), 1.3, '승용차 ②'],
      [I.p(-3.4, 0.9, 45.8), 1.4, '승용차 ③'],
      [I.p(3.0, 1.0, 58.2), 1.5, '화물차 엔진'],
    ];
    for (const [p, sz, lab] of fdef) {
      const f = G.fx.addFire(p, { size: sz, hp: 125, type: 'A', heat: 5.2, label: lab, smoke: 1.4, smokeC: [[0.06, 0.06, 0.06], [0.2, 0.19, 0.18]], smokeA: 0.7 });
      this.fires.push(f);
      G.fx.addSmokeSource(V(p.x, 4.6, p.z), 6, 2.6);
    }

    // 요구조자 2명 (불에서 3.5m 정도 떨어진 도로 위)
    const v1 = this.makeVictim(I.p(3.9, 0, 28.8), { lying: true, yaw: 1.2, shirt: '#8c5a3c' });
    const v2 = this.makeVictim(I.p(-1.0, 0, 52.4), { lying: true, yaw: -0.5, shirt: '#4a7aa8', longHair: true });
    this.victims = [v1, v2];
    this.vPos = [I.p(3.9, 0, 28.8), I.p(-1.0, 0, 52.4)];

    // 인계 지점 (입구 근처)
    this.amb = I.p(4.2, 0, 5.8);
    this.ambRing = this.ring(this.amb.x, this.amb.z, 1.9, '#4be08a');
    const st = new THREE.Group();
    box(st, 2.0, 0.12, 0.7, 0, 0.45, 0, std('#e8ebee', 0.6, 0.1));
    for (const dx of [-0.8, 0.8]) for (const dz of [-0.25, 0.25]) box(st, 0.06, 0.4, 0.06, dx, 0.2, dz, std('#6c737a', 0.5, 0.6));
    st.position.set(this.amb.x, 0, this.amb.z); I.group.add(st); this.addProp(st);

    // 상호작용
    this.addInteract({
      pos: this.pumpPos, radius: 3.4, label: '호스 전개 · 관창 장착',
      enabled: () => !P.hoseReady,
      onUse: () => {
        P.hoseReady = true; P.equip('hose'); P.tether = { pos: this.hosePt, max: 66 };
        this.hose.visible = true; G.sfx.ok(); G.ui.toast('호스를 전개했습니다 (길이 한계 66m)', 'good'); this.complete('hose');
      },
    });
    for (const z of [10, 36, 62]) {
      this.addInteract({
        pos: I.p(5.0, 0, z), radius: 2.6, label: '터널 소화전 연결 · 용수 보충', hold: 1.2,
        enabled: () => P.hoseReady && P.stats.water < 98,
        onUse: () => { P.stats.water = 100; G.ui.toast('터널 소화전에서 용수를 보충했습니다', 'good'); G.sfx.ok(); },
      });
    }
    this.addInteract({
      pos: this.pumpPos, radius: 3.4, label: '용수 보충 (소방차 탱크)', hold: 1.5,
      enabled: () => P.hoseReady && P.stats.water < 98,
      onUse: () => { P.stats.water = 100; G.ui.toast('소방차 탱크에서 용수를 보충했습니다', 'good'); G.sfx.ok(); },
    });
    this.vPos.forEach((vp, i) => {
      this.addInteract({
        pos: vp, radius: 2.4, label: `요구조자 ${i + 1} 구조 (어깨에 메기)`, hold: 1.6,
        enabled: () => !P.carry && !this.victims[i].saved,
        onUse: () => {
          const near = this.fires.find((f) => f.alive && f.pos.distanceTo(P.pos) < 3.6);
          if (near) { G.ui.toast('화점이 너무 가깝습니다! 먼저 진압하세요', 'warn'); return; }
          this.victims[i].saved = false;
          this.carrying = i;
          P.pickUp(this.victims[i]); G.ui.toast('요구조자를 어깨에 메었습니다 — 터널 입구 인계 지점으로!', 'good');
        },
      });
    });
    this.addInteract({
      pos: this.amb, radius: 3.4, label: '요구조자를 구급대에 인계', hold: 1.2,
      enabled: () => !!P.carry,
      onUse: () => {
        const v = P.carry;
        this.handover(P, v, V(this.amb.x, 0.5, this.amb.z + (this.saved ? 1.1 : 0)), 0);
        v.root.position.set(this.amb.x, 0.55, this.amb.z + (this.saved ? 1.1 : 0));
        v.saved = true; this.saved++;
        G.sfx.ok(); G.ui.banner(`요구조자 ${this.saved}/2 인계`);
      },
    });

    this.addObj('lamp', '헬멧 랜턴을 켠다 (L)')
      .addObj('hose', '소방차에서 호스를 전개한다')
      .addObj('fires', '차량 화점 4곳을 진압한다', `0/${this.fires.length}`)
      .addObj('rescue', '요구조자 2명을 구조해 입구로 인계한다', '0/2');
    this.setActive('lamp');
    G.ui.toast('터널 안은 정전·연기로 어둡습니다. L 키(랜턴 버튼)로 헬멧 랜턴을 켜세요! 천장 낙하물 주의', 'warn');
  }

  update(dt) {
    const G = this.G, P = G.player, I = this.I;
    this.tickHumans(dt);
    this.hitCd = Math.max(0, this.hitCd - dt);
    if (!this.objs.find((o) => o.id === 'lamp').done && P.lamp) this.complete('lamp');
    if (P.hoseReady) this.hose.update(this.hosePt, P.human.arms.R.hand.getWorldPosition(new THREE.Vector3()));
    const out = this.fires.filter((f) => !f.alive).length;
    this.setCount('fires', `${out}/${this.fires.length}`);
    if (out === this.fires.length && !this.objs.find((o) => o.id === 'fires').done) { this.complete('fires'); G.ui.banner('차량 화재 진압 완료'); }
    this.setCount('rescue', `${this.saved}/2`);
    if (this.saved >= 2 && !this.objs.find((o) => o.id === 'rescue').done) this.complete('rescue');
    if (this.saved >= 2 && out === this.fires.length && !this._end) { this._end = true; G.ui.banner('터널 화재 · 구조 완료'); setTimeout(() => this.finish(true), 1800); }
    if (P.stats.water < 12 && P.hoseReady && !this._lw) { this._lw = true; G.ui.toast('용수 부족 — 터널 소화전/소방차에서 보충(E 길게)', 'warn'); }
    if (P.stats.water > 40) this._lw = false;
    if (P.stats.air < 25 && !this._la) { this._la = true; G.ui.toast('공기 잔량 부족! 요구조자와 함께 입구로 복귀하세요', 'warn'); }

    this.updateDebris(dt);

    // 마커
    let t = null;
    const lampDone = this.objs.find((o) => o.id === 'lamp').done;
    if (!lampDone) t = null;
    else if (!P.hoseReady) t = { pos: V(this.pumpPos.x, 2.4, this.pumpPos.z), label: '소방차 · 호스 전개' };
    else if (P.carry) t = { pos: V(this.amb.x, 2.4, this.amb.z), label: '구급대 인계' };
    else {
      let best = null, bd = 1e9;
      for (const f of this.fires) if (f.alive) { const d = dist2(f.pos, P.pos); if (d < bd) { bd = d; best = f; } }
      if (best) t = { pos: V(best.pos.x, best.pos.y + 2.6, best.pos.z), label: best.label || '화점' };
      else {
        const k = this.victims.findIndex((v) => !v.saved && P.carry !== v);
        if (k >= 0) t = { pos: V(this.vPos[k].x, 1.8, this.vPos[k].z), label: '요구조자' };
      }
    }
    this.markerTarget = t;
  }

  // ── 천장 낙하물: 경고(붉은 원) → 낙하 → 피하지 못하면 피해
  updateDebris(dt) {
    const G = this.G, P = G.player, I = this.I, sc = G.engine.scene;
    if (P.pos.z > 7) this.dropT -= dt; // 입구 근처는 안전
    if (this.dropT <= 0) {
      this.dropT = rand(4.2, 7.5);
      const ahead = Math.random() < 0.7;
      const lead = clamp(P.speed * 1.2, 0, 5);
      const tx = ahead ? clamp(P.pos.x - I.O.x + Math.sin(P.heading) * lead + rand(-0.8, 0.8), -5, 5) : rand(-5, 5);
      const tz = ahead ? clamp(P.pos.z - I.O.z + Math.cos(P.heading) * lead + rand(-0.8, 0.8), 4, I.len - 4) : clamp(P.pos.z - I.O.z + rand(-6, 6), 4, I.len - 4);
      const pos = I.p(tx, 0, tz);
      const ring = ringMesh(1.35, '#ff3b2f');
      ring.position.set(pos.x, 0.07, pos.z); sc.add(ring);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.35, 0.6), 0), std('#7d7b76', 0.95, 0.05));
      rock.position.set(pos.x, I.H - 0.2, pos.z); rock.visible = false; rock.castShadow = true; sc.add(rock);
      this.warns.push({ ring, rock, pos, t: 0, vy: 0, landed: false });
      G.sfx.tone(52, 0.7, 'sine', 0.25, -10);
      G.ui.toast('⚠ 천장에서 우르르 소리! 붉은 원 밖으로 피하세요', 'warn');
      for (let i = 0; i < 12; i++) G.fx.smoke.emit({ x: pos.x + rand(-0.6, 0.6), y: I.H - 0.4, z: pos.z + rand(-0.6, 0.6), vx: rand(-0.3, 0.3), vy: rand(-1.2, -0.4), vz: rand(-0.3, 0.3), life: 1.0, s0: 0.2, s1: 0.8, a0: 0.5, a1: 0, c0: [0.5, 0.48, 0.45], grav: 0 });
    }
    for (let i = this.warns.length - 1; i >= 0; i--) {
      const w = this.warns[i];
      w.t += dt;
      const blink = 0.55 + 0.45 * Math.sin(w.t * 18);
      w.ring.material.opacity = w.landed ? Math.max(0, 0.7 - (w.t - w.tl) * 1.2) : 0.35 + 0.5 * blink;
      if (!w.landed) {
        if (w.t > 0.45) { w.rock.visible = true; w.vy -= 14 * dt; w.rock.position.y += w.vy * dt; w.rock.rotation.x += dt * 4; w.rock.rotation.z += dt * 3; }
        if (w.rock.visible && w.rock.position.y <= 0.3) {
          w.landed = true; w.tl = w.t; w.rock.position.y = 0.3; w.ring.material.color.set('#888');
          G.sfx.thud(); G.shake = Math.max(G.shake || 0, 0.4);
          for (let k = 0; k < 22; k++) G.fx.smoke.emit({ x: w.pos.x + rand(-0.5, 0.5), y: 0.3, z: w.pos.z + rand(-0.5, 0.5), vx: rand(-2.2, 2.2), vy: rand(0.3, 1.6), vz: rand(-2.2, 2.2), life: rand(0.8, 1.6), s0: 0.3, s1: 1.2, a0: 0.55, a1: 0, c0: [0.5, 0.48, 0.45], drag: 1.2 });
          const d = Math.hypot(P.pos.x - w.pos.x, P.pos.z - w.pos.z);
          if (d < 1.45 && P.pos.y < 1.4) {
            P.hurt(17, 'debris'); G.sfx.hurt(); G.ui.banner('💥 낙하물에 맞았습니다!', 1400);
            this.mistake('터널 낙하물에 맞았습니다 — 경고 원을 확인하고 피해야 합니다', 70);
          }
          this.rubble.push(w.rock);
          this.addProp(w.rock);
          if (this.rubble.length > 14) { const o = this.rubble.shift(); o.parent && o.parent.remove(o); }
        }
      }
      if (w.landed && w.t - w.tl > 0.6) { w.ring.parent && w.ring.parent.remove(w.ring); this.warns.splice(i, 1); }
    }
  }

  teardown() {
    super.teardown();
    for (const w of this.warns) { w.ring.parent && w.ring.parent.remove(w.ring); w.rock.parent && w.rock.parent.remove(w.rock); }
    for (const s of this.carSolids || []) { const k = this.G.world.solids.indexOf(s); if (k >= 0) this.G.world.solids.splice(k, 1); }
    this.G.player.lamp = false;
  }
}

// ═════════════════ 09. 말벌집 제거 ═════════════════
class Wasp {
  constructor(parent, home, i) {
    this.g = new THREE.Group();
    const yel = std('#f2c01c', 0.5, 0.05, { emissive: '#5a4000', emissiveIntensity: 0.25 }), blk = std('#141210', 0.6, 0.1);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), yel); body.scale.set(1, 0.9, 1.5); this.g.add(body);
    const ab = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), yel); ab.scale.set(1, 0.9, 1.5); ab.position.z = -0.16; this.g.add(ab);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.066, 0.016, 6, 12), blk); stripe.position.z = -0.14; this.g.add(stripe);
    const stripe2 = stripe.clone(); stripe2.position.z = -0.2; stripe2.scale.setScalar(0.85); this.g.add(stripe2);
    const wm = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    this.wl = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.07), wm); this.wl.position.set(-0.1, 0.07, 0); this.g.add(this.wl);
    this.wr = this.wl.clone(); this.wr.position.x = 0.1; this.g.add(this.wr);
    this.g.scale.setScalar(2.3);
    parent.add(this.g);
    this.home = home.clone();
    this.pos = home.clone().add(new THREE.Vector3(rand(-0.5, 0.5), rand(-0.3, 0.4), rand(-0.3, 0.6)));
    this.phase = rand(0, 6.28) + i; this.hp = 0.55; this.alive = true; this.chase = false; this.cd = rand(0.2, 1.2);
    this.vy = 0; this.t = 0; this.retreat = 0; this.rv = new THREE.Vector3();
    this.g.position.copy(this.pos);
  }
  dispose() { this.g.parent && this.g.parent.remove(this.g); }
}

export class WaspMission extends FieldMission {
  constructor(G, def) { super(G, def); this.sprayOk = false; this.killed = 0; this.nestTaken = false; this.swarm = false; this.hold = 0; this.stings = 0; }
  quizPool() { return QUIZ.m9; }

  async setup() {
    const G = this.G, W = G.world, P = G.player, C = LAYOUT.siteC;
    this.baseSetup();
    const front = C.z + C.d / 2; // -17
    this.front = front;
    const nx = 269.3, ny = 6.15, nz = front + 0.42;
    this.nest = V(nx, ny, nz);

    // 벌집 모델
    const ng = new THREE.Group();
    const nm = std('#b49a74', 0.95, 0);
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.42 - i * 0.025, 14, 10), nm);
      s.scale.set(1, 0.55, 1); s.position.y = 0.22 - i * 0.12; s.castShadow = true; ng.add(s);
    }
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.1, 12), new THREE.MeshBasicMaterial({ color: '#1a1410' })); hole.rotation.x = Math.PI / 2; hole.position.y = -0.4; ng.add(hole);
    ng.position.copy(this.nest); G.engine.scene.add(ng); this.addProp(ng); this.nestMesh = ng;

    // 말벌 8마리 (벌집 주변을 맴돌다가 접근하면 달려듦)
    for (let i = 0; i < 8; i++) this.wasps.push(new Wasp(G.engine.scene, this.nest, i));
    for (const w of this.wasps) this.addProp(w.g);

    // 소방차 · 장비
    const tr = W.truck.position;
    this.suppPt = V(tr.x, 0, tr.z - 2.9);
    this.amb = V(tr.x + 8, 0, -6.4);
    this.ambRing = this.ring(this.amb.x, this.amb.z, 1.6, '#4be08a');
    this.nestRing = this.ring(this.nest.x, this.nest.z + 5.5, 1.4, '#ff8a3a');

    // 사다리 위치 (벌집 바로 옆 벽)
    const Apt = V(268.15, 0, front + 2.5), Bpt = V(268.15, 5.45, front + 0.55);
    this.setupLadderKit({
      truckPt: this.suppPt, A: Apt, B: Bpt, topStand: null, face: Math.PI, extra: 0.8,
      canTake: () => this.swarmDone,
      onTake: () => { this.complete('take'); },
      onPlace: () => { this.complete('place'); },
      canClimb: () => this.swarmDone,
      onBottom: () => {
        P.pos.set(Apt.x, 0, Apt.z + 1.0); P.heading = 0; P.root.rotation.y = 0; G.camRig.yaw = 0;
        if (this.nestTaken) G.ui.toast('벌집을 안전하게 가지고 내려왔습니다 — 소방차 밀봉 용기로!', 'good');
      },
    });
    // 사다리 위에서 벌집 제거 (기본 interact 는 control 중 동작하지 않으므로 update 에서 처리)

    this.addInteract({
      pos: this.suppPt, radius: 3.6, label: '벌 퇴치 스프레이 챙기기', hold: 1.0,
      enabled: () => !this.sprayOk,
      onUse: () => {
        this.sprayOk = true; P.allowed = { ...P.allowed, spray: true }; P.equip('spray'); P.stats.ext = 100;
        G.sfx.ok(); G.ui.toast('스프레이 장착 — 벌 쪽을 조준하고 Space/클릭(🔘)으로 분사하세요', 'good'); this.complete('spray');
      },
    });
    this.addInteract({
      pos: this.suppPt, radius: 3.6, label: '스프레이 보충', hold: 1.0,
      enabled: () => this.sprayOk && P.stats.ext < 85,
      onUse: () => { P.stats.ext = 100; G.sfx.ok(); G.ui.toast('스프레이를 보충했습니다', 'good'); },
    });
    this.addInteract({
      pos: this.amb, radius: 3.2, label: '벌집 밀봉 용기에 인계', hold: 1.2,
      enabled: () => this.nestTaken && !this.sealed,
      onUse: () => {
        this.sealed = true; this.complete('seal'); G.ui.banner('벌집 제거 완료'); G.sfx.ok();
        setTimeout(() => this.finish(true), 1600);
      },
    });

    this.addObj('spray', '소방차에서 벌 퇴치 스프레이를 챙긴다')
      .addObj('kill', '벌집에 접근해 달려드는 말벌을 모두 퇴치한다', '0/8')
      .addObj('take', '말벌이 사라지면 소방차에서 사다리를 꺼낸다')
      .addObj('place', '벌집 옆 벽에 사다리를 설치한다')
      .addObj('nest', '사다리 위에서 벌집을 제거한다 (E 길게)')
      .addObj('seal', '벌집을 밀봉 용기에 인계한다');
    this.setActive('spray');
    this.swarmDone = false;
    G.ui.toast('말벌집 신고 — 벌집 쪽 12m 안으로 들어가면 말벌이 달려듭니다. 먼저 스프레이를 챙기세요', 'info');
  }

  onSpray(m, dir, dt) {
    for (const w of this.wasps) {
      if (!w.alive) continue;
      const v = w.pos.clone().sub(m), d = v.length();
      if (d > 8.5 || d < 0.2) continue;
      if (v.divideScalar(d).dot(dir) > 0.9) {
        w.hp -= dt; w.stun = 0.4;
        if (w.hp <= 0) this.killWasp(w);
      }
    }
  }

  killWasp(w) {
    w.alive = false; w.vy = 0; w.deadT = 0; this.killed++;
    this.G.sfx.tone(300, 0.1, 'square', 0.08, -150);
    this.setCount('kill', `${this.killed}/${this.wasps.length}`);
    if (this.killed >= this.wasps.length) {
      this.swarmDone = true; this.complete('kill'); this.G.ui.banner('말벌 퇴치 완료'); this.G.ui.toast('이제 소방차에서 사다리를 꺼내 벌집을 제거하세요', 'good');
    }
  }

  update(dt) {
    const G = this.G, P = G.player;
    this.tickHumans(dt);
    const inp = G.input;
    // 말벌 AI
    const head = V(P.pos.x, P.pos.y + 1.35, P.pos.z);
    const nd = Math.hypot(P.pos.x - this.nest.x, P.pos.z - this.nest.z);
    if (!this.swarm && this.sprayOk && nd < 12) {
      this.swarm = true; G.ui.banner('🐝 말벌이 달려듭니다!', 2000); G.ui.toast('스프레이를 벌 쪽으로 조준해 분사하세요. 낮은 자세·침착하게!', 'warn');
      this.wasps.forEach((w, i) => { w.chase = true; w.cd = i * 0.45; });
      this.hideRing(this.nestRing);
    } else if (!this.swarm && !this.sprayOk && nd < 12 && !this._early) { this._early = true; this.mistake('스프레이 없이 벌집에 접근했습니다 (먼저 장비를 챙기세요)', 60); G.ui.toast('벌들이 예민해졌습니다! 먼저 소방차에서 스프레이를 챙기세요', 'warn'); }
    let near = 0;
    for (const w of this.wasps) {
      w.t += dt;
      const flap = Math.sin(w.t * 70) * 0.9;
      w.wl.rotation.z = flap; w.wr.rotation.z = -flap;
      if (!w.alive) {
        w.deadT += dt; w.vy -= 12 * dt; w.pos.y = Math.max(0.05, w.pos.y + w.vy * dt);
        w.g.rotation.z += dt * 5; w.g.position.copy(w.pos);
        if (w.deadT > 2.2) w.g.visible = false;
        continue;
      }
      if (!w.chase || this.nestTaken) {
        // 벌집 주변 맴돌기
        const a = w.t * 2.2 + w.phase;
        w.pos.set(w.home.x + Math.cos(a) * 0.9, w.home.y + Math.sin(a * 1.7) * 0.35, w.home.z + Math.sin(a) * 0.9 + 0.2);
      } else {
        w.cd -= dt;
        if (w.cd > 0) { w.pos.set(w.home.x + Math.cos(w.t * 3) * 0.7, w.home.y, w.home.z + Math.sin(w.t * 3) * 0.7); }
        else {
          const to = head.clone().sub(w.pos), d = to.length();
          if (w.retreat > 0) { w.retreat -= dt; w.pos.addScaledVector(w.rv, 3.2 * dt); }
          else {
            to.divideScalar(Math.max(d, 0.01));
            const sp = (w.stun > 0 ? 1.0 : 3.7) * (d > 1.4 ? 1 : 0.7);
            w.pos.addScaledVector(to, sp * dt);
            w.pos.x += Math.sin(w.t * 9 + w.phase) * 1.4 * dt; w.pos.y += Math.cos(w.t * 7 + w.phase) * 1.1 * dt; w.pos.z += Math.cos(w.t * 8 + w.phase) * 1.4 * dt;
            if (d < 0.95 && !P.control) {
              if (w.sting === undefined) w.sting = 0;
              w.sting -= dt;
              if (w.sting <= 0) {
                w.sting = 2.0; this.stings++;
                P.hurt(3, 'sting'); G.sfx.hurt(); G.shake = Math.max(G.shake || 0, 0.18);
                if (this.stings === 1) G.ui.toast('🐝 쏘였습니다! 스프레이로 빨리 퇴치하세요', 'bad');
                if (this.stings === 8) this.mistake('말벌에 여러 번 쏘였습니다 — 접근하는 벌을 먼저 제압해야 합니다', 80);
                w.rv.set(rand(-1, 1), rand(0.2, 1), rand(-1, 1)).normalize(); w.retreat = 0.5;
              }
            }
          }
        }
        if (w.stun > 0) w.stun -= dt;
        w.pos.y = Math.max(0.4, w.pos.y);
        if (head.distanceTo(w.pos) < 7) near++;
      }
      w.g.position.copy(w.pos);
      w.g.lookAt(w.pos.x + (head.x - w.pos.x), w.pos.y + (head.y - w.pos.y) * 0.5, w.pos.z + (head.z - w.pos.z));
    }
    this.buzz = this.wasps.some((w) => w.alive) ? (this.swarm ? 0.3 + Math.min(1, near / 4) * 0.7 : 0.18) : 0;

    // 사다리 위에서 벌집 제거 (E 길게)
    const onLad = P.control && P.control === this.climb && this.climb.s > 0.9 && this.swarmDone && !this.nestTaken;
    if (onLad) {
      if (inp.isDown('KeyE')) this.hold += dt; else this.hold = Math.max(0, this.hold - dt * 2);
      G.ui.setPrompt('벌집 제거 — E 길게 누르기', this.hold / 2.4);
      if (this.hold >= 2.4) {
        this.nestTaken = true; this.hold = 0; this.nestMesh.visible = false; G.ui.setPrompt(null);
        P.human.play('reach', 0.9); G.sfx.ok(); G.ui.toast('벌집을 봉투에 담았습니다 — 아래로 내려오세요 (S)', 'good'); this.complete('nest');
      }
    } else if (P.control === this.climb && this.climb) {
      G.ui.setPrompt(this.swarmDone && !this.nestTaken ? '위로 더 올라가 벌집 높이까지 접근 (W)' : null, null);
    }

    // 마커
    let t = null;
    if (!this.sprayOk) t = { pos: V(this.suppPt.x, 2.6, this.suppPt.z), label: '소방차 · 스프레이' };
    else if (!this.swarm) t = { pos: V(this.nest.x, this.nest.y + 1.2, this.nest.z), label: '말벌집' };
    else if (!this.swarmDone) t = null;
    else if (!this.placed && !this.hasLadder) t = { pos: V(this.suppPt.x, 2.6, this.suppPt.z), label: '소방차 · 사다리' };
    else if (this.hasLadder) t = { pos: V(this.lad.A.x, 1.8, this.lad.A.z), label: '사다리 설치 위치' };
    else if (!this.nestTaken) t = { pos: V(this.nest.x, this.nest.y + 1.0, this.nest.z), label: '벌집 제거' };
    else if (!this.sealed) t = { pos: V(this.amb.x, 2.4, this.amb.z), label: '밀봉 용기 인계' };
    this.markerTarget = t;
    if (this.swarmDone && this.hasLadder === false && !this.placed && !this.ringShown) {
      this.ringShown = true;
      this.ringA = this.ring(this.lad.A.x, this.lad.A.z, 1.2, '#ffd24a');
    }
  }
}
