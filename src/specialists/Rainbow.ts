import { GameMode, UI_STRINGS } from '../types/constants';
import { GameState, TurnResult, EngineContext, Specialist } from '../types/engine';
import { Actions } from '../core/Actions';

// ─────────────────────────────────────────────────────────
// RAINBOW ROUND IMPLEMENTATION
// ─────────────────────────────────────────────────────────

export const Rainbow: Specialist = {
  canHandle(state: GameState): boolean {
    return state.mode === GameMode.QueenSocial;
  },

  resolve(game: EngineContext, choice?: string | number): TurnResult | null {
    const state = game.state;
    
    // 1. Execute Draw
    const flipped = Actions.draw(game);
    if (!flipped) return null;

    // 2. Increment round counters safely using new Rainbow terminology
    state.rainbowRoundCount++;
    state.currentRoundGuessCount++;

    game.recordSpecialistStat("queen", "color_guess");

    // 3. Strict casing normalization (Only colors remain in the game)
    const safeChoice = String(choice || "").toLowerCase();
    const isCorrect = flipped.color.toLowerCase() === safeChoice;

    // 4. SUCCESS RESOLUTION
    if (isCorrect) {
      game.recordSpecialistStat("queen", "color_success");

      // Record the length of this completed round safely
      if (!game.gameStats.specialists.queen.roundLengths) {
        game.gameStats.specialists.queen.roundLengths = [];
      }
      game.gameStats.specialists.queen.roundLengths.push(
        state.currentRoundGuessCount
      );

      // Clear round tracking and force state out of Rainbow mode
      // to ensure the next player is clean
      state.rainbowActive = false;
      state.rainbowResolved = true;
      state.currentRoundGuessCount = 0;
      state.mode = GameMode.Normal; 

      return {
        success: true,
        type: "RAINBOW_SUCCESS",
        flipped,
        message: UI_STRINGS["RESULT_CORRECT"],
        endTurn: true,
      };
    }

    // 5. FAIL RESOLUTION
    return {
      success: false,
      type: "RAINBOW_FAIL",
      flipped,
      message: UI_STRINGS["RAINBOW_FAIL"] || UI_STRINGS["RESULT_INCORRECT"],
      endTurn: true,
    };
  },
};