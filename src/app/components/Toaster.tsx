'use client';

import { useEffect, useState } from 'react';

export type ToastKind = 'error' | 'info' | 'success';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

let pushFn: ((message: string, kind?: ToastKind) => void) | null = null;
let nextId = 1;

/** 어디서든 호출 가능한 토스트. <Toaster/>가 마운트되어 있어야 표시됨. */
export function toast(message: string, kind: ToastKind = 'info'): void {
  pushFn?.(message, kind);
}

const COLORS: Record<ToastKind, string> = {
  error: 'border-[#c1121f] bg-[#1c0a0c] text-[#ffb3b3]',
  success: 'border-[#3d7a44] bg-[#0c1510] text-[#bfe8c4]',
  info: 'border-[#57534a] bg-[#1c1e20] text-[#ece7d8]',
};

export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    pushFn = (message: string, kind: ToastKind = 'info') => {
      const id = nextId++;
      setItems((prev) => [...prev.slice(-2), { id, message, kind }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 3200);
    };
    return () => {
      pushFn = null;
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <div
          key={t.id}
          className={`w-full border-2 px-4 py-3 text-center text-sm font-medium shadow-[4px_4px_0_#000] ${COLORS[t.kind]}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
