import { MODES, UI_STRINGS } from "../constants.js";
import { Actions } from "../core/Actions.js";
import type { IGameEngine, GameState, SpecialistResult } from "../types/index.js";
import type { Specialist } from "./Specialist.js";

export const Rainbow: Specialist = {
  canHandle(state: GameState): boolean {
    return state.mode === MODES.QUEEN_SOCIAL;
  },

  resolve(game: IGameEngine, choice: string | number): SpecialistResult | null {
    const state = game.state;
    const flipped = Actions.draw(game);
    if (!flipped) return null;

    // Increment both counters for this guess attempt
    state.socialRoundCount++;
    state.currentRoundGuessCount++;

    game.recordSpecialistStat("queen", "color_guess");

    // Normalize both to lowercase for a case-insensitive comparison.
    const safeChoice = (choice || "").toString().toLowerCase();
    const isCorrect = flipped.color.toLowerCase() === safeChoice;

    if (isCorrect) {
      game.recordSpecialistStat("queen", "color_success");

      // Record the length of this completed round
      if (!game.gameStats.specialists.queen.roundLengths) {
        game.gameStats.specialists.queen.roundLengths = [];
      }
      game.gameStats.specialists.queen.roundLengths.push(
        state.currentRoundGuessCount,
      );

      // Clear round tracking and force state out of Queen Social to ensure the next player is clean
      state.socialActive = false;
      state.socialResolved = true;
      state.currentRoundGuessCount = 0;
      state.mode = MODES.NORMAL;

      return {
        success: true,
        type: "QUEEN_SOCIAL_SUCCESS",
        flipped,
        message: UI_STRINGS.RESULT_CORRECT,
        endTurn: true,
      };
    }

    return {
      success: false,
      type: "QUEEN_SOCIAL_FAIL",
      flipped,
      message: UI_STRINGS.RESULT_INCORRECT,
      endTurn: true,
    };
  },
};