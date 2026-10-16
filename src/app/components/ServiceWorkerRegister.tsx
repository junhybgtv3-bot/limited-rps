'use client';

import { useEffect } from 'react';

/** PWA 설치 조건 충족용 서비스 워커 등록 (한 번만) */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      window.location.protocol === 'https:'
    ) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // 등록 실패는 무시 (게임 플레이에 영향 없음)
      });
    }
  }, []);
  return null;
}
