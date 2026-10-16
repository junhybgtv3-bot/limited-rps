import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.emujsa.limitedrps',
  appName: 'Limited RPS',
  webDir: 'www',
  // 네이티브 앱은 라이브 웹사이트를 그대로 로드한다.
  // (웹 코드 변경 없이 앱스토어 래퍼로 동작)
  server: {
    url: 'https://limited-rps-jj0r.onrender.com',
    cleartext: false,
  },
  ios: {
    // 노치/다이나믹 아일랜드 영역까지 화면 사용
    contentInset: 'automatic',
    // 웹뷰 스크롤 바운스 완화
    scrollEnabled: true,
  },
};

export default config;
