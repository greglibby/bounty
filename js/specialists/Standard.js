import { MODES, UI_STRINGS } from "../constants.js";
import { Actions } from "../core/Actions.js";

export const Standard = {
  canHandle(state) {
    return state.mode === MODES.NORMAL;
  },

  resolve(game, guess) {
    const flipped = Actions.draw(game);
    if (!flipped) return null;

    const upCard = game.upCard;
    const normalizedGuess = (guess || "").toLowerCase();

    // 1. TIE HANDLING: Flipped card becomes new Up Card, player guesses again
    if (flipped.rank === upCard.rank) {
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
    if (normalizedGuess === "higher") success = flipped.rank > upCard.rank;
    if (normalizedGuess === "lower") success = flipped.rank < upCard.rank;

    return {
      type: "RESOLVE",
      success: success,
      flipped,
      message: success
        ? UI_STRINGS.RESULT_CORRECT
        : UI_STRINGS.RESULT_INCORRECT,
      endTurn: true,
    };
  },
};
