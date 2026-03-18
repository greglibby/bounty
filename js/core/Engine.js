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

export class BountyEngine {
  constructor(playerName = "PLAYER 1") {
    // Ensure the human player (Index 0) uses the captured name
    const names = [playerName, "Charlie", "David", "Emma"];
    this.players = names.map((name) => ({
      name: name,
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
        queen: {
          total: 0,
          colorTotal: 0,
          colorSuccess: 0,
          roundLengths: [],
        },
        bounty: { total: 0, accepted: 0, instantWins: 0 },
        sabotage: { total: 0, victimsFailed: 0, success: 0 },
        shield: { total: 0 },
      },
      combos: { pair: 0, straight: 0, flush: 0 },
    };

    this.state = {
      mode: MODES.NORMAL,
      socialTheme: null,
      socialRoundCount: 0,
      socialOriginator: -1,
      socialActive: false,
      socialResolved: false,
      currentRoundGuessCount: 0,
      lastResult: "",
      isCeremony: false,
      mustDiscard: [],
      streakCount: 0,
      turnCount: 1,
      roundCount: 1,
      pendingSabotage: false,
      bountyProcessed: false,
    };

    this.specialists = [
      Triple,
      LuckySeven,
      Rainbow,
      Standard,
      JackShield,
      Sabotage,
      KingBounty,
    ];

    // Populate the deck using color + rank
    const colors = DECK_CONFIG.COLORS; // ["Yellow", "Red", "Blue", "Green"]
    const min = DECK_CONFIG.MIN_RANK;
    const max = DECK_CONFIG.MAX_RANK;

    for (let c of colors) {
      for (let r = min; r <= max; r++) {
        this.deck.push({ color: c, rank: r });
      }
    }

    // Now shuffle the full 52-card deck
    Actions.shuffle(this.deck);
  }

  getSpecialistClass(rank) {
    const mapping = {
      3: "triple-card",
      4: "sabotage-card",
      7: "lucky-7-card",
      11: "shield-card",
      12: "queen-card",
      13: "king-card",
    };
    return mapping[rank] || null;
  }

  get canAcceptInput() {
    if (this.state.gameOver || this.state.isCeremony) return false;

    const currentPlayer = this.players[this.currentPlayerIndex];
    return currentPlayer && this.currentPlayerIndex === 0;
  }

  recordSpecialistStat(type, result) {
    // 0. TIE HANDLING: New stat for discards resulting from rank ties
    if (type === "tie") {
      if (result === "discard") {
        this.gameStats.tiesWithDiscard =
          (this.gameStats.tiesWithDiscard || 0) + 1;
      }
      return;
    }

    const stats = this.gameStats.specialists;
    const s = stats[type];
    if (!s) return;

    // 1. DENOMINATOR (TOTAL) HANDLING:
    // Ensure "trigger" only increments total once.
    // Ace and Lucky 7 will use this to lock the attempt.
    if (result === "trigger") {
      s.total++;
      return;
    }

    // 2. QUEEN HANDLING: Color guess accuracy only
    if (type === "queen") {
      if (result === "color_guess") {
        s.colorTotal++;
      } else if (result === "color_success") {
        s.colorSuccess++;
      }
      return;
    }

    // 3. BOUNTY HANDLING
    else if (type === "bounty") {
      if (result === "accepted") {
        s.accepted++;
      } else if (result === "win") {
        s.instantWins++;
      }
    }

    // 4. SABOTAGE HANDLING
    else if (type === "sabotage") {
      if (result === "fail") s.victimsFailed++;
      else if (result === "success") s.success++;
    }

    // 5. STREAK & LUCKY 7 SUCCESS HANDLING
    // Note: Denominators for these are now handled exclusively by the "trigger" result
    // called in syncGameState when streakCount === 0 or !specialistProcessed.
    else if (type === "ace" || type === "lucky7") {
      if (result === "success") {
        s.success++;
      }
    }

    // Fallback for any other specialists (Shield, etc.)
    else {
      if (result === "success") s.success++;
    }
  }

  recordTieDiscard() {
    this.gameStats.tiesWithDiscard++;
  }

  recordCombo(type) {
    const key = type.toLowerCase();
    if (this.gameStats.combos.hasOwnProperty(key)) {
      this.gameStats.combos[key]++;
    }
  }

  setDiscardRequirement(indices, message) {
    this.state.mustDiscard = indices;
    this.state.lastResult = message;
    this.state.streakCount = 0;
    return true;
  }

  startCeremony() {
    this.state.mode = MODES.CEREMONY;
    this.state.isCeremony = true;
    this.currentPlayerIndex = -1;
    this.players.forEach((p) => (p.hand = []));
  }

  drawCeremonyCard(playerIdx) {
    const card = Actions.draw(this);
    if (!card) {
      console.error(
        `CRITICAL: Ceremony draw failed for player ${playerIdx}. Deck empty?`,
      );
      return;
    }
    // Ensure the card is assigned to the ceremonyCard property
    this.players[playerIdx].ceremonyCard = card;
    // Also put it in the hand so the View can render it
    this.players[playerIdx].hand = [card];
  }

  evaluateCeremonyRound(playerIndices) {
    let minRank = 14; // Higher than any possible card (King is 13)

    // 1. Find the actual minimum rank among valid cards
    playerIndices.forEach((idx) => {
      const card = this.players[idx].ceremonyCard;
      // Safety Guard: Only check rank if the card exists
      if (card && card.rank < minRank) {
        minRank = card.rank;
      }
    });

    // 2. Filter survivors who match that minimum rank
    const survivors = playerIndices.filter((idx) => {
      const card = this.players[idx].ceremonyCard;
      return card && card.rank === minRank;
    });

    return { survivors, isTie: survivors.length > 1 };
  }

  finalizeCeremony(winnerIdx) {
    this.currentPlayerIndex = winnerIdx;
  }

  endCeremony() {
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

  processGuess(choice) {
    // 1. Check if the choice is a slot index (Hand Action - Jack or 4)
    if (typeof choice === "number") {
      const player = this.players[this.currentPlayerIndex];
      const card = player.hand[choice];

      // PRIORITIZE HAND ACTIONS: Jacks and 4s break out of any mode (Social, Bounty, etc.)
      if (card && card.rank === 4) {
        return Sabotage.execute(this, choice);
      }
      if (card && card.rank === 11) {
        return JackShield.execute(this, choice);
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
      [
        "Yellow",
        "Red",
        "Blue",
        "Green",
        "yellow",
        "red",
        "blue",
        "green",
      ].includes(choice)
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

  applyResult(result) {
    const player = this.players[this.currentPlayerIndex];

    // --- FIX: Capture the target rank BEFORE the upCard is updated ---
    // This ensures we record the stat against the card being guessed ON, not the new flip.
    const targetRank = this.upCard ? this.upCard.rank : null;

    // 1. Update visual feedback
    this.state.lastResult = result.message;

    if (result.flipped) {
      // FIX: Ties must now be committed to the registry, not added to hands.
      if (result.success || result.type === "TIE" || result.type === "TIE_REGUESS") {
        // Physical table update: Flipped card routes through Commit Gate
        Actions.commitToDiscard(this, result.flipped);

        // Lucky 7 correct guess reward only
        if (
          result.type === "LUCKY_7_SUCCESS" &&
          player.hand.some((c) => c !== null)
        ) {
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
    const accuracyModes = [MODES.NORMAL, MODES.TRIPLE, MODES.LUCKY_7];
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
        };
      }

      const stats = this.gameStats.rankAccuracy[r];
      stats.total++; // Increment denominator first

      // Strict Check: TIE_REGUESS is prioritized so it cannot be counted as Correct
      if (result.type === "TIE_REGUESS") {
        stats.ties++;
      } else if (result.success === true) {
        // Only actual Higher/Lower wins recorded here
        stats.correct++;
      } else {
        // Only actual misses recorded here
        stats.incorrect++;
      }

      console.log(
        `📊 Engine Rank Accuracy: Rank ${r} | Correct: ${stats.correct} | Incorrect: ${stats.incorrect} | Tie: ${stats.ties}`,
      );
    }
  }

  handlePostGuessRewards(result, player) {
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

  syncGameState() {
    // FIX: Define state at the top of the function so it is available to all blocks
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

  setDiscardRequirement(indices, message) {
    this.state.mustDiscard = indices;
    this.state.lastResult = message;
    this.state.streakCount = 0;
    return true;
  }

  checkCombos(player) {
    if (player.isEliminated) return false;

    const activeHand = player.hand
      .map((card, index) => ({ card, index }))
      .filter((item) => item.card !== null);

    if (activeHand.length < 2) {
      this.checkElimination(player);
      return false;
    }

    // 1. Straight Check (3 cards in sequence)
    if (activeHand.length >= 3) {
      const sorted = [...activeHand].sort((a, b) => a.card.rank - b.card.rank);
      for (let i = 0; i <= sorted.length - 1; i++) {
        const first = sorted[i];
        const second = sorted.find(
          (item) => item.card.rank === first.card.rank + 1,
        );
        const third = sorted.find(
          (item) => item.card.rank === first.card.rank + 2,
        );
        if (second && third) {
          this.recordCombo("straight"); // Record stat
          this.state.mode = MODES.DISCARD; // Explicitly set mode
          return this.setDiscardRequirement(
            [first.index, second.index, third.index],
            UI_STRINGS.COMBO_STRAIGHT,
          );
        }
      }
    }

    // 2. Flush Check (3 cards of same color)
    if (activeHand.length >= 3) {
      const colorGroups = {};
      activeHand.forEach((item) => {
        const c = item.card.color;
        if (!colorGroups[c]) colorGroups[c] = [];
        colorGroups[c].push(item.index);
      });
      for (let color in colorGroups) {
        if (colorGroups[color].length >= 3) {
          this.recordCombo("flush"); // Record stat
          this.state.mode = MODES.DISCARD; // Explicitly set mode
          return this.setDiscardRequirement(
            colorGroups[color].slice(0, 3),
            UI_STRINGS.COMBO_FLUSH,
          );
        }
      }
    }

    // 3. Pair Check (2 cards of same rank)
    const counts = {};
    activeHand.forEach((item) => {
      const r = item.card.rank;
      if (!counts[r]) counts[r] = [];
      counts[r].push(item.index);
    });
    for (let rank in counts) {
      if (counts[rank].length >= 2) {
        this.recordCombo("pair"); // Record stat
        this.state.mode = MODES.DISCARD; // Explicitly set mode
        return this.setDiscardRequirement(
          counts[rank].slice(0, 2),
          UI_STRINGS.COMBO_PAIR,
        );
      }
    }

    this.checkElimination(player);
    return false;
  }

 executePhysicalDiscard(cardIndex) {
    const player = this.players[this.currentPlayerIndex];
    const card = player.hand[cardIndex];

    if (!card) return null;

    SoundManager.play("flip");

    // 1. Physically remove card from hand
    player.hand[cardIndex] = null;

    // 2. Commit to Discard Registry (Bakes _strewn metadata and sets upCard)
    Actions.commitToDiscard(this, card);

    return card;
  }

  processDiscard(cardIndex) {
    const player = this.players[this.currentPlayerIndex];
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
      this.state.mustDiscard = this.state.mustDiscard.filter(
        (idx) => idx !== cardIndex,
      );
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

  checkElimination(player) {
    const activeCards = player.hand.filter((c) => c !== null).length;

    if (activeCards >= 4) {
      player.isEliminated = true;

      // --- FIXED: LOG RAW MODE KEY FOR PERMANENT RECORDS ---
      // We use the raw this.state.mode (e.g., "NORMAL") so RecordManager can find the match.
      const rawCause = this.state.mode || "NORMAL";
      this.gameStats.eliminationCauses[rawCause] =
        (this.gameStats.eliminationCauses[rawCause] || 0) + 1;

      if (!this.gameStats.eliminationSequence)
        this.gameStats.eliminationSequence = [];
      if (!this.gameStats.eliminationSequence.includes(player.name)) {
        this.gameStats.eliminationSequence.push(player.name);
      }

      // Keep the "Friendly Name" for the UI Player Table
      player.eliminationData = {
        outOrder: this.gameStats.eliminationSequence.length,
        cause: ELIMINATION_CAUSES[rawCause] || rawCause,
        finalHand: [...player.hand.filter((c) => c !== null)],
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

  nextTurn() {
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
    while (players[nextIdx] && players[nextIdx].isEliminated) {
      nextIdx = (nextIdx + 1) % players.length;
    }

    this.currentPlayerIndex = nextIdx;
    this.syncGameState();
  }

  resetState() {
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

export const calculateWinProbability = (game) => {
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
    const handCount = activePlayer.hand.filter((c) => c !== null).length;
    if (handCount >= 3) return 0.0;
    if (handCount === 2) return 0.2;
    return 0.3;
  }

  // 4. TRIPLE (Existing Logic)
  if (mode === MODES.TRIPLE) {
    const r = upCard ? upCard.rank : 8;
    const pStep = (rank) => {
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
