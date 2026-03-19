// =============================================================================
// BOUNTY — Standard Specialist
// src/specialists/Standard.ts
// =============================================================================

import { MODES, UI_STRINGS } from "../constants.js";
import { Actions } from "../core/Actions.js";
import type { Specialist } from "./Specialist.js";

export const Standard: Specialist = {
  canHandle(state) {
    return state.mode === MODES.NORMAL;
  },

  resolve(game, guess) {
    const flipped = Actions.draw(game);
    if (!flipped) return null;

    const upCard = game.upCard;

    // NOTE (pre-existing): upCard is theoretically Card | null, but syncGameState
    // guarantees it is non-null before any guess is processed. The non-null
    // assertion below preserves the original behaviour without a logic change.
    const upCardRank = upCard!.rank;

    // String(guess) coerces the `string | number` union so .toLowerCase() is
    // safe. In practice guess is always "higher" | "lower" for Standard mode.
    const normalizedGuess = String(guess || "").toLowerCase();

    // 1. TIE HANDLING: Flipped card becomes new Up Card, player guesses again
    if (flipped.rank === upCardRank) {
      return {
        type: "TIE_REGUESS",
        success: true,
        flipped,
        message: UI_STRINGS.RESULT_TIE,
        endTurn: false,
      };
    }

    // 2. STANDARD RESOLUTION
    let success = false;
    if (normalizedGuess === "higher") success = flipped.rank > upCardRank;
    if (normalizedGuess === "lower")  success = flipped.rank < upCardRank;

    return {
      type: "RESOLVE",
      success,
      flipped,
      message: success
        ? UI_STRINGS.RESULT_CORRECT
        : UI_STRINGS.RESULT_INCORRECT,
      endTurn: true,
    };
  },
};