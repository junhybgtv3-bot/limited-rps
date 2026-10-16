// JSON 파일 기반 영속 스토어 — 원자적 쓰기(tmp → rename).
// 계약: docs/SPEC-INTERFACE.md §3

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import type {
  GameState,
  LobbyPlayerInfo,
  PlayerSlot,
  RoomStatus,
} from '../shared/types';

export interface StoredRoomPlayer extends LobbyPlayerInfo {
  socketId: string | null;
  tokenHash: string; // 재접속 토큰의 sha256 — 평문 저장 금지
}

export interface StoredRoom {
  code: string;
  status: RoomStatus;
  players: Record<PlayerSlot, StoredRoomPlayer | null>; // 슬롯 고정
  game: GameState | null;
  createdAt: string;
  lastActiveAt: string;
  disconnectAt: Record<PlayerSlot, string | null>; // 연결 끊긴 시각 (재접속 유예 계산용)
}

export interface RoomStore {
  get(code: string): Promise<StoredRoom | null>;
  /** 저장 시 lastActiveAt을 현재 시각으로 자동 갱신 */
  save(room: StoredRoom): Promise<void>;
  delete(code: string): Promise<void>;
  listCodes(): Promise<string[]>;
}

const CODE_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** sha256 hex 다이제스트 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * 숫자 6자리(0-pad) 방 코드 생성. 충돌 시 재생성.
 * existing: 코드가 이미 사용 중이면 true (동기/비동기 모두 가능)
 */
export async function generateRoomCode(
  existing: (code: string) => boolean | Promise<boolean>,
): Promise<string> {
  for (;;) {
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    if (!(await existing(code))) return code;
  }
}

export function createRoomStore(dataDir?: string): RoomStore {
  const baseDir = dataDir ?? process.env.DATA_DIR ?? path.join(process.cwd(), 'data');
  const roomsDir = path.join(baseDir, 'rooms');

  const fileFor = (code: string): string => {
    if (!CODE_RE.test(code)) throw new Error(`invalid room code: ${code}`);
    return path.join(roomsDir, `${code}.json`);
  };

  return {
    async get(code: string): Promise<StoredRoom | null> {
      try {
        const raw = await fs.readFile(fileFor(code), 'utf8');
        return JSON.parse(raw) as StoredRoom;
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return null;
        throw err;
      }
    },

    async save(room: StoredRoom): Promise<void> {
      room.lastActiveAt = new Date().toISOString();
      await fs.mkdir(roomsDir, { recursive: true });
      const file = fileFor(room.code);
      const tmp = `${file}.tmp-${process.pid}-${randomBytes(6).toString('hex')}`;
      await fs.writeFile(tmp, JSON.stringify(room), 'utf8');
      await fs.rename(tmp, file); // 원자적 교체
    },

    async delete(code: string): Promise<void> {
      try {
        await fs.unlink(fileFor(code));
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err;
      }
    },

    async listCodes(): Promise<string[]> {
      let entries: string[];
      try {
        entries = await fs.readdir(roomsDir);
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return [];
        throw err;
      }
      return entries
        .filter((name) => name.endsWith('.json'))
        .map((name) => name.slice(0, -'.json'.length))
        .sort();
    },
  };
}
