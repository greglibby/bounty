import {
  GameMode,
  Rank,
  UI_STRINGS,
  ELIMINATION_CAUSES,
  Card
} from '../types/constants';
import { GameState, TurnResult, EngineEventMap } from '../types/engine';
import { Player } from '../types/entities';
import { Actions, GameContext } from './Actions';

import { Standard } from '../specialists/Standard';
import { Rainbow } from '../specialists/Rainbow';
import { LuckySeven } from '../specialists/LuckySeven';
import { Sabotage } from '../specialists/Sabotage';
import { JackShield } from '../specialists/JackShield';
import { Triple } from '../specialists/Triple';
import { KingBounty } from '../specialists/KingBounty';

// ─────────────────────────────────────────────────────────
// STRICT STATS INTERFACES
// ─────────────────────────────────────────────────────────

export interface RankStat { correct: number; incorrect: number; ties: number; total: number; }
export interface SpecialistStat { total: number; success?: number; colorTotal?: number; colorSuccess?: number; roundLengths?: number[]; accepted?: number; instantWins?: number; victimsFailed?: number; }

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
// THE HEADLESS BOUNTY ENGINE
// ─────────────────────────────────────────────────────────

export class BountyEngine implements GameContext {
  public players: Player[];
  public deck: Card[];
  public discardPile: Card[];
  public upCard: Card | null;
  public currentPlayerIndex: number;
  public gameOver: boolean;
  public gameStats: GameStats;
  public state: GameState & { [key: string]: any }; 
  
  private specialists: any[];
  
  // Lightweight internal Event Bus
  private listeners: { [K in keyof EngineEventMap]?: Array<(payload: EngineEventMap[K]) => void> } = {};

  constructor(playerName: string = "PLAYER 1") {
    const names = [playerName, "Charlie", "David", "Emma"];
    this.players = names.map((name, idx) => ({
      id: idx,
      name: name,
      hand: [],
      isEliminated: false,
      eliminationData: null,
    }));

    this.deck = [];
    this.discardPile = [];
    this.upCard = null;
    this.currentPlayerIndex = -1;
    this.gameOver = false;

    this.gameStats = {
      totalTurns: 0,
      totalRounds: 1,
      tiesWithDiscard: 0,
      reshuffles: 0,
      eliminationCauses: {},
      winMethod: "LAST_MAN_STANDING",
      rankAccuracy: Array.from({ length: 14 }, () => ({
        correct: 0, incorrect: 0, ties: 0, total: 0,
      })),
      specialists: {
        ace: { total: 0, success: 0 },
        lucky7: { total: 0, success: 0 },
        queen: { total: 0, colorTotal: 0, colorSuccess: 0, roundLengths: [] },
        bounty: { total: 0, accepted: 0, instantWins: 0 },
        sabotage: { total: 0, victimsFailed: 0, success: 0 },
        shield: { total: 0 },
      },
      combos: { pair: 0, straight: 0, flush: 0 },
    };

    this.state = {
      mode: GameMode.Normal,
      rainbowTheme: null,
      rainbowRoundCount: 0,
      rainbowOriginator: -1,
      rainbowActive: false,
      rainbowResolved: false,
      currentRoundGuessCount: 0,
      lastResult: "",
      isCeremony: false,
      mustDiscard: [],
      streakCount: 0,
      turnCount: 1,
      roundCount: 1,
      pendingSabotage: false,
      bountyProcessed: false,
      specialistProcessed: false,
      winner: null,
      bountyWinningCard: null,
      lastFlippedCard: null
    };

    this.specialists = [Triple, LuckySeven, Rainbow, Standard, JackShield, Sabotage, KingBounty];

    Actions.prepareGameDeck(this);
  }

  // ─────────────────────────────────────────────────────────
  // EVENT EMITTER CORE
  // ─────────────────────────────────────────────────────────

  public on<K extends keyof EngineEventMap>(event: K, listener: (payload: EngineEventMap[K]) => void): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(listener);
  }

  public emit<K extends keyof EngineEventMap>(event: K, payload: EngineEventMap[K]): void {
    if (this.listeners[event]) {
      this.listeners[event]!.forEach(fn => fn(payload));
    }
  }

  // ─────────────────────────────────────────────────────────
  // GAMEPLAY LOGIC
  // ─────────────────────────────────────────────────────────

  public get canAcceptInput(): boolean {
    if (this.state.gameOver || this.state.isCeremony) return false;
    return this.currentPlayerIndex === 0;
  }

  public recordSpecialistStat(type: string, result: string): void {
    if (type === "tie" && result === "discard") {
      this.gameStats.tiesWithDiscard++;
      return;
    }

    const s = this.gameStats.specialists[type];
    if (!s) return;

    if (result === "trigger") { s.total++; return; }

    if (type === "queen") {
      if (result === "color_guess") s.colorTotal = (s.colorTotal || 0) + 1;
      else if (result === "color_success") s.colorSuccess = (s.colorSuccess || 0) + 1;
      return;
    }

    if (type === "bounty") {
      if (result === "accepted") s.accepted = (s.accepted || 0) + 1;
      else if (result === "win") s.instantWins = (s.instantWins || 0) + 1;
    } else if (type === "sabotage") {
      if (result === "fail") s.victimsFailed = (s.victimsFailed || 0) + 1;
      else if (result === "success") s.success = (s.success || 0) + 1;
    } else {
      if (result === "success") s.success = (s.success || 0) + 1;
    }
  }

  public recordCombo(type: string): void {
    const key = type.toLowerCase();
    if (this.gameStats.combos[key] !== undefined) {
      this.gameStats.combos[key]++;
    }
  }

  public startCeremony(): void {
    this.state.mode = GameMode.Ceremony;
    this.state.isCeremony = true;
    this.currentPlayerIndex = -1;
    this.players.forEach((p) => (p.hand = []));
  }

  public drawCeremonyCard(playerIdx: number): void {
    const card = Actions.draw(this);
    if (!card) return;
    this.players[playerIdx].ceremonyCard = card;
    this.players[playerIdx].hand = [card];
    this.emit('CARD_FLIPPED', { player: this.players[playerIdx], card, result: {} as TurnResult }); 
  }

  public evaluateCeremonyRound(playerIndices: number[]): { survivors: number[], isTie: boolean } {
    let minRank = 14; 
    playerIndices.forEach((idx) => {
      const card = this.players[idx].ceremonyCard;
      if (card && card.rank < minRank) minRank = card.rank;
    });

    const survivors = playerIndices.filter((idx) => {
      const card = this.players[idx].ceremonyCard;
      return card && card.rank === minRank;
    });

    return { survivors, isTie: survivors.length > 1 };
  }

  public finalizeCeremony(winnerIdx: number): void {
    this.currentPlayerIndex = winnerIdx;
  }

  public endCeremony(): void {
    this.state.isCeremony = false;
    this.players.forEach((p) => {
      p.hand = [];
      delete p.ceremonyCard;
    });
    this.upCard = null;
    this.state.lastResult = "";
    this.syncGameState();
  }

  public processGuess(choice: string | number): TurnResult | null {
    const player = this.players[this.currentPlayerIndex];

    // Hand Action Handling
    if (typeof choice === "number") {
      const card = player.hand[choice];
      if (card && card.rank === Rank.Four) return Sabotage.execute!(this, choice);
      if (card && card.rank === Rank.Jack) return JackShield.execute!(this, choice);
      
      if (this.state.mode === GameMode.QueenSocial) {
        const result = Rainbow.resolve(this, choice);
        if (result) this.applyResult(result);
        return result;
      }
      return null;
    }

    // Rainbow Round Color Guess Handling (No suits)
    if (
      this.state.mode === GameMode.QueenSocial &&
      typeof choice === "string" &&
      [
        "Yellow", "Red", "Blue", "Green", 
        "yellow", "red", "blue", "green"
      ].includes(choice)
    ) {
      const result = Rainbow.resolve(this, choice);
      if (result) {
        result.guess = choice;
        this.applyResult(result);
      }
      return result;
    }

    // Bounty Decline Handling
    if (this.state.mode === GameMode.KingBounty && choice === "DECLINE") {
      this.recordSpecialistStat("bounty", "trigger");
      this.state.mode = GameMode.Normal;
      this.state.lastResult = UI_STRINGS["BOUNTY_DECLINED"] || "Challenge declined.";
      this.state.bountyProcessed = true; 
      this.syncGameState();
      return { type: "DECLINED_ACTION", success: true, flipped: null, message: this.state.lastResult, endTurn: false };
    }

    this.syncGameState();
    const specialist = this.specialists.find((s) => s.canHandle(this.state));

    if (!specialist) return null;

    const result = specialist.resolve(this, choice);
    if (result) {
      result.guess = choice;
      this.applyResult(result);
    }
    return result;
  }

  public applyResult(result: TurnResult): void {
    const player = this.players[this.currentPlayerIndex];
    const targetRank = this.upCard ? this.upCard.rank : null;

    this.state.lastResult = result.message;

    if (result.flipped) {
      if (result.success || result.type === "TIE" || result.type === "TIE_REGUESS") {
        Actions.commitToDiscard(this, result.flipped);
        if (result.type === "LUCKY_7_SUCCESS" && player.hand.some((c) => c !== null)) {
          if (!this.state.mustDiscard.includes(-1)) this.state.mustDiscard.push(-1);
        }
      } else {
        const emptyIdx = player.hand.indexOf(null);
        if (emptyIdx !== -1) player.hand[emptyIdx] = result.flipped;
        else player.hand.push(result.flipped);
      }
      
      this.emit('CARD_FLIPPED', { player, result, card: result.flipped });
    }

    if (this.checkCombos(player)) {
      result.endTurn = true;
    }

    if (this.state.gameOver) {
      this.state.mode = GameMode.GameOver;
      this.emit('GAME_OVER', { winner: this.state.winner, state: this.state });
    }

    // Rank Accuracy Tracking
    const accuracyModes = [GameMode.Normal, GameMode.Triple, GameMode.Lucky7];
    if (accuracyModes.includes(this.state.mode) && targetRank !== null) {
      const stats = this.gameStats.rankAccuracy[targetRank];
      stats.total++;
      if (result.type === "TIE_REGUESS") stats.ties++;
      else if (result.success) stats.correct++;
      else stats.incorrect++;
    }
  }

  public syncGameState(): void {
    const state = this.state;
    if (!this.upCard) { state.mode = GameMode.Normal; return; }

    if (state.pendingSabotage) { state.mode = GameMode.Sabotage; return; }
    if (state.mode === GameMode.Triple && state.streakCount > 0 && state.streakCount < 3) return;

    if (state.rainbowActive) {
      if (this.upCard && this.upCard.rank !== Rank.Queen) {
        state.rainbowActive = false;
        state.rainbowResolved = true;
        state.currentRoundGuessCount = 0;
      } else {
        state.mode = GameMode.QueenSocial;
        return;
      }
    }

    const rank = this.upCard.rank;
    const player = this.players[this.currentPlayerIndex];

    if (rank === Rank.Queen) {
      state.mode = GameMode.QueenSocial;
      if (!state.rainbowActive && !state.rainbowResolved) {
        state.rainbowActive = true;
        state.rainbowRoundCount = 0;
        state.currentRoundGuessCount = 0;
        this.gameStats.specialists.queen.total++;
      }
    } else if (rank === Rank.Three) {
      state.mode = GameMode.Triple;
      if (state.streakCount === 0 && !state.specialistProcessed) {
        state.lastResult = UI_STRINGS["STREAK_NEEDS_3"];
        this.gameStats.specialists.ace.total++;
        state.specialistProcessed = true;
      }
    } else if (rank === Rank.Seven) {
      state.mode = GameMode.Lucky7;
      if (!state.specialistProcessed) {
        this.gameStats.specialists.lucky7.total++;
        state.specialistProcessed = true;
      }
    } else if (rank === Rank.King && player && player.hand.some((c) => c !== null) && !state.bountyProcessed) {
      state.mode = GameMode.KingBounty;
    } else {
      state.mode = GameMode.Normal;
    }
  }

  public checkCombos(player: Player): boolean {
    if (player.isEliminated) return false;

    const activeHand = player.hand
      .map((card, index) => ({ card, index }))
      .filter((item): item is { card: Card; index: number } => item.card !== null);

    if (activeHand.length < 2) {
      this.checkElimination(player);
      return false;
    }

    // Pair Check 
    const counts: Record<number, number[]> = {};
    activeHand.forEach((item) => {
      const r = item.card.rank;
      if (!counts[r]) counts[r] = [];
      counts[r].push(item.index);
    });
    for (const rank in counts) {
      if (counts[rank].length >= 2) {
        this.recordCombo("pair");
        this.state.mode = GameMode.Discard;
        this.state.mustDiscard = counts[rank].slice(0, 2);
        this.state.lastResult = UI_STRINGS["COMBO_PAIR"];
        this.state.streakCount = 0;
        return true;
      }
    }

    this.checkElimination(player);
    return false;
  }

  public executePhysicalDiscard(cardIndex: number): Card | null {
    const player = this.players[this.currentPlayerIndex];
    const card = player.hand[cardIndex];
    if (!card) return null;

    player.hand[cardIndex] = null;
    Actions.commitToDiscard(this, card);
    
    // Broadcast physical move 
    this.emit('CARD_DISCARDED', { player, slotIndex: cardIndex, card });

    return card;
  }

  public processDiscard(cardIndex: number): Card | null {
    const player = this.players[this.currentPlayerIndex];
    const isWildcard = this.state.mustDiscard.includes(-1);
    const isRequiredIndex = this.state.mustDiscard.includes(cardIndex);

    if (!isRequiredIndex && !isWildcard) return null;

    const discardedCard = this.executePhysicalDiscard(cardIndex);
    if (!discardedCard) return null;

    if (isWildcard) {
      const idx = this.state.mustDiscard.indexOf(-1);
      this.state.mustDiscard.splice(idx, 1);
    } else {
      this.state.mustDiscard = this.state.mustDiscard.filter((idx) => idx !== cardIndex);
    }

    if (this.state.mustDiscard.length === 0) {
      if (discardedCard.rank === Rank.Four) this.state.pendingSabotage = true;
      this.checkElimination(player);
    }

    return discardedCard;
  }

  public checkElimination(player: Player): boolean {
    const activeCards = player.hand.filter((c) => c !== null).length;

    if (activeCards >= 4) {
      player.isEliminated = true;
      const rawCause = this.state.mode || GameMode.Normal;
      this.gameStats.eliminationCauses[rawCause] = (this.gameStats.eliminationCauses[rawCause] || 0) + 1;

      if (!this.gameStats.eliminationSequence) this.gameStats.eliminationSequence = [];
      if (!this.gameStats.eliminationSequence.includes(player.name)) {
        this.gameStats.eliminationSequence.push(player.name);
      }

      player.eliminationData = {
        outOrder: this.gameStats.eliminationSequence.length,
        cause: ELIMINATION_CAUSES[rawCause] || rawCause,
        finalHand: [...player.hand.filter((c): c is Card => c !== null)],
        round: this.gameStats.totalRounds,
      };
      
      this.emit('PLAYER_ELIMINATED', { player });

      const survivors = this.players.filter((p) => !p.isEliminated);
      if (survivors.length <= 1) {
        this.gameOver = true;
        this.state.gameOver = true;
        this.state.winner = survivors.length === 1 ? survivors[0] : null;
        if (this.state.winner && !this.gameStats.eliminationSequence.includes(this.state.winner.name)) {
          this.gameStats.eliminationSequence.push(this.state.winner.name);
        }
      }
      return true;
    }
    return false;
  }

  public nextTurn(): void {
    const { state, players } = this;
    state.bountyProcessed = false;
    state.rainbowResolved = false;
    state.specialistProcessed = false;

    if (!state.rainbowActive || state.mode === GameMode.Triple) {
      state.streakCount = 0;
    }

    let nextIdx = (this.currentPlayerIndex + 1) % players.length;
    while (players[nextIdx] && players[nextIdx].isEliminated) {
      nextIdx = (nextIdx + 1) % players.length;
    }

    this.currentPlayerIndex = nextIdx;
    this.syncGameState();
    
    this.emit('TURN_STARTED', { activePlayerId: this.currentPlayerIndex, state: this.state });
  }

  public resetState(): void {
    this.state.mode = GameMode.Normal;
    this.state.winner = null;
    this.state.gameOver = false;
    this.state.bountyWinningCard = null;
    this.state.rainbowActive = false;
    this.state.rainbowResolved = false;
    this.state.rainbowRoundCount = 0;
    this.state.currentRoundGuessCount = 0;
    this.state.streakCount = 0;
    this.state.pendingSabotage = false;
    this.state.bountyProcessed = false;
    this.state.specialistProcessed = false;
  }
}

// Global stateless utility
export const calculateWinProbability = (game: BountyEngine): number => {
  const { state, players, currentPlayerIndex, upCard } = game;
  const mode = state.mode;

  if (mode === GameMode.Sabotage) return 0.1;
  if (mode === GameMode.QueenSocial) return 0.25; // 1 in 4 chance for pure color selection

  if (mode === GameMode.KingBounty) {
    if ((state as any).bountyStatus === "DECLINED") return 0.9;
    const activePlayer = players[currentPlayerIndex];
    const handCount = activePlayer.hand.filter((c) => c !== null).length;
    if (handCount >= 3) return 0.0;
    if (handCount === 2) return 0.2;
    return 0.3;
  }

  if (mode === GameMode.Triple) {
    const r = upCard ? upCard.rank : 8;
    const pStep = (rank: number) => {
      if (rank === 1) return 12 / 13;
      return Math.max((13 - rank) / 13, (rank - 1) / 13);
    };
    const baseProb = pStep(r);
    const streakPenalty = (state.streakCount || 0) * 0.15;
    return Math.max(0.05, baseProb - streakPenalty);
  }

  if (!upCard) return 0.5;
  const r = upCard.rank;
  if (r === Rank.Four) return 0.6;
  return Math.max((13 - r) / 13, (r - 1) / 13);
};