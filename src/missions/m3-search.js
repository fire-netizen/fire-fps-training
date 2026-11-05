// 임무 3 — 연기 속 인명검색·구조: 면체 착용 · 낮은 자세 · 문 개방 절차(백드래프트) · 진압 · 구조 · 탈출
import * as THREE from 'three';
import { Mission } from './mission.js';
import { Human } from '../character/human.js';
import { HoseLine } from '../world/hose.js';
import { QUIZ } from '../data/quizzes.js';
import { clamp, rand } from '../core/util.js';

export class SmokeMission extends Mission {
  constructor(G, def) {
    super(G, def);
    this.showAir = true;
    this.checked = false;
    this.opened = false;
    this.searched = false;
    this.found = false;
    this.surv = null;
    this.cond = 100;
    this.doorAnim = 0;
    this.exited = false;
  }

  quizPool() { return QUIZ.m3; }

  async setup() {
    const G = this.G, W = G.world, P = G.player, I = W.intB;
    this.I = I;
    G.fx.clearAll();
    W.showZone('smoky');
    P.setGear({ pants: true, boots: true, coat: true, hood: true, scba: true, helmet: true, gloves: true });
    P.setMask(false);
    P.resetStats(G.progress);
    P.allowed = { hose: true, ext: false, tic: true };
    P.hoseReady = true;
    P.tic = false;
    P.equip(null);
    P.mode = 'jet';
    P.teleport(I.spawn, 0);
    I.doorB.open = false; I.doorB.solid.active = true; I.doorB.leaf.rotation.y = 0;
    I.doorB.hotGlow.material.opacity = 0.0;

    // 화점 (방 B 내부) + 연기
    this.fire = G.fx.addFire(I.fireSpot, { size: 1.45, hp: 130, type: 'A', heat: 6, smoke: 0.7, label: '실내 화점' });
    this.fire.hidden = true;
    I.smokeAt.forEach((p, k) => G.fx.addSmokeSource(p, k < 4 ? 4.5 : 6, 2.6));

    // 요구조자
    const sv = new Human({ skin: '#dbb08c', hair: '#2a1b14', shirt: '#b8696a', pants: '#3d4457', longHair: true });
    sv.root.position.copy(I.survivorSpot);
    sv.root.rotation.y = Math.PI;
    sv.setLying(true);
    G.engine.scene.add(sv.root);
    this.addHuman(sv);
    this.surv = sv;
    // 열화상용 발열 표시
    const heat = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.1, 6, 12), new THREE.MeshBasicMaterial({ color: '#fff2a8', transparent: true, opacity: 0.85, depthTest: false, blending: THREE.AdditiveBlending }));
    heat.rotation.x = Math.PI / 2;
    heat.position.set(I.survivorSpot.x, 0.35, I.survivorSpot.z - 0.9);
    heat.renderOrder = 20;
    heat.visible = false;
    G.engine.scene.add(heat);
    this.addProp(heat);
    this.thermal.push(heat);
    const doorHeat = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.1, 1.2), new THREE.MeshBasicMaterial({ color: '#ff6a2a', transparent: true, opacity: 0.55, depthTest: false, blending: THREE.AdditiveBlending }));
    doorHeat.position.set(I.doorB.pos.x + 0.1, 1.05, I.doorB.pos.z);
    doorHeat.visible = false; doorHeat.renderOrder = 20;
    G.engine.scene.add(doorHeat);
    this.addProp(doorHeat);
    this.thermal.push(doorHeat);
    this.doorHeat = doorHeat;

    // 호스
    this.hose = new HoseLine(G.engine.scene);
    this.hose.visible = true;
    this.addProp(this.hose.mesh);
    P.tether = { pos: I.p(0, 0, 1.2), max: 34 };
    this.hosePt = I.p(0, 0.9, -0.8);

    // 상호작용
    this.addInteract({
      pos: I.spawn, radius: 4, label: '공기호흡기 면체 착용', enabled: () => !P.mask,
      onUse: () => {
        P.setMask(true); P.human.play('check', 0.9);
        G.ui.toast('면체 착용 완료 — 공기호흡기 정상 작동', 'good');
        this.complete('mask');
      },
    });
    this.addInteract({
      pos: I.roomA.center, radius: 4.6, label: '거실 수색 완료 표시 (분필)',
      enabled: () => P.mask && !this.searched,
      onUse: () => {
        this.searched = true; P.human.play('reach', 0.9);
        G.ui.toast('거실 수색 완료 — 요구조자 없음', 'good');
        this.complete('search');
      },
    });
    this.addInteract({
      pos: I.doorB.pos, radius: 2.5, label: '문 표면 온도 확인 (손등)', enabled: () => P.mask && !this.checked && !I.doorB.open,
      onUse: () => {
        this.checked = true; P.human.play('check', 1.1);
        I.doorB.hotGlow.material.opacity = 0.85;
        G.ui.banner('🔥 문이 매우 뜨겁습니다 · 틈새로 연기 배출', 3200);
        G.ui.toast('백드래프트 위험 — 낮은 자세로 문 옆에서 천천히 개방하세요', 'warn');
        this.complete('check');
      },
    });
    this.addInteract({
      pos: I.doorB.pos, radius: 2.5, label: '문 개방', enabled: () => this.checked && !I.doorB.open,
      onUse: () => this.openDoor(),
    });
    this.addInteract({
      pos: I.survivorSpot, radius: 2.4, label: '요구조자 구조 (어깨에 메기)',
      enabled: () => I.doorB.open && !P.carry,
      onUse: () => {
        if (this.fire.alive && this.fire.pos.distanceTo(P.pos) < 3.2) { G.ui.toast('화점이 가깝습니다! 먼저 진압하세요', 'warn'); return; }
        P.pickUp(this.surv);
        P.crouch = false;
        G.ui.toast('요구조자를 어깨에 메었습니다 — 출구로 이동하세요', 'good');
        this.complete('rescue');
      },
    });

    this.addObj('mask', '공기호흡기 면체 착용')
      .addObj('search', '거실(왼쪽 방) 수색 후 분필 표시')
      .addObj('check', '안쪽 방 문 표면 온도 확인')
      .addObj('open', '낮은 자세로 문 옆에서 안전하게 개방')
      .addObj('fire', '실내 화점 진압 (1 관창 · Space)')
      .addObj('rescue', '요구조자 발견 · 구조')
      .addObj('exit', '건물 밖으로 탈출');
    this.setActive('mask');
    G.fx.onWrongAgent = null;
  }

  openDoor() {
    const G = this.G, P = G.player, D = this.I.doorB;
    const dz = Math.abs(P.pos.z - D.pos.z);
    const ok = P.crouch && dz >= 0.7;
    D.open = true; D.solid.active = false; this.doorAnim = 1;
    D.hotGlow.material.opacity = 0;
    this.doorHeat.visible = false;
    if (ok) {
      G.ui.toast('안전하게 개방했습니다 — 짧게 분무하며 천장부 열기를 식히세요', 'good');
      for (let i = 0; i < 40; i++) G.fx.smoke.emit({ x: D.pos.x + 0.6, y: 2.0 + rand(0, 0.5), z: D.pos.z + rand(-0.5, 0.5), vx: rand(0.5, 2), vy: rand(0, 0.6), vz: rand(-0.4, 0.4), life: rand(1.5, 2.6), s0: 0.8, s1: 2.2, a0: 0.5, a1: 0, c0: [0.1, 0.1, 0.1], drag: 0.8 });
      this.complete('open');
    } else {
      // 백드래프트
      const why = !P.crouch ? '서 있는 자세로' : '문 정면에서';
      this.mistake(`${why} 문을 열어 백드래프트가 발생했습니다 — 문 옆에서 낮은 자세로 천천히 열어야 합니다`, 160);
      P.hurt(38, 'backdraft'); G.sfx.hurt();
      G.ui.banner('💥 백드래프트!', 2000);
      this.fire.flareUp();
      for (let i = 0; i < 90; i++) {
        const a = rand(-0.9, 0.9);
        G.fx.flame.emit({ x: D.pos.x + 0.5, y: rand(0.6, 2), z: D.pos.z + rand(-0.4, 0.4), vx: rand(3, 9), vy: rand(-0.5, 1.8), vz: Math.sin(a) * 3, life: rand(0.5, 1.0), s0: 0.9, s1: 2.8, a0: 0.95, a1: 0, c0: [1, 0.85, 0.4], c1: [0.9, 0.2, 0.05] });
      }
      // 뒤로 밀려남
      P.pos.x = Math.min(P.pos.x, D.pos.x - 1.2);
      this.complete('open');
    }
  }

  update(dt) {
    const G = this.G, P = G.player, I = this.I, st = P.stats, D = I.doorB;
    // 문 회전 애니메이션
    if (D.open) D.leaf.rotation.y = THREE.MathUtils.damp(D.leaf.rotation.y, 1.5, 4, dt);
    // 화점 연기가 문이 열릴 때만 시야에 보이도록: 불 자체는 벽에 가려짐
    if (this.checked && !D.open) {
      D.hotGlow.material.opacity = 0.55 + 0.3 * Math.sin(this.time * 6);
      if (Math.random() < dt * 14) G.fx.smoke.emit({ x: D.pos.x - 1.6 + rand(0, 0.3), y: 2.05, z: D.pos.z + rand(-0.5, 0.5), vx: rand(-0.2, 0.2), vy: rand(0.1, 0.5), vz: rand(-0.3, 0.3), life: 2.2, s0: 0.3, s1: 1.0, a0: 0.5, a1: 0, c0: [0.05, 0.05, 0.05], drag: 0.6 });
    }
    // 호스
    const hand = P.human.arms.R.hand.getWorldPosition(new THREE.Vector3());
    this.hose.update(this.hosePt, hand);
    // 시야(안개): 서 있으면 연기에 갇힘, 자세를 낮추면 개선, 열화상은 연기를 투과
    const base = P.crouch ? 0.075 : 0.125;
    G.engine.setDensity(P.tic ? 0.026 : base);
    this.smokeFx = P.tic ? 0.12 : P.crouch ? 0.3 : 0.5;
    // 발견
    if (!this.found && this.surv && P.pos.distanceTo(this.surv.root.position) < (P.tic ? 9 : 3.6)) {
      this.found = true;
      G.ui.toast('요구조자 발견!', 'good');
    }
    // 화점
    if (!this.fire.alive && !this.objs.find((o) => o.id === 'fire').done) { this.complete('fire'); G.ui.toast('실내 화점 진압 완료', 'good'); }
    // 요구조자 상태
    if (D.open && !this.exited) {
      const rate = (this.fire.alive ? 0.7 : 0.3) * (P.carry ? 0.8 : 1);
      this.cond = clamp(this.cond - rate * dt, 0, 100);
      if (this.cond <= 0) { this.finish(false, '요구조자의 생존 가능 시간이 소진되었습니다.'); return; }
    }
    this.survivorCond = this.found || D.open ? this.cond : null;
    // 공기 경고 / 소진
    if (P.mask && st.air < 30 && !this._airWarn) { this._airWarn = true; G.ui.banner('⚠ 공기 잔량 부족 — 즉시 철수', 2400); }
    if (st.air >= 30) this._airWarn = false;
    // 탈출
    if (P.carry && P.pos.z < I.exit.z + 0.5 && !this.exited) {
      this.exited = true;
      this.complete('exit');
      this.carriedOut = true;
      G.ui.banner('요구조자 구조 완료!', 2400);
      setTimeout(() => this.finish(true), 1300);
    }
    // 마커
    const t = this.objs.find((o) => o.active);
    const id = t && t.id;
    let tgt = null;
    if (id === 'mask') tgt = [I.spawn.x, 1.8, I.spawn.z, '면체 착용'];
    else if (id === 'search') tgt = [I.roomA.center.x, 1.8, I.roomA.center.z, '거실 수색'];
    else if (id === 'check' || id === 'open') tgt = [D.pos.x, 2.3, D.pos.z, id === 'check' ? '문 온도 확인' : '문 개방'];
    else if (id === 'fire') tgt = [this.fire.pos.x, 2.2, this.fire.pos.z, '화점'];
    else if (id === 'rescue' && (this.found || P.tic)) tgt = [this.surv.root.position.x, 1.4, this.surv.root.position.z, '요구조자'];
    else if (id === 'exit') tgt = [I.exit.x, 2.4, I.exit.z + 0.6, '출구'];
    this.markerTarget = tgt ? { pos: new THREE.Vector3(tgt[0], tgt[1], tgt[2]), label: tgt[3] } : null;
    this.surv.update(dt, {});
  }

  teardown() {
    const G = this.G;
    this.hose && this.hose.dispose();
    G.fx.clearAll();
    G.engine.setDensity(G.engine.zone.density);
    if (this.carriedOut) { this.G.player.carry = null; }
    this.G.player.carry = null;
    this.G.player.setMask(false);
    this.G.player.tic = false;
    this.G.world.intB.doorB.open = false;
  }
}
