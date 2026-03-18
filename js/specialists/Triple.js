import { MODES, UI_STRINGS } from "../constants.js";
import { Actions } from "../core/Actions.js";

export const Triple = {
  canHandle(state) {
    return state.mode === MODES.TRIPLE;
  },

  resolve(game, choice) {
    const flipped = Actions.draw(game);
    if (!flipped) return null;

    const upRank = game.upCard.rank;
    const isHigher = choice === "higher";
    const isCorrect =
      (isHigher && flipped.rank > upRank) ||
      (!isHigher && flipped.rank < upRank);

    if (flipped.rank === upRank) {
      return {
        success: true,
        type: "TIE_REGUESS",
        flipped,
        message: UI_STRINGS.RESULT_TIE,
        endTurn: false,
      };
    }

    if (!isCorrect) {
      return {
        success: false,
        type: "TRIPLE_FAIL",
        flipped,
        message: UI_STRINGS.RESULT_INCORRECT,
        endTurn: true,
      };
    }

    game.state.streakCount++;

    if (game.state.streakCount >= 3) {
      return {
        success: true,
        type: "TRIPLE_COMPLETE",
        flipped,
        message: UI_STRINGS.TRIPLE_SUCCESS,
        endTurn: true,
      };
    }

    const remaining = 3 - game.state.streakCount;
    const progressMsg =
      remaining === 2 ? UI_STRINGS.STREAK_NEEDS_2 : UI_STRINGS.STREAK_NEEDS_1;

    return {
      success: true,
      type: "TRIPLE_PROGRESS",
      flipped,
      message: `CORRECT! ${progressMsg}`,
      endTurn: false,
    };
  },
};