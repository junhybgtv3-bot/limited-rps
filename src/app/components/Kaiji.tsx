'use client';

/** ざわ‥ 배경 — 지나치게 많지 않게 5개 흩뿌림 */
export function ZawaBackground() {
  const spots = [
    { top: '8%', left: '6%', rotate: '-12deg' },
    { top: '24%', right: '5%', rotate: '8deg' },
    { top: '50%', left: '3%', rotate: '-6deg' },
    { top: '66%', right: '8%', rotate: '10deg' },
    { top: '86%', left: '10%', rotate: '-9deg' },
  ] as const;
  return (
    <div className="zawa" aria-hidden="true">
      {spots.map((s, i) => (
        <span
          key={i}
          style={{
            top: s.top,
            left: 'left' in s ? s.left : undefined,
            right: 'right' in s ? s.right : undefined,
            transform: `rotate(${s.rotate})`,
          }}
        >
          ざわ‥
        </span>
      ))}
    </div>
  );
}

/** 빨간 지그재그 디바이더 */
export function KaijiSlash({ className = '' }: { className?: string }) {
  return (
    <div className={`kaiji-slash ${className}`} aria-hidden="true" />
  );
}

/** 限定 스탬프 */
export function KaijiStamp({ text = '限定' }: { text?: string }) {
  return (
    <div className="kaiji-stamp px-3 py-1 text-[15px]" aria-hidden="true">
      {text}
    </div>
  );
}
