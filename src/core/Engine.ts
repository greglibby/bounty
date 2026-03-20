import {
  MODES,
  RANKS,
  DECK_CONFIG,
  UI_STRINGS,
  COMBO_RULES,
  ELIMINATION_CAUSES,
} from "../constants.js";
import { Actions } from "./Actions.js";
import { Standard } from "../specialists/Standard.js";
import { Rainbow } from "../specialists/Rainbow.js";
import { LuckySeven } from "../specialists/LuckySeven.js";
import { Sabotage } from "../specialists/Sabotage.js";
import { JackShield } from "../specialists/JackShield.js";
import { Triple } from "../specialists/Triple.js";
import { KingBounty } from "../specialists/KingBounty.js";
import { SoundManager } from "./SoundManager.js";
import type {
  Card,
  CardColor,
  GameMode,
  GameState,
  GameStats,
  IGameEngine,
  Player,
  SpecialistResult,
} from "../types/index.js";
import type { Specialist } from "../specialists/Specialist.js";

// Loose return type for processGuess: the DECLINED_ACTION path and JackShield
// return shapes that don't fully satisfy SpecialistResult, so callers should
// treat any falsy / missing-endTurn value as a no-op.
type GuessResult = SpecialistResult | { type: string; endTurn: boolean; success?: boolean } | null | false;

export class BountyEngine implements IGameEngine {
  players: Player[];
  deck: Card[];
  discardPile: Card[];
  upCard: Card | null;
  currentPlayerIndex: number;
  gameOver: boolean;
  gameStats: GameStats;
  state: GameState;
  specialists: Specialist[];

  constructor(playerName = "PLAYER 1") {
    // Ensure the human player (Index 0) uses the captured name
    const names = [playerName, "Charlie", "David", "Emma"];
    this.players = names.map((name): Player => ({
      name,
      hand: [],
      isEliminated: false,
      eliminationData: null,
      stats: { combosTriggered: 0 },
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
        success: 0,
        total: 0,
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

    // specialistProcessed, winner, bountyWinningCard, and bountyStatus are
    // set at runtime — omitted here and cast so the object satisfies GameState.
    this.state = {
      mode: MODES.NORMAL,
      lastResult: "",
      isCeremony: false,
      gameOver: false,
      winner: null,              // ← add
      bountyWinningCard: null,   // ← add
      specialistProcessed: false, // ← add
      mustDiscard: [],
      socialActive: false,
      socialResolved: false,
      socialTheme: null,
      socialOriginator: 0,
      socialRoundCount: 0,
      currentRoundGuessCount: 0,
      pendingSabotage: false,
      bountyProcessed: false,
      streakCount: 0,
      turnCount: 0,
      roundCount: 0,
    };

    // JackShield and KingBounty satisfy the canHandle/resolve contract but
    // have extended execute signatures; cast them in for the Specialist array.
    this.specialists = [
      Triple,
      LuckySeven,
      Rainbow,
      Standard,
      JackShield as unknown as Specialist,
      Sabotage,
      KingBounty as unknown as Specialist,
    ];

    // Populate the deck using color + rank
    const colors = DECK_CONFIG.COLORS;
    const min = DECK_CONFIG.MIN_RANK;
    const max = DECK_CONFIG.MAX_RANK;

    for (const c of colors) {
      for (let r = min; r <= max; r++) {
        this.deck.push({ color: c, rank: r });
      }
    }

    // Now shuffle the full 52-card deck
    Actions.shuffle(this.deck);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Utility
  // ─────────────────────────────────────────────────────────────────────────

  getSpecialistClass(rank: number): string | null {
    const mapping: Partial<Record<number, string>> = {
      3: "triple-card",
      4: "sabotage-card",
      7: "lucky-7-card",
      11: "shield-card",
      12: "queen-card",
      13: "king-card",
    };
    return mapping[rank] ?? null;
  }

  get canAcceptInput(): boolean {
    if (this.state.gameOver || this.state.isCeremony) return false;
    const currentPlayer = this.players[this.currentPlayerIndex];
    return !!currentPlayer && this.currentPlayerIndex === 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Stat Recording
  // ─────────────────────────────────────────────────────────────────────────

  recordSpecialistStat(type: string, result: string): void {
    const s = this.gameStats.specialists;
    switch (type) {
      case "bounty":
        s.bounty.total++;
        if (result === "accepted") s.bounty.accepted++;
        if (result === "win") s.bounty.instantWins++;
        break;
      case "lucky7":
        s.lucky7.total++;
        if (result === "success") s.lucky7.success++;
        break;
      case "sabotage":
        s.sabotage.total++;
        if (result === "fail") s.sabotage.victimsFailed++;
        if (result === "success") s.sabotage.success++;
        break;
      case "queen":
        s.queen.total++;
        if (result === "color_round") s.queen.colorTotal++;
        if (result === "color_success") s.queen.colorSuccess++;
        break;
      case "ace":
        s.ace.total++;
        if (result === "success") s.ace.success++;
        break;
      case "shield":
        s.shield.total++;
        break;
    }
  }

  recordTieDiscard(): void {
    this.gameStats.tiesWithDiscard++;
  }

  recordCombo(type: string): void {
    const key = type.toLowerCase() as keyof typeof this.gameStats.combos;
    if (Object.prototype.hasOwnProperty.call(this.gameStats.combos, key)) {
      this.gameStats.combos[key]++;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Discard / State Setup
  // ─────────────────────────────────────────────────────────────────────────

  setDiscardRequirement(indices: number[], message: string): true {
    this.state.mustDiscard = indices;
    this.state.lastResult = message;
    this.state.streakCount = 0;
    return true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Ceremony Phase
  // ─────────────────────────────────────────────────────────────────────────

  startCeremony(): void {
    this.state.mode = MODES.CEREMONY;
    this.state.isCeremony = true;
    this.currentPlayerIndex = -1;
    this.players.forEach((p) => (p.hand = []));
  }

  drawCeremonyCard(playerIdx: number): void {
    const card = Actions.draw(this);
    if (!card) {
      console.error(
        `CRITICAL: Ceremony draw failed for player ${playerIdx}. Deck empty?`,
      );
      return;
    }
    const p = this.players[playerIdx];
    if (!p) return;
    p.ceremonyCard = card;
    p.hand = [card];
  }

  evaluateCeremonyRound(playerIndices: number[]): { survivors: number[]; isTie: boolean } {
    let minRank = 14; // Higher than any possible card (King is 13)

    // 1. Find the actual minimum rank among valid cards
    playerIndices.forEach((idx) => {
      const card = this.players[idx]?.ceremonyCard;
      if (card && card.rank < minRank) minRank = card.rank;
    });

    // 2. Filter survivors who match that minimum rank
    const survivors = playerIndices.filter((idx) => {
      const card = this.players[idx]?.ceremonyCard;
      return card && card.rank === minRank;
    });

    return { survivors, isTie: survivors.length > 1 };
  }

  finalizeCeremony(winnerIdx: number): void {
    this.currentPlayerIndex = winnerIdx;
  }

  endCeremony(): void {
    // 1. CLEAR FLAGS: Signal that the ceremony phase is physically over.
    this.state.isCeremony = false;

    // 2. CLEANUP: Ensure ceremony-specific card references are gone.
    this.players.forEach((p) => {
      p.hand = [];
      if (p.ceremonyCard) delete p.ceremonyCard;
    });

    // 3. PHYSICAL TABLE RESET: Clear the Up Card so the Director can draw a fresh one.
    this.upCard = null;
    this.state.lastResult = "";

    // 4. SYNC: Lock in the current mode based on the lack of an Up Card (defaults to NORMAL).
    this.syncGameState();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Core Turn Loop
  // ─────────────────────────────────────────────────────────────────────────

  processGuess(choice: string | number): GuessResult {
    // 1. Check if the choice is a slot index (Hand Action - Jack or 4)
    if (typeof choice === "number") {
      const player = this.players[this.currentPlayerIndex];
      if (!player) return null;
      const card = player.hand[choice];

      // PRIORITIZE HAND ACTIONS: Jacks and 4s break out of any mode (Social, Bounty, etc.)
      if (card && card.rank === 4) {
        return Sabotage.execute!(this, choice);
      }
      if (card && card.rank === 11) {
        return JackShield.execute(this, choice) as GuessResult;
      }

      // If it wasn't a 4 or J, but we are in Social Mode, let the specialist handle it
      if (this.state.mode === MODES.QUEEN_SOCIAL) {
        const result = Rainbow.resolve(this, choice);
        if (result) this.applyResult(result);
        return result;
      }
      return null;
    }

    // 2. Handle as a colour guess during Rainbow Round
    if (
      this.state.mode === MODES.QUEEN_SOCIAL &&
      typeof choice === "string" &&
      (["Yellow", "Red", "Blue", "Green", "yellow", "red", "blue", "green"] as string[]).includes(choice)
    ) {
      const result = Rainbow.resolve(this, choice);
      if (result) {
        result.guess = choice;
        this.applyResult(result);
      }
      return result;
    }

    // --- BOUNTY DECLINE HANDLING ---
    if (
      this.state.mode === MODES.KING_BOUNTY &&
      typeof choice === "string" &&
      choice === "DECLINE"
    ) {
      this.recordSpecialistStat("bounty", "trigger");
      this.state.mode = MODES.NORMAL;
      this.state.lastResult = "Challenge decline. Make a guess.";
      this.state.bountyProcessed = true; // LOCK OUT FOR TURN
      this.syncGameState();
      return { type: "DECLINED_ACTION", endTurn: false };
    }

    // 3. Otherwise, handle as a standard Higher/Lower guess
    this.syncGameState();
    const specialist = this.specialists.find((s) => s.canHandle(this.state));

    if (!specialist) {
      console.error(`No specialist for mode ${this.state.mode}`);
      return null;
    }

    const result = specialist.resolve(this, choice);
    if (result) {
      result.guess = choice;
      this.applyResult(result);
    }
    return result;
  }

  applyResult(result: SpecialistResult): void {
    const player = this.players[this.currentPlayerIndex];
    if (!player) return;

    // --- FIX: Capture the target rank BEFORE the upCard is updated ---
    // This ensures we record the stat against the card being guessed ON, not the new flip.
    const targetRank: number | null = this.upCard ? this.upCard.rank : null;

    // 1. Update visual feedback
    this.state.lastResult = result.message;

    if (result.flipped) {
      // FIX: Ties must now be committed to the registry, not added to hands.
      if (result.success || result.type === "TIE" || result.type === "TIE_REGUESS") {
        // Physical table update: Flipped card routes through Commit Gate
        Actions.commitToDiscard(this, result.flipped);

        // Lucky 7 correct guess reward only
        if (result.type === "LUCKY_7_SUCCESS" && player.hand.some((c) => c !== null)) {
          if (!this.state.mustDiscard.includes(-1)) {
            this.state.mustDiscard.push(-1);
          }
        }
      } else {
        // Failure: Add card to hand
        if (!player.hand.includes(result.flipped)) {
          const emptyIdx = player.hand.indexOf(null);
          if (emptyIdx !== -1) player.hand[emptyIdx] = result.flipped;
          else player.hand.push(result.flipped);
        }
      }
    }

    // 2. Context Check: Evaluate for Combos/Elimination after the hand changes
    if (this.checkCombos(player)) {
      result.endTurn = true;
    }

    // 3. Game Over Integrity Guard
    if (this.state.gameOver) {
      this.state.mode = "GAME_OVER";
    }

    // --- FIXED: RANK ACCURACY TRACKING (Using targetRank) ---
    const accuracyModes: GameMode[] = [MODES.NORMAL, MODES.TRIPLE, MODES.LUCKY_7];
    if (accuracyModes.includes(this.state.mode) && targetRank !== null) {
      const r = targetRank;

      // Ensure the rank object exists with all required keys
      if (
        !this.gameStats.rankAccuracy[r] ||
        typeof this.gameStats.rankAccuracy[r].correct === "undefined"
      ) {
        this.gameStats.rankAccuracy[r] = {
          correct: 0,
          incorrect: 0,
          ties: 0,
          total: 0,
          success: 0,
        };
      }

      const stats = this.gameStats.rankAccuracy[r];
      stats.total++; // Increment denominator first

      // Strict Check: TIE_REGUESS is prioritized so it cannot be counted as Correct
      if (result.type === "TIE_REGUESS") {
        stats.ties = (stats.ties ?? 0) + 1;
      } else if (result.success === true) {
        // Only actual Higher/Lower wins recorded here
        stats.correct = (stats.correct ?? 0) + 1;
      } else {
        // Only actual misses recorded here
        stats.incorrect = (stats.incorrect ?? 0) + 1;
      }

      console.log(
        `📊 Engine Rank Accuracy: Rank ${r} | Correct: ${stats.correct} | Incorrect: ${stats.incorrect} | Tie: ${stats.ties}`,
      );
    }
  }

  handlePostGuessRewards(result: SpecialistResult, player: Player): void {
    const rewardTriggers = [
      "TIE",
      "LUCKY_7_SUCCESS",
      "TRIPLE_COMPLETE",
      "QUEEN_SOCIAL_SUCCESS",
    ];

    if (rewardTriggers.includes(result.type)) {
      if (player.hand.some((c) => c !== null)) {
        if (!this.state.mustDiscard.includes(-1)) {
          this.state.mustDiscard.push(-1); // -1 is the "Wildcard" discard token
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // State Sync
  // ─────────────────────────────────────────────────────────────────────────

  syncGameState(): void {
    const state = this.state;

    if (!this.upCard) {
      state.mode = MODES.NORMAL;
      return;
    }

    // --- PRIORITY 1: VOLATILE SPECIALIST LOCKS ---
    if (state.pendingSabotage) {
      state.mode = MODES.SABOTAGE;
      return;
    }

    // Triple Lock: Persistent until 3 guesses or failure
    if (
      state.mode === MODES.TRIPLE &&
      state.streakCount > 0 &&
      state.streakCount < 3
    ) {
      return;
    }

    // --- PRIORITY 2: PERSISTENT MODES ---
    if (state.socialActive) {
      // INTEGRITY GUARD: If the Up Card is no longer a Queen, the Rainbow Round
      // has been disrupted (correct guess, combo discard, Jack, or Sabotage
      // changed the Up Card). End the round immediately.
      if (this.upCard && this.upCard.rank !== RANKS.QUEEN) {
        state.socialActive = false;
        state.socialResolved = true;
        state.currentRoundGuessCount = 0;
        // Fall through to rank detection below
      } else {
        state.mode = MODES.QUEEN_SOCIAL;
        return;
      }
    }

    // --- PRIORITY 3: RANK DETECTION (Natural State) ---
    const rank = this.upCard.rank;
    const player = this.players[this.currentPlayerIndex];

    if (rank === RANKS.QUEEN) {
      state.mode = MODES.QUEEN_SOCIAL;
      if (!state.socialActive && !state.socialResolved) {
        state.socialActive = true;
        state.socialRoundCount = 0;
        state.currentRoundGuessCount = 0;
        if (this.gameStats.specialists.queen) {
          this.gameStats.specialists.queen.total++;
        }
      }
    } else if (rank === RANKS.THREE) {
      state.mode = MODES.TRIPLE;
      // FIX: Only increment total once per physical 3 using specialistProcessed lock
      if (state.streakCount === 0 && !state.specialistProcessed) {
        state.lastResult = UI_STRINGS.STREAK_NEEDS_3;
        if (this.gameStats.specialists.ace) {
          this.gameStats.specialists.ace.total++;
        }
        state.specialistProcessed = true;
      }
    } else if (rank === RANKS.SEVEN) {
      state.mode = MODES.LUCKY_7;
      // FIX: Only increment total once per physical Seven
      if (!state.specialistProcessed) {
        if (this.gameStats.specialists.lucky7) {
          this.gameStats.specialists.lucky7.total++;
        }
        state.specialistProcessed = true;
      }
    } else if (
      rank === RANKS.KING &&
      player &&
      player.hand.some((c) => c !== null) &&
      !state.bountyProcessed
    ) {
      state.mode = MODES.KING_BOUNTY;
    } else {
      state.mode = MODES.NORMAL;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Combo Detection
  // ─────────────────────────────────────────────────────────────────────────

  checkCombos(player: Player): boolean {
    if (player.isEliminated) return false;

    const activeHand = player.hand
      .map((card, index) => ({ card, index }))
      .filter((item): item is { card: Card; index: number } => item.card !== null);

    if (activeHand.length < 2) {
      this.checkElimination(player);
      return false;
    }

    // 1. Straight Check (3 cards in sequence)
    if (activeHand.length >= COMBO_RULES.MIN_STRAIGHT_LENGTH) {
      const sorted = [...activeHand].sort((a, b) => a.card.rank - b.card.rank);
      for (let i = 0; i <= sorted.length - 1; i++) {
        const first = sorted[i];
        if (!first) continue;
        const second = sorted.find((item) => item.card.rank === first.card.rank + 1);
        const third = sorted.find((item) => item.card.rank === first.card.rank + 2);
        if (second && third) {
          this.recordCombo("straight");
          this.state.mode = MODES.DISCARD;
          return this.setDiscardRequirement(
            [first.index, second.index, third.index],
            UI_STRINGS.COMBO_STRAIGHT,
          );
        }
      }
    }

    // 2. Flush Check (3 cards of same color)
    if (activeHand.length >= COMBO_RULES.MIN_FLUSH_LENGTH) {
      const colorGroups: Record<string, number[]> = {};
      activeHand.forEach((item) => {
        const c = item.card.color;
        if (!colorGroups[c]) colorGroups[c] = [];
        colorGroups[c].push(item.index);
      });
      for (const color in colorGroups) {
        const cGroup = colorGroups[color];
        if (!cGroup) continue;
        if (cGroup.length >= 3) {
          this.recordCombo("flush");
          this.state.mode = MODES.DISCARD;
          return this.setDiscardRequirement(
            cGroup.slice(0, 3),
            UI_STRINGS.COMBO_FLUSH,
          );
        }
      }
    }

    // 3. Pair Check (2 cards of same rank)
    const counts: Record<string, number[]> = {};
    activeHand.forEach((item) => {
      const r = String(item.card.rank);
      if (!counts[r]) counts[r] = [];
      counts[r].push(item.index);
    });
    for (const rank in counts) {
      const pGroup = counts[rank];
      if (!pGroup) continue;
      if (pGroup.length >= 2) {
        this.recordCombo("pair");
        this.state.mode = MODES.DISCARD;
        return this.setDiscardRequirement(
          pGroup.slice(0, 2),
          UI_STRINGS.COMBO_PAIR,
        );
      }
    }

    this.checkElimination(player);
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Physical Card Operations
  // ─────────────────────────────────────────────────────────────────────────

  executePhysicalDiscard(cardIndex: number): Card | null {
    const player = this.players[this.currentPlayerIndex];
    if (!player) return null;
    const card = player.hand[cardIndex];

    if (!card) return null;

    SoundManager.play("flip");

    // 1. Physically remove card from hand
    player.hand[cardIndex] = null;

    // 2. Commit to Discard Registry (Bakes _strewn metadata and sets upCard)
    Actions.commitToDiscard(this, card);

    return card;
  }

  processDiscard(cardIndex: number): Card | null {
    const player = this.players[this.currentPlayerIndex];
    if (!player) return null;
    const isWildcard = this.state.mustDiscard.includes(-1);
    const isRequiredIndex = this.state.mustDiscard.includes(cardIndex);

    if (!isRequiredIndex && !isWildcard) return null;

    const discardedCard = this.executePhysicalDiscard(cardIndex);
    if (!discardedCard) return null;

    // 1. Update Discard Requirements
    if (isWildcard) {
      const idx = this.state.mustDiscard.indexOf(-1);
      this.state.mustDiscard.splice(idx, 1);
    } else {
      this.state.mustDiscard = this.state.mustDiscard.filter((idx) => idx !== cardIndex);
    }

    // --- COMBO FINISHED ---
    if (this.state.mustDiscard.length === 0) {
      // THE FIX: Maintain MODES.DISCARD and the current lastResult (the Combo Message)
      // This prevents the banner from flickering to "PLAYER 1" or "NORMAL"
      // during the Director's POST_TURN sleep.

      if (discardedCard.rank === 4) {
        this.state.pendingSabotage = true;
      }

      this.checkElimination(player);
      // Mode reset is now deferred until the next player's syncGameState()
    }

    return discardedCard;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Elimination & Game Over
  // ─────────────────────────────────────────────────────────────────────────

  checkElimination(player: Player): boolean {
    const activeCards = player.hand.filter((c) => c !== null).length;

    if (activeCards >= 4) {
      player.isEliminated = true;

      // --- FIXED: LOG RAW MODE KEY FOR PERMANENT RECORDS ---
      const rawCause = this.state.mode || "NORMAL";
      this.gameStats.eliminationCauses[rawCause] =
        (this.gameStats.eliminationCauses[rawCause] || 0) + 1;

      if (!this.gameStats.eliminationSequence) this.gameStats.eliminationSequence = [];
      if (!this.gameStats.eliminationSequence.includes(player.name)) {
        this.gameStats.eliminationSequence.push(player.name);
      }

      // Keep the "Friendly Name" for the UI Player Table
      player.eliminationData = {
        outOrder: this.gameStats.eliminationSequence.length,
        cause: ELIMINATION_CAUSES[rawCause] || rawCause,
        finalHand: [...player.hand.filter((c): c is Card => c !== null)],
        round: this.gameStats.totalRounds,
      };

      const survivors = this.players.filter((p) => !p.isEliminated);

      if (survivors.length <= 1) {
        this.gameOver = true;
        this.state.gameOver = true;
        this.state.winner = survivors.length === 1 ? survivors[0] : null;

        if (
          this.state.winner &&
          !this.gameStats.eliminationSequence.includes(this.state.winner.name)
        ) {
          this.gameStats.eliminationSequence.push(this.state.winner.name);
        }
      }
      return true;
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Turn Rotation
  // ─────────────────────────────────────────────────────────────────────────

  nextTurn(): void {
    const { state, players } = this;

    state.bountyProcessed = false;
    state.socialResolved = false;

    // --- RESET SPECIALIST PROCESSED FLAG ---
    // This allows a new Ace (or 7) that appears on a subsequent turn to correctly
    // increment its total counter once. Without this, the lock never clears.
    state.specialistProcessed = false;

    // 1. SOCIAL ROUND RESOLUTION
    // Round ends on a correct guess (handled in applyResult clearing socialActive).
    // If still active, normal clockwise rotation below will move to the next player.
    if (!state.socialActive || state.mode === MODES.TRIPLE) {
      state.streakCount = 0;
    }

    // 2. UNIFIED TURN ROTATION
    let nextIdx = (this.currentPlayerIndex + 1) % players.length;
    let nextPlayer = players[nextIdx];
    while (nextPlayer && nextPlayer.isEliminated) {
      nextIdx = (nextIdx + 1) % players.length;
      nextPlayer = players[nextIdx];
    }

    this.currentPlayerIndex = nextIdx;
    this.syncGameState();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // State Reset
  // ─────────────────────────────────────────────────────────────────────────

  resetState(): void {
    // 1. Core Mode Reset
    this.state.mode = MODES.NORMAL;
    this.state.winner = null;
    this.state.gameOver = false;
    this.state.bountyWinningCard = null;

    // 2. Queen Social Purge
    this.state.socialActive = false;
    this.state.socialResolved = false;
    this.state.socialRoundCount = 0;
    this.state.currentRoundGuessCount = 0;

    // 3. Specialist Progress Purge
    this.state.streakCount = 0;
    this.state.pendingSabotage = false;
    this.state.bountyProcessed = false;
    this.state.specialistProcessed = false; // Allow fresh ace/7 counting after reset

    console.log("♻️ State Reset: All specialist contexts cleared.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Win Probability Calculator
// ─────────────────────────────────────────────────────────────────────────────

export const calculateWinProbability = (game: IGameEngine): number => {
  const { state, players, currentPlayerIndex, upCard } = game;
  const mode = state.mode;

  // 1. SABOTAGE (Hand-played 4)
  // If the mode is explicitly SABOTAGE, it's a forced suit guess (High Danger)
  if (mode === MODES.SABOTAGE) {
    return 0.1; // Results in 9 DM
  }

  // 2. QUEEN SOCIAL (Color guess, 1-in-4 chance)
  if (mode === MODES.QUEEN_SOCIAL) {
    return 0.25;
  }

  // 3. KING BOUNTY (Existing Logic)
  if (mode === MODES.KING_BOUNTY) {
    if (state.bountyStatus === "DECLINED") return 0.9;
    const activePlayer = players[currentPlayerIndex];
    if (!activePlayer) return 0.5;
    const handCount = activePlayer.hand.filter((c) => c !== null).length;

    if (handCount >= 3) return 0.0;
    if (handCount === 2) return 0.2;
    return 0.3;
  }

  // 4. TRIPLE (Existing Logic)
  if (mode === MODES.TRIPLE) {
    const r = upCard ? upCard.rank : 8;
    const pStep = (rank: number): number => {
      if (rank === 1) return 12 / 13;
      return Math.max((13 - rank) / 13, (rank - 1) / 13);
    };
    const baseProb = pStep(r);
    const streakPenalty = (state.streakCount || 0) * 0.15;
    return Math.max(0.05, baseProb - streakPenalty);
  }

  // 5. STANDARD / NATURAL 4s
  // If we get here, it's a standard Higher/Lower guess.
  if (!upCard) return 0.5;
  const r = upCard.rank;

  // A natural 4 (rank 4) usually has a high win prob (Higher is likely)
  // To get a DM of 4, we need a win probability of 0.6.
  if (r === 4) return 0.6;

  // General Higher/Lower probability
  return Math.max((13 - r) / 13, (r - 1) / 13);
};