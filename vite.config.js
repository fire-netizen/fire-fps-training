import { defineConfig } from 'vite';

// 구형 브라우저(안드로이드 크롬 80, 사파리 13, 파이어폭스 78 이상)까지 고려한 빌드 대상
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1200,
    target: ['es2020', 'chrome80', 'safari13', 'firefox78'],
  },
});
