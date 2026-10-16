// 순수 타입 + 상수만. Node 전용 API 사용 금지 (클라이언트/서버 공용).

export type CardType = 'rock' | 'scissors' | 'paper';
export type PlayerSlot = 'A' | 'B';
export type RoundResult = 'A' | 'B' | 'draw';
export type FinishReason = 'stars_zero' | 'cards_exhausted' | 'timeout' | 'forfeit';
export type RoomStatus = 'waiting' | 'ready' | 'playing' | 'finished' | 'expired';
export type GameStatus = 'playing' | 'revealing' | 'finished';

export interface HandCounts {
  rock: number;
  scissors: number;
  paper: number;
}

export interface PlayerState {
  slot: PlayerSlot;
  nickname: string;
  hand: HandCounts;
  stars: number;
}

export interface RoundRecord {
  roundId: string;
  roundNumber: number;
  choices: Record<PlayerSlot, CardType | null>;
  submitted: Record<PlayerSlot, boolean>;
  result: RoundResult | null;
  resolvedAt: string | null;
}

export interface GameState {
  gameId: string;
  roomCode: string;
  players: Record<PlayerSlot, PlayerState>;
  roundNumber: number;
  currentRound: RoundRecord;
  status: GameStatus;
  winner: PlayerSlot | 'draw' | null;
  finishReason: FinishReason | null;
  startedAt: string;
  deadlineAt: string;
  history: RoundRecord[];
}

export interface RevealPayload {
  roundNumber: number;
  choices: Record<PlayerSlot, CardType>;
  result: RoundResult;
  stars: Record<PlayerSlot, number>;
  winner: PlayerSlot | 'draw' | null;
  finishReason: FinishReason | null;
}

/** 상대에게 공개되는 마스킹 뷰 */
export interface PublicGameView {
  roomCode: string;
  roundNumber: number;
  roundId: string;
  status: GameStatus;
  deadlineAt: string;
  startedAt: string;
  me: {
    slot: PlayerSlot;
    nickname: string;
    hand: HandCounts;
    stars: number;
    submitted: boolean;
    choice: CardType | null;
  };
  opponent: {
    nickname: string;
    stars: number;
    totalCards: number;
    submitted: boolean;
    connected: boolean;
  };
  lastReveal: RevealPayload | null;
  winner: PlayerSlot | 'draw' | null;
  finishReason: FinishReason | null;
}

export interface LobbyPlayerInfo {
  slot: PlayerSlot;
  nickname: string;
  connected: boolean;
  ready: boolean;
}

export interface LobbyState {
  roomCode: string;
  status: RoomStatus;
  players: LobbyPlayerInfo[];
  inviteUrlPath: string;
}

export type RoomErrorCode =
  | 'NOT_FOUND'
  | 'FULL'
  | 'IN_PROGRESS'
  | 'EXPIRED'
  | 'INVALID_CODE'
  | 'NICKNAME_TAKEN';

export type SubmitErrorCode =
  | 'NOT_PLAYING'
  | 'ROUND_MISMATCH'
  | 'ALREADY_SUBMITTED'
  | 'NO_SUCH_CARD'
  | 'UNKNOWN_SLOT';

// ---- 상수 ----
export const INITIAL_HAND: HandCounts = { rock: 4, scissors: 4, paper: 4 };
export const INITIAL_STARS = 3;
export const TOTAL_ROUNDS = 12;
export const GAME_TIMEOUT_MS = 4 * 3600 * 1000;

export function getReconnectGraceMs(): number {
  const v = Number(process.env.RECONNECT_GRACE_MS);
  return Number.isFinite(v) && v > 0 ? v : 60000;
}

export function getLobbyExpireMs(): number {
  const v = Number(process.env.LOBBY_EXPIRE_MS);
  return Number.isFinite(v) && v > 0 ? v : 30 * 60 * 1000;
}

export const CARD_LABEL: Record<CardType, string> = {
  rock: '바위',
  scissors: '가위',
  paper: '보',
};

export const CARD_EMOJI: Record<CardType, string> = {
  rock: '✊',
  scissors: '✌️',
  paper: '✋',
};
