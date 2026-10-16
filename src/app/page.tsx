'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import Modal from './components/Modal';
import { toast } from './components/Toaster';
import { KaijiSlash, KaijiStamp, ZawaBackground } from './components/Kaiji';
import { LanguageSwitcher, useLanguage } from './i18n/LanguageContext';
import {
  emitAck,
  saveSession,
  type CreateAck,
  type JoinAck,
} from './lib/socket';

const inputClass =
  'w-full border-2 border-[#2c2f32] bg-[#141416] px-4 py-3 text-lg text-[#ece7d8] placeholder:text-[#57534a] focus:border-[#b3122e] focus:outline-none';

/** 타이틀: 첫 단어는 혈흔 레드, 나머지는 오프화이트 (Anton) */
function KaijiTitle({ title }: { title: string }) {
  const [first, ...rest] = title.split(' ');
  return (
    <h1 className="font-display mt-4 text-center text-[40px] leading-[1.12] text-[#ece7d8]">
      <span className="text-[#d41f2f]">{first.toUpperCase()}</span>
      {rest.length > 0 && (
        <>
          <br />
          {rest.join(' ').toUpperCase()}
        </>
      )}
    </h1>
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
    <main className="kaiji-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10 text-[#ece7d8]">
      <ZawaBackground />
      <div className="absolute right-4 top-4 z-10">
        <LanguageSwitcher />
      </div>
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center">
        <div className="mt-2">
          <KaijiStamp />
        </div>
        <div className="mb-1 mt-6 flex gap-3" aria-hidden="true">
          {['✊', '✌️', '✋'].map((e) => (
            <span
              key={e}
              className="flex h-[74px] w-[74px] items-center justify-center rounded-full border-2 border-[#b3122e] bg-[rgba(179,18,46,0.08)] text-5xl"
            >
              {e}
            </span>
          ))}
        </div>
        <KaijiTitle title={t.meta.title} />
        <p className="mt-3 text-center text-sm leading-relaxed text-[#9a9587]">
          {t.home.taglineA}
          <br />
          {t.home.taglineB}
        </p>
        <KaijiSlash className="mt-5" />

        <div className="mt-8 flex w-full flex-col gap-3">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="kaiji-btn kaiji-btn-blood w-full px-6 py-4 text-lg font-bold"
          >
            {t.home.createRoom}
          </button>
          <button
            type="button"
            onClick={() => setShowJoin((v) => !v)}
            className="kaiji-btn kaiji-btn-ghost w-full px-6 py-4 text-lg font-bold"
          >
            {t.home.joinRoom}
          </button>
          <Link
            href="/how-to-play"
            className="kaiji-btn kaiji-btn-dark block w-full px-6 py-4 text-center text-lg font-bold"
          >
            {t.home.howToPlay}
          </Link>
        </div>

        {showJoin && (
          <form
            onSubmit={handleJoin}
            className="animate-rps-pop mt-4 w-full border-2 border-[#2c2f32] bg-[#141416]/95 p-5"
          >
            <label className="mb-1 block text-sm font-semibold text-[#9a9587]">
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
            <label className="mb-1 block text-sm font-semibold text-[#9a9587]">
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
              <p className="mt-3 text-center text-sm font-medium text-[#ff6b6b]">
                {joinError}
              </p>
            )}
            <button
              type="submit"
              disabled={joining}
              className="kaiji-btn kaiji-btn-blood mt-4 w-full px-6 py-3 text-base font-bold disabled:opacity-50"
            >
              {joining ? t.home.joining : t.home.join}
            </button>
          </form>
        )}

        <footer className="mt-10 flex flex-col items-center gap-1.5">
          <img
            src="/jsa-logo.png"
            alt="EMU Japanese Student Association"
            className="h-16 w-16 rounded-full border-2 border-[#57534a] object-cover"
          />
          <p className="text-[11px] uppercase tracking-[0.2em] text-[#9a9587]">
            {t.home.madeBy}
          </p>
          <p className="text-sm font-semibold tracking-wide text-[#ece7d8]">
            EMU Japanese Student Association
          </p>
          <Link
            href="/privacy"
            className="mt-1 text-[11px] tracking-wide text-[#6b675c] underline underline-offset-2 hover:text-[#9a9587]"
          >
            {t.privacy.title}
          </Link>
        </footer>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t.home.createRoom}
      >
        <label className="mb-1 block text-sm font-semibold text-[#9a9587]">
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
          className="kaiji-btn kaiji-btn-blood mt-4 w-full px-6 py-3 text-base font-bold disabled:opacity-50"
        >
          {creating ? t.home.creating : t.home.createRoom}
        </button>
      </Modal>
    </main>
  );
}
