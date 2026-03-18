import { GameMode, UI_STRINGS } from '../types/constants';
import { GameState, TurnResult, Specialist, EngineContext } from '../types/engine';
import { Actions } from '../core/Actions';

// ─────────────────────────────────────────────────────────
// LUCKY 7 IMPLEMENTATION
// ─────────────────────────────────────────────────────────

export const LuckySeven: Specialist = {
  canHandle(state: GameState): boolean {
    return state.mode === GameMode.Lucky7; // Strictly typed mode check
  },

  resolve(game: EngineContext, guess?: string | number): TurnResult | null {
    // 1. Type Guard: Ensure upCard exists before we attempt to compare ranks
    const upCard = game.upCard;
    if (!upCard) return null;

    // 2. DRAW PHASE
    // Uses the centralized Actions.draw to handle mid-game reshuffling
    const flipped = Actions.draw(game);
    if (!flipped) return null;

    const normalizedGuess = String(guess || "").toLowerCase();

    // 3. TIE CHECK: Flipped card becomes new Up Card, player guesses again
    if (flipped.rank === upCard.rank) {
      return {
        type: "TIE_REGUESS",
        success: true,
        flipped,
        message: UI_STRINGS["RESULT_TIE"],
        endTurn: false,
      };
    }

    // 4. GUESS RESOLUTION
    const success =
      (normalizedGuess === "higher" && flipped.rank > upCard.rank) ||
      (normalizedGuess === "lower" && flipped.rank < upCard.rank);

    // 5. STRICT RETURN PAYLOAD
    return {
      type: success ? "LUCKY_7_SUCCESS" : "LUCKY_7_FAIL",
      success,
      flipped,
      message: success
        ? UI_STRINGS["LUCKY_7_SUCCESS"]
        : UI_STRINGS["RESULT_INCORRECT"],
      endTurn: true, // Turn always ends after a Lucky 7 guess
    };
  },
};