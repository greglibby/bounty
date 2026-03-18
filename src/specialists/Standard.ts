import { GameMode, UI_STRINGS } from '../types/constants';
import { GameState, TurnResult } from '../types/engine';
import { Actions, GameContext } from '../core/Actions';

// ─────────────────────────────────────────────────────────
// SPECIALIST CONTRACT (Move to types/engine.ts later)
// ─────────────────────────────────────────────────────────
export interface Specialist {
  canHandle: (state: GameState) => boolean;
  resolve: (game: GameContext, guess?: string | number) => TurnResult | null;
}

// ─────────────────────────────────────────────────────────
// STANDARD GUESS IMPLEMENTATION
// ─────────────────────────────────────────────────────────
export const Standard: Specialist = {
  canHandle(state: GameState): boolean {
    return state.mode === GameMode.Normal; // Strictly typed check
  },

  resolve(game: GameContext, guess?: string | number): TurnResult | null {
    // 1. Type Guard: Ensure we actually have an upCard to compare against
    const upCard = game.upCard;
    if (!upCard) return null;

    // 2. Execute Draw
    const flipped = Actions.draw(game);
    if (!flipped) return null;

    // Normalize guess, handling potential undefined/number values safely
    const normalizedGuess = String(guess || "").toLowerCase();

    // 3. TIE HANDLING: Flipped card becomes new Up Card, player guesses again
    if (flipped.rank === upCard.rank) {
      return {
        type: "TIE_REGUESS",
        success: true,
        flipped,
        message: UI_STRINGS["RESULT_TIE"],
        endTurn: false,
      };
    }

    // 4. STANDARD RESOLUTION
    let success = false;
    if (normalizedGuess === "higher") {
      success = flipped.rank > upCard.rank;
    } else if (normalizedGuess === "lower") {
      success = flipped.rank < upCard.rank;
    }

    // 5. Strict Return Payload matching TurnResult interface
    return {
      type: "RESOLVE",
      success: success,
      flipped,
      message: success 
        ? UI_STRINGS["RESULT_CORRECT"] 
        : UI_STRINGS["RESULT_INCORRECT"],
      endTurn: true,
    };
  },
};