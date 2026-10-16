'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import Modal from './components/Modal';
import { toast } from './components/Toaster';
import {
  emitAck,
  saveSession,
  type CreateAck,
  type JoinAck,
} from './lib/socket';

const JOIN_ERROR_MSG: Record<string, string> = {
  NOT_FOUND: '방을 찾을 수 없습니다.',
  FULL: '방이 가득 찼습니다.',
  IN_PROGRESS: '진행 중인 게임입니다.',
  EXPIRED: '만료된 초대 코드입니다.',
  INVALID_CODE: '6자리 숫자 코드를 입력해 주세요.',
  NICKNAME_TAKEN: '이미 사용 중인 닉네임입니다.',
};

const inputClass =
  'w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-lg text-slate-100 placeholder:text-slate-500 focus:border-amber-400 focus:outline-none';

export default function HomePage() {
  const router = useRouter();

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
      toast('닉네임을 입력해 주세요.', 'error');
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
        toast(ack.error || '방 생성에 실패했습니다.', 'error');
      }
    } catch {
      toast('서버에 연결할 수 없습니다.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim();
    const name = joinNickname.trim();
    if (!/^\d{6}$/.test(code)) {
      setJoinError(JOIN_ERROR_MSG.INVALID_CODE);
      return;
    }
    if (!name) {
      setJoinError('닉네임을 입력해 주세요.');
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
          JOIN_ERROR_MSG[ack.code] ?? ack.message ?? '참가에 실패했습니다.',
        );
      }
    } catch {
      setJoinError('서버에 연결할 수 없습니다.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#0f172a] via-[#0b1220] to-[#020617] px-4 py-10 text-slate-100">
      <div className="flex w-full max-w-sm flex-col items-center">
        <div className="mb-2 flex gap-3 text-5xl" aria-hidden="true">
          <span>✊</span>
          <span>✌️</span>
          <span>✋</span>
        </div>
        <h1 className="text-center text-4xl font-black tracking-tight text-amber-300">
          한정 가위바위보
        </h1>
        <p className="mt-3 text-center text-sm leading-relaxed text-slate-400">
          바위·가위·보 4장씩, 별 3개로 겨루는
          <br />
          1대1 실시간 심리전
        </p>

        <div className="mt-8 flex w-full flex-col gap-3">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="w-full rounded-2xl bg-amber-400 px-6 py-4 text-lg font-bold text-slate-900 shadow-[0_0_24px_rgba(245,197,24,0.25)] transition active:scale-95"
          >
            방 만들기
          </button>
          <button
            type="button"
            onClick={() => setShowJoin((v) => !v)}
            className="w-full rounded-2xl border-2 border-amber-400/60 px-6 py-4 text-lg font-bold text-amber-200 transition active:scale-95"
          >
            방 참가하기
          </button>
          <Link
            href="/how-to-play"
            className="w-full rounded-2xl border border-slate-700 bg-slate-800/60 px-6 py-4 text-center text-lg font-bold text-slate-200 transition active:scale-95"
          >
            게임 방법
          </Link>
        </div>

        {showJoin && (
          <form
            onSubmit={handleJoin}
            className="animate-rps-pop mt-4 w-full rounded-2xl border border-slate-700 bg-slate-900/80 p-5"
          >
            <label className="mb-1 block text-sm font-semibold text-slate-300">
              방 코드 (6자리)
            </label>
            <input
              value={joinCode}
              onChange={(e) =>
                setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              }
              inputMode="numeric"
              placeholder="예: 123456"
              className={`${inputClass} mb-3 text-center text-2xl font-bold tracking-[0.3em]`}
            />
            <label className="mb-1 block text-sm font-semibold text-slate-300">
              닉네임
            </label>
            <input
              value={joinNickname}
              onChange={(e) => setJoinNickname(e.target.value)}
              maxLength={12}
              placeholder="닉네임 입력"
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
              {joining ? '참가 중...' : '참가하기'}
            </button>
          </form>
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="방 만들기"
      >
        <label className="mb-1 block text-sm font-semibold text-slate-300">
          닉네임
        </label>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={12}
          placeholder="닉네임 입력"
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
          {creating ? '방 만드는 중...' : '방 만들기'}
        </button>
      </Modal>
    </main>
  );
}
