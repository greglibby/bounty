import { MODES, UI_STRINGS } from "../constants.js";
import { Actions } from "../core/Actions.js";

export const LuckySeven = {
  canHandle(state) {
    return state.mode === MODES.LUCKY_7;
  },

  resolve(game, guess) {
    // 1. DRAW PHASE
    // Uses the centralized Actions.draw to handle mid-game reshuffling
    const flipped = Actions.draw(game);
    if (!flipped) return null;

    const upCard = game.upCard;
    const normalizedGuess = (guess || "").toLowerCase();

    // 2. TIE CHECK: Flipped card becomes new Up Card, player guesses again
    if (flipped.rank === upCard.rank) {
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
      (normalizedGuess === "higher" && flipped.rank > upCard.rank) ||
      (normalizedGuess === "lower" && flipped.rank < upCard.rank);

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
