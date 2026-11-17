import * as THREE from 'three';
import { Mission } from './mission.js';
import { Human } from '../character/human.js';

const QUIZZES = [
  {q:'감지기 시험 후 수신기에 화재가 표시되었지만 경종이 울리지 않았다. 다음으로 확인할 것은?',options:['수신기의 경종 정지 상태와 음향 출력 상태','감지기를 무조건 교체한다','표시만 있으므로 정상으로 기록한다','전원을 끄고 퇴실한다'],explain:'입력 신호가 도착했는지와 경보 출력이 실제로 동작했는지를 구분해 확인합니다. 이 실습에서는 경종 정지 상태가 원인이었습니다.'},
  {q:'점검 중 원인을 바로잡은 다음 필요한 과정은?',options:['같은 조건으로 재시험해 수신과 경보 반응을 확인한다','수정했으므로 바로 정상 판정한다','정지 스위치를 켜 두고 종료한다','기존 기록을 지운다'],explain:'조치만으로 정상 작동을 확인할 수는 없습니다. 재시험한 결과를 근거로 판정하고 복구 상태도 확인합니다.'},
  {q:'실습 종료 전 수신기를 복구하려면 먼저 확인할 것은?',options:['시험 입력이 해제되었는지와 정지 상태가 남아 있지 않은지','외함 색상이 같은지','점검 시간이 가장 짧은지','경보음만 멈췄는지'],explain:'입력 해제, 수신기 복구, 정지 상태 해제, 정상 감시 복귀를 확인합니다. 실제 장비의 세부 조작은 해당 설명서와 승인된 점검 절차를 따릅니다.'},
  {q:'수신기 표시만 보고 경보설비 전체를 정상으로 판단해도 되는가?',options:['현장의 음향·시각경보 반응까지 확인해야 한다','화재 표시가 있으면 모두 정상이다','시험 도구만 있으면 정상이다','경계구역은 확인하지 않아도 된다'],explain:'신호 수신과 현장 경보 출력은 별도로 확인해야 합니다.'},
];
const fullGear={pants:true,boots:true,coat:true,hood:true,helmet:true,gloves:true,scba:true};
export class AlarmLabMission extends Mission {
  constructor(G,def){super(G,def);this.training=true;this.busy=false;this.events=[];this.s={prepared:false,tool:null,alarm:false,silenced:true,source:null,inputActive:false,cycle:0,received:false,observed:false,fixed:false,firstReset:false,reReceived:false,reObserved:false,restored:false,reported:false};}
  quizPool(){return QUIZZES;}
  tick(dt){if(this.ended)return;this.time+=dt;this.update(dt);}
  async setup(){
    const G=this.G,W=G.world,P=G.player;this.room=W.alarmRoom;W.showZone('alarm');G.fx.clearAll();
    P.setMask(false);P.setGear(fullGear);P.resetStats(G.progress);P.allowed={hose:false,ext:false,tic:false};P.hoseReady=false;P.tic=false;P.tether=null;P.carry=null;P.equip(null);P.teleport(this.room.spawn,0);G.camRig.pitch=.08;
    this.room.drawPanel(this.s);document.body.classList.add('alarm-lab');
    const display=new Human({skin:'#c99472',hair:'#1b1511',detailed:true});display.setGear(fullGear);display.root.position.copy(this.room.stations.character);display.root.position.y=.1;display.root.rotation.y=.65;this.addHuman(display);this.display=display;
    const station=(key,label,fn,radius=2.15)=>this.addInteract({pos:this.room.stations[key],radius,label,onUse:()=>this.open(fn)});
    station('log','실습 준비 · 점검 기록',()=>this.log(),2.1);
    station('detector','감지기·발신기 · 시험 도구와 작동시험',()=>this.detector());
    station('panel','수신기 · 표시 확인 및 정밀 조작',()=>this.panel());
    station('outputs','경종·시각경보기 · 현장 반응 확인',()=>this.outputs());
    station('character','소방관 보호장비 · 가까이 관찰',()=>this.character(),1.9);
    this.addObj('prepare','점검 기록대에서 시험 계획 확인')
      .addObj('test','연기감지기 시험 도구 선택·작동시험')
      .addObj('receive','수신기에서 입력 구역과 신호 확인')
      .addObj('observe','음향·시각경보 반응 관찰·판정')
      .addObj('fix','경종 정지 원인 해소 후 1차 복구')
      .addObj('retest','재시험: 수신기와 두 경보 반응 확인')
      .addObj('restore','입력 해제·정상 감시 복귀 확인')
      .addObj('report','실제 수행 내용으로 점검 기록 제출');
    this.setActive('prepare');
    this.hud=document.createElement('div');this.hud.className='lab-heading';this.hud.innerHTML='<span class="lab-eyebrow">FIRE SAFETY ACADEMY / PRACTICE 01</span><h2>경보설비 실습실</h2><p>작은 신호를 읽고, 안전을 확인하다.</p><div class="lab-route"><span>01 입력</span><i>→</i><span>02 수신</span><i>→</i><span>03 경보</span></div>';document.getElementById('hud').append(this.hud);
    this.record('실습실 입실 · 최초 상태: 경종 정지 ON');
    G.ui.toast('V 또는 화면의 시점 버튼으로 1·3인칭 전환 · 기록대에서 실습을 시작하세요','info');
  }
  record(text){this.events.push({time:Math.floor(this.time),text});}
  async open(fn){if(this.busy||this.ended||this.G.resolving)return;this.busy=true;this.G.state='modal';this.G.player.firing=false;this.G.input.buttons.clear();this.G.input.down.clear();try{await fn();}finally{this.G.ui.close();this.busy=false;if(!this.ended)this.G.resume();else this.G.state='play';}}
  async ask(html,buttons){return this.G.ui.ask(html,buttons,'lab-modal');}
  info(title,text){return `<div class="lab-dialog"><div class="lab-eyebrow">FIRE SYSTEMS LAB / 교육용 가상 설비</div><h2>${title}</h2><p>${text}</p></div>`;}
  wrong(text,pen=60){this.mistake(text,pen);this.feedback=text;this.record('재학습: '+text);}
  async character(){
    await this.ask(this.info('대원 · 보호장비 관찰','방화복의 겹침과 봉제선, 반사띠, 헬멧 턱끈, 장갑의 손가락, 공기호흡기 압력계·등판·고정 밴드를 관찰하세요. 이 대원은 진압 장비를 보여 주는 전시 모델입니다. 실제 점검 시 보호장비는 작업 위험에 맞게 선정합니다.')+'<div class="lab-facts"><span>방화복 / 관절 보강</span><span>헬멧 / 턱끈</span><span>SCBA / 압력계</span><span>장갑 / 안전화</span></div>',[{label:'공간으로 돌아가기',value:'close',primary:true}]);
  }
  async log(){
    if(!this.s.prepared){const v=await this.ask(this.info('시험 전 준비','실습동 1구역의 연기감지기와 경보 반응을 점검합니다. 관계인 통보, 시험 범위와 경보 영향 확인을 먼저 수행합니다. 이 공간은 실제 화재·외부 통보가 없는 교육용 독립 회로입니다.')+'<div class="lab-callout">목표: 입력 → 수신 → 경보를 각각 확인하고, 이상 원인을 수정한 뒤 재시험·복구까지 완료하세요.</div>',[{label:'시험 범위·통보·안전 확인 완료',value:'ready',primary:true},{label:'아직 준비하지 않음',value:'close'}]);if(v==='ready'){this.s.prepared=true;this.complete('prepare');this.record('시험 범위·관계인 통보·안전 확인 완료');}return;}
    const ready=this.s.restored&&this.s.reReceived&&this.s.reObserved&&!this.s.alarm&&!this.s.silenced&&!this.s.inputActive;
    const lines=this.events.map(e=>`<li><time>${String(Math.floor(e.time/60)).padStart(2,'0')}:${String(e.time%60).padStart(2,'0')}</time>${e.text}</li>`).join('');
    const v=await this.ask(this.info('실습 점검 기록',ready?'재시험 정상 · 시험 입력 해제 · 정상 감시 복귀를 확인했습니다.':'아직 수료 조건을 충족하지 않았습니다. 목표 목록의 미완료 항목을 수행하세요.')+`<ol class="lab-log">${lines}</ol><div class="lab-callout">${ready?'최종 판정: 경종 정지 해제 후 재시험 정상 / 감시 복귀 확인':'최종 판정: 점검 진행 중 / 제출 불가'}</div>`,[...(ready?[{label:'점검 기록 제출 · 수료 평가',value:'submit',primary:true}]:[]),{label:'실습 계속하기',value:'close'}]);
    if(v==='submit'&&ready){this.s.reported=true;this.complete('report');this.record('점검 기록 제출');this.finish(true);}
  }
  async detector(){
    this.feedback='';
    while(!this.ended){
      if(!this.s.prepared){await this.ask(this.info('시험 전 준비가 필요합니다','먼저 입구 오른쪽의 점검 기록대에서 시험 범위와 안전 사항을 확인하세요.'),[{label:'돌아가기',value:'close',primary:true}]);return;}
      const stage=this.s.cycle===0?'최초 시험':this.s.firstReset&&!this.s.reObserved?'재시험 준비':'시험 진행 상태';
      const v=await this.ask(this.info('01 · 감지기와 발신기',`연기감지기 / 실습동 1구역 · ${stage}`)+`<div class="lab-callout">선택 도구: <b>${this.s.tool==='smoke'?'연기감지기 시험기':this.s.tool==='heat'?'열감지기 시험기':'미선택'}</b><br>${this.feedback||'감지 방식에 맞는 도구로 시험하고 수신기와 현장 경보를 따로 확인하세요.'}</div>`,[
        {label:'연기감지기 시험기 선택',value:'smoke',primary:!this.s.tool},{label:'열감지기 시험기 선택',value:'heat'},
        {label:this.s.cycle===0?'감지기 최초 시험':'감지기 재시험',value:'test',primary:this.s.tool==='smoke'},
        {label:'발신기 별도 체험',value:'manual'},{label:'공간으로 돌아가기',value:'close'}]);
      if(v==='close')return;
      if(v==='smoke'||v==='heat'){this.s.tool=v;this.feedback=v==='smoke'?'연기감지기용 시험기를 준비했습니다.':'현재 대상은 연기감지기입니다. 감지 방식에 맞는 도구를 선택하세요.';continue;}
      if(v==='manual'){
        if(!this.s.restored){this.feedback='발신기 별도 체험은 필수 감지기 점검과 정상 복귀를 완료한 뒤 이용할 수 있습니다.';continue;}
        this.startSignal('manual');this.feedback='발신기 신호를 발생시켰습니다. 수신기에 1구역 발신기로 표시됩니다. 복구 후 기록을 제출하세요.';this.s.restored=false;continue;
      }
      if(v==='test'){
        if(this.s.tool!=='smoke'){this.wrong('연기감지기에 맞는 시험 도구를 선택해야 합니다.');continue;}
        if(this.s.cycle>0&&!this.s.firstReset){this.feedback='수신기 표시와 경보 반응을 확인하고, 원인 조치 후 1차 복구를 먼저 완료하세요.';continue;}
        if(this.s.cycle>=2){this.feedback='필수 재시험은 완료했습니다. 수신기에서 정상 감시로 복구하세요.';continue;}
        this.s.cycle++;this.startSignal('detector');this.complete('test');this.record(`${this.s.cycle===1?'최초 시험':'재시험'} · 연기감지기 시험기 사용`);this.G.ui.banner('시험 입력 발생 · 수신기와 경보 반응을 확인하세요',2400);return;
      }
    }
  }
  startSignal(source){this.s.source=source;this.s.alarm=true;this.s.inputActive=true;this.inputT=2.4;this.room.pole.visible=source==='detector';this.room.drawPanel(this.s);this.record(`${source==='manual'?'발신기':'감지기'} 입력 → 수신기 1구역 화재 표시`);this.G.sfx.tone(880,.18,'triangle',.1);}
  panelHTML(){const s=this.s;return `<div class="receiver-ui"><div class="receiver-brand"><span>FH—01</span><small>교육용 가상 수신기 / 1구역</small></div><div class="receiver-face"><div class="receiver-screen"><small>SYSTEM STATUS</small><strong>${s.alarm?'화재 신호 수신':'정상 감시 중'}</strong><span>${s.alarm?`1구역 / ${s.source==='manual'?'발신기':'연기감지기'}`:'시험 입력 없음 · 전원 정상'}</span><p>${s.inputActive?'시험 입력 유지 중':'시험 입력 해제됨'}</p></div><div class="receiver-leds"><span><i class="on green"></i>주전원</span><span><i class="${s.alarm?'on red':''}"></i>화재</span><span><i class="${s.silenced?'on amber':''}"></i>경종 정지</span></div></div><div class="signal-line"><span class="${s.alarm?'lit':''}">입력</span><b>→</b><span class="${s.alarm?'lit':''}">수신</span><b>→</b><span class="${s.alarm&&!s.silenced?'lit':''}">음향</span><span class="${s.alarm?'lit':''}">시각</span></div><p class="receiver-feedback">${this.feedback||'표시 상태를 읽고 아래에서 조작을 선택하세요. 실제 제품별 조작 순서는 다를 수 있습니다.'}</p></div>`;}
  async panel(){
    this.feedback='';
    while(!this.ended){const s=this.s;const v=await this.ask(this.panelHTML(),[
      {label:'표시 판독 · 1구역 화재 입력 확인',value:'read',primary:s.alarm},
      {label:s.silenced?'경종 정지 해제 · 정상 위치':'경종 정지 ON',value:'silence'},
      {label:'수신기 복구 · 감시 상태 확인',value:'reset'},
      {label:'공간으로 돌아가기',value:'close'}]);
      if(v==='close')return;
      if(v==='read'){
        if(!s.alarm){this.feedback='현재 화재 입력이 없습니다. 감지기에서 작동시험을 먼저 수행하세요.';continue;}
        if(s.source==='manual'){this.feedback='1구역 발신기 입력입니다. 감지기 입력과 같은 구역이어도 발생 장치가 다릅니다.';this.record('별도 체험: 1구역 발신기 표시 확인');continue;}
        if(s.cycle===1){s.received=true;this.complete('receive');this.record('최초 시험: 수신기 1구역 감지기 입력 확인');}
        if(s.cycle===2){s.reReceived=true;this.record('재시험: 수신기 1구역 감지기 입력 확인');this.checkRetest();}
        this.feedback='1구역 감지기 입력을 확인했습니다. 경보장치 앞에서 실제 음향·시각 반응도 확인하세요.';
      }
      if(v==='silence'){
        if(s.silenced){
          if(!s.received||!s.observed){this.feedback='먼저 최초 시험의 수신 표시와 현장 경보 반응을 기록하세요. 원인을 판단한 뒤 조치합니다.';continue;}
          s.silenced=false;s.fixed=true;this.feedback='경종 정지를 해제했습니다. 시험 입력 해제 후 복구하고 같은 조건으로 재시험하세요.';this.record('원인 조치: 경종 정지 ON → OFF');
        }else{this.wrong('정상 감시를 위해 경종 정지를 해제한 상태로 마무리해야 합니다.',80);this.feedback='이 실습에서는 조치된 정상 상태를 유지합니다. 경보 정지는 수행하지 않았습니다.';}
      }
      if(v==='reset'){
        if(s.inputActive){this.feedback='시험 입력이 아직 유지 중입니다. 공간으로 돌아가 시험기가 해제될 때까지 기다리세요.';continue;}
        if(!s.fixed||s.silenced){this.wrong('경종 미작동 원인을 해소하고 재시험해야 합니다.',80);continue;}
        if(s.cycle===1&&s.received&&s.observed){s.alarm=false;s.source=null;s.firstReset=true;this.complete('fix');this.record('최초 시험 입력 해제·수신기 복구 / 재시험 준비');this.feedback='1차 복구 완료. 감지기에서 재시험을 수행하세요.';}
        else if(s.cycle===2&&s.reReceived&&s.reObserved){s.alarm=false;s.source=null;s.restored=true;this.complete('restore');this.record('입력 없음·경종 정지 OFF·수신기 정상 감시 복귀 확인');this.feedback='정상 감시 복귀 완료. 점검 기록대에서 결과를 제출하세요.';}
        else this.feedback='재시험의 수신 표시와 실제 음향·시각경보 반응을 모두 확인한 뒤 복구하세요.';
      }
      this.room.drawPanel(s);
    }
  }
  async outputs(){
    const s=this.s;if(!s.alarm){await this.ask(this.info('03 · 현장 경보 반응','현재 시험 신호가 없습니다. 감지기 시험 후 현장의 경종과 시각경보기를 확인하세요.'),[{label:'돌아가기',value:'close',primary:true}]);return;}
    const sound=!s.silenced;
    const v=await this.ask(this.info('03 · 현장 경보 반응','눈으로 보이는 점멸과 실제 들리는 음향을 각각 확인하고 관찰 결과를 선택하세요.')+`<div class="lab-observation"><div><span>경종</span><strong>${sound?'음향 발생':'음향 없음'}</strong></div><div><span>시각경보기</span><strong>점멸 중</strong></div></div>`,[{label:'음향 없음 / 시각 점멸 · 음향 출력 이상',value:'silent'},{label:'음향 발생 / 시각 점멸 · 두 출력 정상',value:'normal',primary:sound},{label:'나중에 다시 확인',value:'close'}]);
    if(v==='close')return;
    if((v==='normal')!==sound){this.wrong('현장 음향과 시각경보 반응을 각각 관찰해 판정해야 합니다.',80);return;}
    if(s.source==='manual'){this.record('별도 체험: 발신기 입력에 따른 음향·시각경보 확인');return;}
    if(s.cycle===1){s.observed=true;this.complete('observe');this.record('최초 시험: 음향 없음 / 시각 점멸 확인');this.G.ui.toast('수신기의 경종 정지 표시를 확인하고 정상 위치로 조치하세요','info');}
    if(s.cycle===2){s.reObserved=true;this.record('재시험: 음향 발생 / 시각 점멸 정상 확인');this.checkRetest();}
  }
  checkRetest(){if(this.s.reReceived&&this.s.reObserved){this.complete('retest');this.G.ui.toast('재시험 정상. 수신기에서 복구 후 기록을 제출하세요','good');}}
  update(dt){
    const s=this.s;this.display.update(dt,{speed:0});
    if(s.inputActive){this.inputT-=dt;if(this.inputT<=0){s.inputActive=false;this.room.pole.visible=false;this.room.drawPanel(s);this.record('시험기 제거 · 시험 입력 해제 (화재 표시는 복구 전 유지)');}}
    const flash=s.alarm&&(Math.floor(this.time*2)%2===0);this.room.beaconMat.emissiveIntensity=flash?3:0;
    if(s.alarm&&!s.silenced){this.bellT=(this.bellT||0)-dt;if(this.bellT<=0){this.G.sfx.tone(920,.26,'square',.055);this.bellT=.7;}}
    let key='log',label='실습 준비 · 점검 기록';
    const active=this.objs.find(o=>o.active)?.id;
    if(active==='test'||active==='retest'&&s.cycle===1){key='detector';label='감지기 작동시험';}
    else if(['receive','fix','restore'].includes(active)||active==='retest'&&!s.reReceived){key='panel';label='수신기 확인·조작';}
    else if(active==='observe'||active==='retest'&&!s.reObserved){key='outputs';label='현장 경보 반응 확인';}
    this.markerTarget={pos:this.room.stations[key].clone().add(new THREE.Vector3(0,2.3,0)),label};
  }
  result(quiz){const r=super.result(quiz);r.score+=r.timePen;r.timePen=0;r.over=0;r.stars=r.score>=1050?3:r.score>=800?2:1;if(this.penalty)r.stars=Math.min(2,r.stars);r.exp=120+r.stars*60+quiz.correct*25;return r;}
  teardown(){this.room.pole.visible=false;this.room.beaconMat.emissiveIntensity=0;this.room.drawPanel();this.hud?.remove();document.body.classList.remove('alarm-lab');}
}
