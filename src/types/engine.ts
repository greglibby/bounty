import { GameMode } from './constants';
import { Card, Player } from './entities';

// ─────────────────────────────────────────────────────────
// STATE & STATS
// ─────────────────────────────────────────────────────────

export interface GameState {
  mode: GameMode;
  rainbowTheme: 'COLOR' | null; 
  rainbowRoundCount: number;
  rainbowOriginator: number;
  rainbowActive: boolean;
  rainbowResolved: boolean;
  currentRoundGuessCount: number;
  lastResult: string;
  isCeremony: boolean;
  mustDiscard: number[];
  streakCount: number;
  turnCount: number;
  roundCount: number;
  pendingSabotage: boolean;
  bountyProcessed: boolean;
  specialistProcessed: boolean;
  winner: Player | null;
  bountyWinningCard: Card | null;
  lastFlippedCard: Card | null;
}

export interface RankStat { 
  correct: number; 
  incorrect: number; 
  ties: number; 
  total: number; 
}

export interface SpecialistStat { 
  total: number; 
  success?: number; 
  colorTotal?: number; 
  colorSuccess?: number; 
  roundLengths?: number[]; 
  accepted?: number; 
  instantWins?: number; 
  victimsFailed?: number; 
}

export interface GameStats {
  totalTurns: number;
  totalRounds: number;
  tiesWithDiscard: number;
  reshuffles: number;
  eliminationCauses: Record<string, number>;
  eliminationSequence?: string[];
  winMethod: string;
  rankAccuracy: RankStat[]; 
  specialists: Record<string, SpecialistStat>;
  combos: Record<string, number>;
}

// ─────────────────────────────────────────────────────────
// EVENT EMITTER & RESULTS
// ─────────────────────────────────────────────────────────

export interface BountyFlipStep {
  card: Card;
  isMatch: boolean;
}

export interface TurnResult {
  success: boolean;
  type: string; 
  flipped: Card | null;
  message: string;
  endTurn: boolean;
  guess?: string | number; 
  sequence?: BountyFlipStep[]; 
}

export interface EngineEventMap {
  'GAME_STARTED': { state: GameState; players: Player[] };
  'TURN_STARTED': { activePlayerId: number; state: GameState };
  'CARD_FLIPPED': { player: Player; result: TurnResult; card: Card };
  'CARD_DISCARDED': { player: Player; slotIndex: number; card: Card };
  'COMBO_TRIGGERED': { player: Player; indices: number[]; comboType: string };
  'SPECIAL_PLAYED': { player: Player; card: Card; modeTriggered: string };
  'DECK_RESHUFFLED': { newDeckSize: number };
  'PLAYER_ELIMINATED': { player: Player };
  'GAME_OVER': { winner: Player | null; state: GameState };
}

// ─────────────────────────────────────────────────────────
// MASTER CONTEXT & CONTRACTS
// ─────────────────────────────────────────────────────────

export interface EngineContext {
  deck: Card[];
  discardPile: Card[];
  upCard: Card | null;
  players: Player[];
  state: GameState;
  gameStats: GameStats;
  currentPlayerIndex: number;
  resetState: () => void;
  recordSpecialistStat: (type: string, result: string) => void;
  executePhysicalDiscard: (slotIndex: number) => Card | null;
}

export interface Specialist {
  canHandle: (state: GameState) => boolean;
  resolve: (game: EngineContext, guess?: string | number) => TurnResult | null;
  execute?: (game: EngineContext, slotIndex: number) => TurnResult | null; 
}