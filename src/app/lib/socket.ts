import { io, type Socket } from 'socket.io-client';
import { getLang } from '../i18n/LanguageContext';
import { en } from '../i18n/en';
import { ko } from '../i18n/ko';
import { ja } from '../i18n/ja';
import type {
  LobbyState,
  PlayerSlot,
  PublicGameView,
  RoomErrorCode,
  SubmitErrorCode,
} from '@/shared/types';

const timeoutDicts = { ko, en, ja };

// ---- 싱글톤 소켓 ----
let socket: Socket | null = null;

/** 앱 전역에서 공유하는 socket.io 싱글톤. 네임스페이스 '/' (기본). */
export function getSocket(): Socket {
  if (!socket) {
    socket = io();
  }
  return socket;
}

// ---- Ack 페이로드 타입 (docs/SPEC-INTERFACE.md §4) ----
export type CreateAck =
  | { ok: true; roomCode: string; slot: PlayerSlot; reconnectToken: string }
  | { ok: false; code?: string; error: string };

export type JoinAck =
  | { ok: true; slot: PlayerSlot; reconnectToken: string }
  | { ok: false; code: RoomErrorCode; message: string };

export type ReconnectAck =
  | {
      ok: true;
      slot: PlayerSlot;
      phase: 'lobby' | 'game';
      lobby?: LobbyState;
      game?: PublicGameView;
    }
  | { ok: false; code: string };

export type SubmitAck = { ok: true } | { ok: false; code: SubmitErrorCode };

/** ack 콜백을 Promise로 감싼 emit. 서버가 ack를 보내지 않으면 타임아웃으로 reject. */
export function emitAck<T>(
  event: string,
  payload: Record<string, unknown>,
  timeoutMs = 10000,
): Promise<T> {
  const s = getSocket();
  return new Promise<T>((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error(timeoutDicts[getLang()].common.responseTimeout));
      }
    }, timeoutMs);
    try {
      s.emit(event, payload, (res: T) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(res);
      });
    } catch (e) {
      if (!done) {
        done = true;
        clearTimeout(timer);
        reject(e);
      }
    }
  });
}

// ---- 재접속 세션 (localStorage, 키: lrps:<CODE>) ----
export interface RoomSession {
  slot: PlayerSlot;
  reconnectToken: string;
}

const sessionKey = (code: string) => `lrps:${code}`;

export function loadSession(code: string): RoomSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(code));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<RoomSession>;
    if (
      typeof v.reconnectToken === 'string' &&
      (v.slot === 'A' || v.slot === 'B')
    ) {
      return { slot: v.slot, reconnectToken: v.reconnectToken };
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSession(code: string, s: RoomSession): void {
  try {
    localStorage.setItem(sessionKey(code), JSON.stringify(s));
  } catch {
    // 저장 실패는 무시 (세션 복구만 안 됨)
  }
}

export function clearSession(code: string): void {
  try {
    localStorage.removeItem(sessionKey(code));
  } catch {
    // 무시
  }
}
