# FIRE RESCUE SIMULATOR 3D

브라우저용 3인칭 소방훈련 **작동 프로토타입**입니다. 소방서 → 소방차 탑승 → 출동 → 4개 화점 진압 → 요구조자 구조 → 평가 흐름을 제공합니다.

## 실행

```bash
npm install
npm run dev
```

빌드 검사: `npm run build`.

## 기존 GitHub / Vercel 배포

기존 `fire-fps-training` 저장소 **루트**에 이 폴더 안의 `index.html`, `package.json`, `src/`, `public/` 등을 복사하고 GitHub에 Commit/Push 하세요. Vercel은 Vite 프레임워크(자동 감지), Build Command `npm run build`, Output Directory `dist`를 사용합니다. 기존의 정적 HTML 배포와 달리 빌드가 필요합니다.

## 조작

WASD 이동 / Shift 달리기 / 마우스 드래그 시점 / E 탑승·구조 / Space 또는 마우스 왼쪽 버튼 방수 / R 용수 보충.

## 중요: 그래픽 수준

이 배포본은 **실행 가능한 게임 구조 및 화재·물 효과 프로토타입**입니다. 소방관, 소방차, 건물은 아직 절차적 3D 도형이므로 상용 소방 시뮬레이터 수준의 실사 그래픽이 아닙니다. 고품질 3D 모델, 애니메이션, PBR 텍스처를 별도로 확보하여 교체해야 합니다. `public/models/firefighter.glb`를 추가하면 해당 모델을 우선 로드합니다(모델의 방향·크기는 제작 에셋에 맞춰 조정 필요). 외부 모델을 허락 없이 동봉하지 않았습니다.

교육용 실제 훈련 절차·안전성 검증을 거친 제품이 아닙니다.
