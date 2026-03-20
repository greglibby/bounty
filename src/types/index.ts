// =============================================================================
// BOUNTY — Shared Type Definitions
// src/types/index.ts
//
// Single source of truth for all interfaces.
// Import from here everywhere. No runtime code lives in this file.
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

export type CardColor = "Yellow" | "Red" | "Blue" | "Green";

export type GameMode =
  | "CEREMONY"
  | "NORMAL"
  | "DISCARD"
  | "QUEEN_SOCIAL"
  | "KING_BOUNTY"
  | "LUCKY_7"
  | "TRIPLE"
  | "SABOTAGE"
  | "SHIELD"
  | "GAME_OVER";

export type Difficulty = "EASY" | "NORMAL" | "HARD";

// ─────────────────────────────────────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────────────────────────────────────

export interface StrewnMetadata {
  rot: number;    // one of STREWN_CONFIG.ROTATIONS
  offset: string; // one of STREWN_CONFIG.OFFSETS
}

export interface Card {
  color: CardColor;
  rank: number;         // 1–13
  _strewn?: StrewnMetadata;
}

// ─────────────────────────────────────────────────────────────────────────────
// Player
// ─────────────────────────────────────────────────────────────────────────────

export interface EliminationData {
  outOrder: number;
  cause: string;
  finalHand: Card[];
  round: number;
  matchRank?: number;
}

export interface PlayerStats {
  combosTriggered: number;
}

export interface Player {
  name: string;
  hand: (Card | null)[];   // null = empty slot
  isEliminated: boolean;
  eliminationData: EliminationData | null;
  stats: PlayerStats;
  ceremonyCard?: Card;     // only present during CEREMONY phase
}

// ─────────────────────────────────────────────────────────────────────────────
// GameState — the mutable live state object
// ─────────────────────────────────────────────────────────────────────────────

export interface GameState {
  // Core
  mode: GameMode;
  lastResult: string;
  isCeremony: boolean;
  gameOver: boolean;
  winner: Player | null | undefined;

  // Discard pipeline
  mustDiscard: number[];      // slot indices; -1 = wildcard

  // Queen / Social Round
  socialActive: boolean;
  socialResolved: boolean;
  socialTheme: CardColor | null;
  socialRoundCount: number;
  socialOriginator: number;
  currentRoundGuessCount: number;

  // Triple streak
  streakCount: number;

  // Sabotage
  pendingSabotage: boolean;

  // Bounty
  bountyProcessed: boolean;
  bountyWinningCard: Card | null | undefined;
  bountyStatus?: string;

  // Shared specialist lock — prevents double-counting 3s and 7s across turns
  specialistProcessed: boolean;

  // Turn / round bookkeeping
  turnCount: number;
  roundCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Game Stats
// ─────────────────────────────────────────────────────────────────────────────

export interface RankAccuracyStat {
  success: number;
  total: number;
  correct?: number;
  incorrect?: number;
  ties?: number;
}

export interface SpecialistStats {
  ace:      { total: number; success: number };
  lucky7:   { total: number; success: number };
  queen:    { total: number; colorTotal: number; colorSuccess: number; roundLengths: number[] };
  bounty:   { total: number; accepted: number; instantWins: number };
  sabotage: { total: number; victimsFailed: number; success: number };
  shield:   { total: number };
}

export interface ComboStats {
  pair: number;
  straight: number;
  flush: number;
}

export interface GameStats {
  totalTurns: number;
  totalRounds: number;
  tiesWithDiscard: number;
  reshuffles: number;
  eliminationCauses: Record<string, number>;
  eliminationSequence?: string[];
  winMethod: string;
  rankAccuracy: RankAccuracyStat[];
  specialists: SpecialistStats;
  combos: ComboStats;
}

// ─────────────────────────────────────────────────────────────────────────────
// SpecialistResult — the object every specialist resolve() returns
// ─────────────────────────────────────────────────────────────────────────────

export interface SpecialistResult {
  type: string;              // e.g. "RESOLVE", "TIE_REGUESS", "LUCKY_7_SUCCESS"
  success: boolean;
  flipped?: Card;            // the card drawn from the deck this turn
  message: string;
  endTurn: boolean;
  guess?: string | number;   // the original choice, injected by Engine after resolve()
}

// ─────────────────────────────────────────────────────────────────────────────
// IGameEngine
//
// The interface the Specialist modules and Actions use to talk to the engine.
// Defined here (not in Engine.ts) so specialists and Actions can import it
// without creating circular dependencies. BountyEngine satisfies this
// structurally — TypeScript will verify that automatically when Engine.ts
// is converted.
// ─────────────────────────────────────────────────────────────────────────────

export interface IGameEngine {
  upCard: Card | null;
  state: GameState;
  players: Player[];
  currentPlayerIndex: number;
  deck: Card[];
  discardPile: Card[];
  gameStats: GameStats;
  resetState(): void;
  executePhysicalDiscard(slotIndex: number): Card | null;
  recordSpecialistStat(type: string, result: string): void;
  // syncGameState is called by Sabotage.execute — included for completeness
  syncGameState(): void;
}