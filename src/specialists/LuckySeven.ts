// =============================================================================
// BOUNTY — Lucky Seven Specialist
// src/specialists/LuckySeven.ts
// =============================================================================

import { MODES, UI_STRINGS } from "../constants.js";
import { Actions } from "../core/Actions.js";
import type { Specialist } from "./Specialist.js";

export const LuckySeven: Specialist = {
  canHandle(state) {
    return state.mode === MODES.LUCKY_7;
  },

  resolve(game, guess) {
    // 1. DRAW PHASE
    // Uses the centralized Actions.draw to handle mid-game reshuffling
    const flipped = Actions.draw(game);
    if (!flipped) return null;

    const upCard = game.upCard;

    // NOTE (pre-existing): upCard is theoretically Card | null, but syncGameState
    // guarantees it is non-null before any guess is processed.
    const upCardRank = upCard!.rank;

    // String(guess) coerces the `string | number` union so .toLowerCase() is
    // safe. In practice guess is always "higher" | "lower" for Lucky 7 mode.
    const normalizedGuess = String(guess || "").toLowerCase();

    // 2. TIE CHECK: Flipped card becomes new Up Card, player guesses again
    if (flipped.rank === upCardRank) {
      return {
        type: "TIE_REGUESS",
        success: true,
        flipped,
        message: UI_STRINGS.RESULT_TIE,
        endTurn: false,
      };
    }

    // 3. GUESS RESOLUTION
    const success =
      (normalizedGuess === "higher" && flipped.rank > upCardRank) ||
      (normalizedGuess === "lower"  && flipped.rank < upCardRank);

    return {
      type: success ? "LUCKY_7_SUCCESS" : "LUCKY_7_FAIL",
      success,
      flipped,
      message: success
        ? UI_STRINGS.LUCKY_7_SUCCESS
        : UI_STRINGS.RESULT_INCORRECT,
      endTurn: true, // Turn always ends after a Lucky 7 guess
    };
  },
};