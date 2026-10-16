'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import Modal from './components/Modal';
import { toast } from './components/Toaster';
import { LanguageSwitcher, useLanguage } from './i18n/LanguageContext';
import {
  emitAck,
  saveSession,
  type CreateAck,
  type JoinAck,
} from './lib/socket';

const inputClass =
  'w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-lg text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none';

/** JSA 로고 컨셉(주홍색 도리이)에 맞춘 디바이더 */
function ToriiDivider() {
  return (
    <svg
      viewBox="0 0 120 56"
      className="mt-5 h-9 w-28"
      aria-hidden="true"
      role="presentation"
    >
      {/* 가사기(윗 지붕) */}
      <path
        d="M6 12 C 40 5, 80 5, 114 12"
        fill="none"
        stroke="#1c1917"
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* 상단 횡목 */}
      <path
        d="M10 20 C 42 14, 78 14, 110 20"
        fill="none"
        stroke="#c8402f"
        strokeWidth="7"
        strokeLinecap="round"
      />
      {/* 하단 횡목(누키) */}
      <rect x="24" y="29" width="72" height="5" rx="2" fill="#c8402f" />
      {/* 기둥 */}
      <rect x="34" y="20" width="6" height="32" rx="2" fill="#c8402f" />
      <rect x="80" y="20" width="6" height="32" rx="2" fill="#c8402f" />
      {/* 중심 기둥 */}
      <rect x="57" y="29" width="6" height="14" rx="2" fill="#c8402f" />
    </svg>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { t } = useLanguage();

  const [createOpen, setCreateOpen] = useState(false);
  const [nickname, setNickname] = useState('');
  const [creating, setCreating] = useState(false);

  const [showJoin, setShowJoin] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinNickname, setJoinNickname] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);

  const handleCreate = async () => {
    const name = nickname.trim();
    if (!name) {
      toast(t.errors.create.NICKNAME_REQUIRED, 'error');
      return;
    }
    setCreating(true);
    try {
      const ack = await emitAck<CreateAck>('room:create', { nickname: name });
      if (ack.ok) {
        saveSession(ack.roomCode, {
          slot: ack.slot,
          reconnectToken: ack.reconnectToken,
        });
        router.push(`/room/${ack.roomCode}`);
      } else {
        toast(
          t.errors.create[ack.code ?? ''] ??
            ack.error ??
            t.errors.create.CREATE_FAILED,
          'error',
        );
      }
    } catch {
      toast(t.common.serverUnreachable, 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim();
    const name = joinNickname.trim();
    if (!/^\d{6}$/.test(code)) {
      setJoinError(t.errors.join.INVALID_CODE);
      return;
    }
    if (!name) {
      setJoinError(t.errors.create.NICKNAME_REQUIRED);
      return;
    }
    setJoining(true);
    setJoinError('');
    try {
      const ack = await emitAck<JoinAck>('room:join', {
        roomCode: code,
        nickname: name,
      });
      if (ack.ok) {
        saveSession(code, {
          slot: ack.slot,
          reconnectToken: ack.reconnectToken,
        });
        router.push(`/room/${code}`);
      } else {
        setJoinError(
          t.errors.join[ack.code] ?? ack.message ?? t.common.unknownError,
        );
      }
    } catch {
      setJoinError(t.common.serverUnreachable);
    } finally {
      setJoining(false);
    }
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-[#0f172a] via-[#0b1220] to-[#020617] px-4 py-10 text-slate-100">
      {/* 도리이 컨셉의 은은한 주홍빛 */}
      <div
        className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full opacity-20 blur-3xl"
        style={{
          background:
            'radial-gradient(closest-side, #c8402f 0%, transparent 70%)',
        }}
        aria-hidden="true"
      />
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="relative flex w-full max-w-sm flex-col items-center">
        <div className="mb-2 flex gap-3 text-5xl" aria-hidden="true">
          <span>✊</span>
          <span>✌️</span>
          <span>✋</span>
        </div>
        <h1 className="text-center text-4xl font-black tracking-tight text-amber-300">
          {t.meta.title}
        </h1>
        <p className="mt-3 text-center text-sm leading-relaxed text-slate-400">
          {t.home.taglineA}
          <br />
          {t.home.taglineB}
        </p>
        <ToriiDivider />

        <div className="mt-8 flex w-full flex-col gap-3">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="w-full rounded-2xl bg-amber-400 px-6 py-4 text-lg font-bold text-slate-900 shadow-[0_0_24px_rgba(245,197,24,0.25)] transition active:scale-95"
          >
            {t.home.createRoom}
          </button>
          <button
            type="button"
            onClick={() => setShowJoin((v) => !v)}
            className="w-full rounded-2xl border-2 border-[#c8402f]/70 px-6 py-4 text-lg font-bold text-red-100 transition active:scale-95"
          >
            {t.home.joinRoom}
          </button>
          <Link
            href="/how-to-play"
            className="w-full rounded-2xl border border-slate-700 bg-slate-800/60 px-6 py-4 text-center text-lg font-bold text-slate-200 transition active:scale-95"
          >
            {t.home.howToPlay}
          </Link>
        </div>

        {showJoin && (
          <form
            onSubmit={handleJoin}
            className="animate-rps-pop mt-4 w-full rounded-2xl border border-slate-700 bg-slate-900/80 p-5"
          >
            <label className="mb-1 block text-sm font-semibold text-slate-300">
              {t.home.roomCodeLabel}
            </label>
            <input
              value={joinCode}
              onChange={(e) =>
                setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              inputMode="numeric"
              placeholder={t.home.codePlaceholder}
              className={`${inputClass} mb-3 text-center text-2xl font-bold tracking-[0.3em]`}
            />
            <label className="mb-1 block text-sm font-semibold text-slate-300">
              {t.common.nickname}
            </label>
            <input
              value={joinNickname}
              onChange={(e) => setJoinNickname(e.target.value)}
              maxLength={12}
              placeholder={t.common.nicknamePlaceholder}
              className={inputClass}
            />
            {joinError && (
              <p className="mt-3 text-center text-sm font-medium text-red-400">
                {joinError}
              </p>
            )}
            <button
              type="submit"
              disabled={joining}
              className="mt-4 w-full rounded-xl bg-amber-400 px-6 py-3 text-base font-bold text-slate-900 transition active:scale-95 disabled:opacity-50"
            >
              {joining ? t.home.joining : t.home.join}
            </button>
          </form>
        )}

        <footer className="mt-10 flex flex-col items-center gap-1.5">
          <img
            src="/jsa-logo.png"
            alt="EMU Japanese Student Association"
            className="h-16 w-16 rounded-full object-cover ring-2 ring-amber-400/60"
          />
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
            {t.home.madeBy}
          </p>
          <p className="text-sm font-semibold tracking-wide text-slate-300">
            EMU Japanese Student Association
          </p>
        </footer>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t.home.createRoom}
      >
        <label className="mb-1 block text-sm font-semibold text-slate-300">
          {t.common.nickname}
        </label>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={12}
          placeholder={t.common.nicknamePlaceholder}
          className={inputClass}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleCreate();
          }}
        />
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={creating}
          className="mt-4 w-full rounded-xl bg-amber-400 px-6 py-3 text-base font-bold text-slate-900 transition active:scale-95 disabled:opacity-50"
        >
          {creating ? t.home.creating : t.home.createRoom}
        </button>
      </Modal>
    </main>
  );
}
