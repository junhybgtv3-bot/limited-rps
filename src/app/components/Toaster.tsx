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
  error: 'border-red-500/50 bg-red-950/95 text-red-100',
  success: 'border-emerald-500/50 bg-emerald-950/95 text-emerald-100',
  info: 'border-slate-500/50 bg-slate-900/95 text-slate-100',
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
          className={`w-full rounded-xl border px-4 py-3 text-center text-sm font-medium shadow-xl ${COLORS[t.kind]}`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
