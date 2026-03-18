import { GameMode, UI_STRINGS } from '../types/constants';
import { GameState, TurnResult, EngineContext, Specialist } from '../types/engine';
import { Actions } from '../core/Actions';

// ─────────────────────────────────────────────────────────
// TRIPLE STREAK IMPLEMENTATION
// ─────────────────────────────────────────────────────────
export const Triple: Specialist = {
  canHandle(state: GameState): boolean {
    return state.mode === GameMode.Triple; 
  },

  resolve(game: EngineContext, choice?: string | number): TurnResult | null {
    // 1. Execute Draw
    const flipped = Actions.draw(game);
    if (!flipped) return null;

    // 2. Type Guard: Ensure upCard exists before comparing
    const upCard = game.upCard;
    if (!upCard) return null;

    const upRank = upCard.rank;
    const normalizedChoice = String(choice || "").toLowerCase();
    const isHigher = normalizedChoice === "higher";

    // 3. TIE HANDLING: Ties do not break or advance the streak
    if (flipped.rank === upRank) {
      return {
        success: true,
        type: "TIE_REGUESS",
        flipped,
        message: UI_STRINGS["RESULT_TIE"],
        endTurn: false,
      };
    }

    // 4. RESOLUTION LOGIC
    const isCorrect =
      (isHigher && flipped.rank > upRank) ||
      (!isHigher && flipped.rank < upRank);

    // 5. FAILURE CONDITION: Streak broken
    if (!isCorrect) {
      return {
        success: false,
        type: "TRIPLE_FAIL",
        flipped,
        message: UI_STRINGS["RESULT_INCORRECT"],
        endTurn: true,
      };
    }

    // 6. SUCCESS CONDITION: Mutate state and check streak progress
    game.state.streakCount++;

    if (game.state.streakCount >= 3) {
      return {
        success: true,
        type: "TRIPLE_COMPLETE",
        flipped,
        message: UI_STRINGS["TRIPLE_SUCCESS"],
        endTurn: true,
      };
    }

    // 7. PROGRESS CONDITION: Construct dynamic progress message
    const remaining = 3 - game.state.streakCount;
    const progressMsg =
      remaining === 2 
        ? UI_STRINGS["STREAK_NEEDS_2"] 
        : UI_STRINGS["STREAK_NEEDS_1"];

    return {
      success: true,
      type: "TRIPLE_PROGRESS",
      flipped,
      message: `CORRECT! ${progressMsg}`,
      endTurn: false, 
    };
  },
};