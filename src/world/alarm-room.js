// 교육용 가상 수신기: 특정 제조사 제품의 시험 절차를 복제하지 않는다.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture } from '../core/util.js';

const material = (color, metalness = 0, roughness = .65) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
export function buildAlarmRoom(W) {
  const group = new THREE.Group(); group.position.set(1500, 0, 400); W.scene.add(group);
  const p = (x, y, z) => new THREE.Vector3(x + 1500, y, z + 400);
  const solids = [];
  const solid = (x,y,z,w,h,d) => { const s=W.solid(1500+x,y,400+z,w,h,d,'alarm-room'); solids.push(s); return s; };
  const m = { wall:material('#d6ddd8'), navy:material('#172c38',.15), teal:material('#125b62',.2), steel:material('#8c9c9d',.75,.32), white:material('#e5e6dc',.12,.38), dark:material('#142029',.2), red:material('#b32924',.15), yellow:material('#e5b85a',.15), glass:material('#8faeb0',.2,.23) };
  const box=(w,h,d,x,y,z,mat,r=0)=>{const mesh=new THREE.Mesh(r?new RoundedBoxGeometry(w,h,d,3,r):new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;};
  const cylinder=(r,h,x,y,z,mat)=>{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,32),mat);mesh.position.set(x,y,z);mesh.castShadow=true;group.add(mesh);return mesh;};
  const sign=(text,w,h,x,y,z,{bg='#172c38',fg='#e9f0e9',size=42,rotation=0}={})=>{
    const tex=canvasTexture(THREE,1024,Math.max(64,Math.round(1024*h/w)),(c,cw,ch)=>{c.fillStyle=bg;c.fillRect(0,0,cw,ch);c.fillStyle=fg;const lines=text.split('\n'),font=Math.floor(ch/(lines.length===1?1.9:3));c.font=`600 ${font}px "Malgun Gothic",sans-serif`;c.textAlign='center';c.textBaseline='middle';lines.forEach((line,i,a)=>c.fillText(line,cw/2,ch/2+(i-(a.length-1)/2)*font*1.3,cw-45));});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:tex,roughness:.8}));mesh.position.set(x,y,z);mesh.rotation.y=rotation;group.add(mesh);return mesh;
  };
  // Slip-resistant tiled floor; joints, painted circulation route, wall protection.
  const floorTex=canvasTexture(THREE,512,512,(c,w,h)=>{c.fillStyle='#8b9999';c.fillRect(0,0,w,h);for(let i=0;i<1900;i++){const v=130+Math.random()*45;c.fillStyle=`rgba(${v},${v+5},${v+5},.2)`;c.fillRect(Math.random()*w,Math.random()*h,2,2);}c.strokeStyle='#6f8080';c.lineWidth=2;c.strokeRect(1,1,w-2,h-2);});floorTex.wrapS=floorTex.wrapT=THREE.RepeatWrapping;floorTex.repeat.set(10,8);floorTex.colorSpace=THREE.SRGBColorSpace;
  box(16,.12,12,0,-.07,6,new THREE.MeshStandardMaterial({map:floorTex,roughness:.83}));
  for(const x of [-7.95,7.95]){box(.18,4,12,x,2,6,m.wall);solid(x,2,6,.2,4,12);box(.08,.13,11.8,x+(x<0?.12:-.12),.13,6,m.navy);}
  box(16,4,.18,0,2,12,m.wall);solid(0,2,12,16,4,.2);
  box(16,4,.18,0,2,0,m.navy);solid(0,2,0,16,4,.2);
  box(16,.13,12,0,4.02,6,m.white);solid(0,4.02,6,16,.13,12);
  box(15.8,.24,.08,0,.65,11.86,m.teal);box(15.8,.08,.08,0,.06,11.86,m.navy);
  for(const x of [-5.4,0,5.4])box(.045,.005,8,x,.003,6,m.yellow);
  box(10.8,.006,.045,0,.004,2,m.yellow);
  for(const x of [-5.3,0,5.3]){
    box(2.9,.06,.48,x,3.91,5.7,m.steel,.02);
    const glow=new THREE.MeshStandardMaterial({color:'#f1f5eb',emissive:'#dce9db',emissiveIntensity:1.4});box(2.75,.015,.38,x,3.87,5.7,glow);
  }
  // Daylit windows on the left; repeated frames and blinds.
  for(const z of [3.8,8]){box(.08,1.85,3,-7.82,2.5,z,m.steel);box(.09,1.65,2.8,-7.76,2.5,z,m.glass);for(let i=0;i<11;i++)box(.12,.04,2.85,-7.68,1.73+i*.15,z,m.white);box(.24,.08,3.15,-7.65,1.5,z,m.white);}
  sign('FIRE SYSTEMS LAB   /   소방경보설비 실습실',8.6,.47,0,3.43,11.84,{size:44});
  sign('관찰 → 시험 → 신호 확인 → 원인 판단 → 복구',7,.3,0,2.99,11.83,{bg:'#d6ddd8',fg:'#405858',size:40});
  // Receiver bay (central). Screw heads, door seams, conduits, engraved legends.
  box(4.3,2.48,.12,0,1.65,11.79,m.navy,.035);
  box(2.52,1.66,.28,0,1.75,11.52,m.white,.045);
  box(2.3,1.36,.03,0,1.77,11.36,m.dark,.018);
  for(const x of [-1.12,1.12])for(const y of [1.13,2.4]){const s=cylinder(.022,.012,x,y,11.33,m.steel);s.rotation.x=Math.PI/2;}
  sign('02   수신기 · RECEIVER',2.9,.22,0,2.74,11.68,{size:43});
  const panelCanvas=document.createElement('canvas');panelCanvas.width=1024;panelCanvas.height=512;const panelTexture=new THREE.CanvasTexture(panelCanvas);panelTexture.colorSpace=THREE.SRGBColorSpace;
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(1.35,.68),new THREE.MeshBasicMaterial({map:panelTexture}));screen.position.set(-.16,1.9,11.335);screen.rotation.y=Math.PI;group.add(screen);
  // Front faces point into the room (-Z).
  const front=(text,w,h,x,y,z,opts={})=>sign(text,w,h,x,y,z,{...opts,rotation:Math.PI});
  group.remove(screen);screen.rotation.y=Math.PI;group.add(screen);
  // Wall signs also face the approach from the entrance.
  for(const child of group.children)if(child.isMesh && child.geometry.type==='PlaneGeometry' && child!==screen)child.rotation.y=Math.PI;
  const leds={};
  for(const [i,id,color] of [[0,'power','#55d69c'],[1,'fire','#e04a3b'],[2,'silence','#e7b04c']]){
    const lm=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:id==='power'?1.6:0});
    const led=cylinder(.042,.02,.78,2.14-i*.18,11.32,lm);led.rotation.x=Math.PI/2;leds[id]=led;
    front(['주전원','화재','경종 정지'][i],.31,.085,.98,2.14-i*.18,11.315,{size:49});
  }
  for(const [i,color] of ['#d6dcce','#d8b858','#c75a48'].entries()){
    const b=cylinder(.07,.045,-.58+i*.53,1.37,11.31,material(color,.2));b.rotation.x=Math.PI/2;
    front(['복구','경종 정지','확인'][i],.4,.09,-.58+i*.53,1.17,11.31,{size:45});
  }
  for(const x of [-.8,.8])box(.06,.5,.07,x,2.85,11.77,m.steel);
  solid(0,1.75,11.5,2.6,1.7,.4);
  // Detector / manual call point bay, mounted on a mock ceiling and wall board.
  box(3.6,2.5,.1,-4.7,1.65,11.78,m.teal,.03);front('01   감지기 · 발신기',2.8,.22,-4.7,2.74,11.67,{size:44});
  box(2.8,.1,1.3,-4.7,2.52,10.95,m.white,.025);solid(-4.7,2.52,10.95,2.8,.1,1.3);
  cylinder(.19,.05,-4.7,2.44,10.77,m.white);cylinder(.16,.075,-4.7,2.385,10.77,m.white);
  for(let i=0;i<16;i++){const a=i*Math.PI/8;box(.018,.03,.012,-4.7+Math.cos(a)*.156,2.38,10.77+Math.sin(a)*.156,m.dark);}
  const detectorLed=new THREE.MeshStandardMaterial({color:'#602820',emissive:'#f04b32',emissiveIntensity:0});
  const dl=cylinder(.018,.012,-4.7,2.337,10.88,detectorLed);
  box(.5,.55,.12,-5.52,1.52,11.65,m.red,.035);const call=cylinder(.12,.04,-5.52,1.52,11.56,m.red);call.rotation.x=Math.PI/2;
  front('발신기',.43,.12,-5.52,1.86,11.56,{size:58});front('눌러서 화재 알림',.47,.1,-5.52,1.17,11.56,{size:42});
  front('연기감지기 / 1구역',1.4,.17,-4.32,2.1,11.65,{bg:'#125b62',size:43});
  // Test equipment trolley and pole (the tool appears under the detector during a test).
  box(1.45,.08,.7,-4.7,.85,9.5,m.steel,.025);for(const x of [-5.3,-4.1])for(const z of [9.25,9.75]){box(.035,.75,.035,x,.43,z,m.steel);const wheel=cylinder(.06,.04,x,.07,z,m.dark);wheel.rotation.z=Math.PI/2;}
  box(.55,.2,.37,-4.7,1,9.5,m.yellow,.035);front('시험기 / TEST KIT',.75,.12,-4.7,.7,9.12,{size:38});solid(-4.7,.45,9.5,1.5,.9,.75);
  const pole=new THREE.Group();pole.position.set(-4.7,0,10.77);group.add(pole);pole.visible=false;
  const rod=new THREE.Mesh(new THREE.CylinderGeometry(.018,.023,1.55,16),m.steel);rod.position.y=1.42;pole.add(rod);
  const cup=new THREE.Mesh(new THREE.CylinderGeometry(.21,.1,.18,28),new THREE.MeshStandardMaterial({color:'#dce8e0',transparent:true,opacity:.55,roughness:.25}));cup.position.y=2.25;pole.add(cup);
  // Alarm devices bay.
  box(3.6,2.5,.1,4.7,1.65,11.78,m.navy,.03);front('03   음향 · 시각경보',2.8,.22,4.7,2.74,11.67,{size:44});
  const bell=cylinder(.25,.12,4.13,2.03,11.58,m.red);bell.rotation.x=Math.PI/2;
  const bellHub=cylinder(.065,.15,4.13,2.03,11.54,m.red);bellHub.rotation.x=Math.PI/2;
  const beaconMat=new THREE.MeshStandardMaterial({color:'#e5f0eb',emissive:'#e5f0eb',emissiveIntensity:0,roughness:.23});
  box(.38,.48,.17,5.16,2.03,11.55,m.red,.03);box(.3,.25,.17,5.16,2.04,11.43,beaconMat,.035);
  front('경종',.65,.14,4.13,1.58,11.64,{size:58});front('시각경보기',1,.14,5.16,1.58,11.64,{size:49});
  front('반응을 관찰한 뒤 점검표에 기록하세요',2.9,.2,4.7,1.04,11.64,{size:38});
  // Exposed training conduits make the relationship between input, receiver and outputs legible.
  for(const x of [-4.7,4.7]){
    box(.045,.5,.045,x,3.02,11.74,m.steel);
    box(Math.abs(x),.045,.045,x/2,3.25,11.74,m.steel);
    for(let y=2.86;y<3.25;y+=.22)box(.085,.025,.06,x,y,11.73,m.navy);
  }
  for(const x of [-7.2,-2.4,2.4,7.2])box(.012,2.9,.025,x,1.6,11.88,m.steel);
  // Wall-mounted workflow poster, ventilation, ceiling beam and cable tray.
  const poster=sign('점검의 다섯 단계\n관찰 · 시험 · 판단 · 재시험 · 복구',2.9,.7,4.5,1.96,.19,{rotation:0,bg:'#d8dfd5',fg:'#244b4d'});
  box(3,.8,.025,4.5,1.96,.17,m.steel,.015);poster.position.z=.195;
  box(1.4,.48,.05,-4.5,3.35,.17,m.steel,.01);for(let i=0;i<7;i++)box(1.25,.018,.06,-4.5,3.17+i*.055,.21,m.dark);
  box(15.8,.18,.28,0,3.86,8.65,m.teal,.015);
  for(const z of [3,8.6])box(15.8,.012,.09,0,3.72,z,m.steel);
  // Workbench, paperwork, storage and inspection-character display.
  box(3.8,.1,.95,5.5,.87,3,m.white,.035);for(const x of [3.85,7.15])box(.09,.8,.72,x,.4,3,m.steel,.025);solid(5.5,.45,3,3.9,.9,1);
  box(.47,.018,.36,5.1,.94,2.9,m.dark,.02);box(.41,.006,.3,5.1,.954,2.9,m.white);
  box(.6,.25,.35,6.1,1.02,3,m.teal,.04);
  front('점검 기록 · INSPECTION LOG',2.6,.23,5.4,1.39,3.48,{rotation:0,size:40});
  box(1.3,2.15,.6,6.9,1.08,6,m.teal,.045);for(const y of [.6,1.45])box(1.17,.015,.02,6.9,y,5.69,m.steel);
  for(const y of [.55,1.4])box(.05,.16,.04,7.28,y,5.66,m.steel,.015);solid(6.9,1.08,6,1.4,2.2,.7);
  box(1.55,.08,1.55,-5.2,.04,3.8,m.navy,.025);
  sign('EQUIPMENT STUDY\n보호장비 관찰',2.1,.4,-5.2,2.8,1,{size:47,rotation:0});
  box(2.3,2.75,.06,0,1.38,.15,m.teal,.025);sign('실습실 출입구',1.5,.2,0,2.55,.19,{rotation:0,size:50});
  const lamps=[[-5,3.55,6],[0,3.55,8],[5,3.55,6],[-3,2.6,3]].map(([x,y,z])=>({pos:p(x,y,z),color:'#eff8f2',intensity:25,distance:13}));
  group.visible=false;
  function drawPanel(state={}){
    const c=panelCanvas.getContext('2d');c.fillStyle='#071e22';c.fillRect(0,0,1024,512);c.strokeStyle='#285257';c.lineWidth=3;c.strokeRect(15,15,994,482);c.textAlign='left';c.fillStyle='#67d6b7';c.font='28px monospace';c.fillText('FH-01  /  TRAINING RECEIVER',45,65);
    c.fillStyle=state.alarm?'#ffa58b':'#e2eee3';c.font='bold 59px "Malgun Gothic",sans-serif';c.fillText(state.alarm?'화재 신호 수신':'정상 감시 중',45,165);
    c.font='30px "Malgun Gothic",sans-serif';c.fillStyle='#9cbdb7';c.fillText(state.alarm?`1구역 · ${state.source==='manual'?'발신기':'연기감지기'}`:'주전원 정상 / 예비전원 정상',45,233);
    c.fillStyle=state.silenced?'#ffc36d':'#8ad9bd';c.fillText(state.silenced?'경종 정지 : ON':'경종 정지 : OFF',45,317);c.fillStyle='#9cbdb7';c.fillText('입력 → 수신 → 음향 · 시각경보',45,415);panelTexture.needsUpdate=true;
    leds.fire.material.emissiveIntensity=state.alarm?2:0;leds.silence.material.emissiveIntensity=state.silenced?2:0;detectorLed.emissiveIntensity=state.alarm&&state.source==='detector'?2:0;
  }
  drawPanel();
  return {group,p,solids,lamps,pole,beaconMat,bell,drawPanel,spawn:p(0,0,5.3),stations:{detector:p(-4.7,0,10.4),panel:p(0,0,10.7),outputs:p(4.7,0,10.65),log:p(5.3,0,2.1),character:p(-5.2,0,3.8)}};
}
