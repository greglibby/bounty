import { GameMode } from '../types/constants';
import { GameState, TurnResult, BountyFlipStep, Specialist, EngineContext } from '../types/engine';
import { Player, Card } from '../types/entities';
import { Actions } from '../core/Actions';

// ─────────────────────────────────────────────────────────
// KING BOUNTY CHALLENGE IMPLEMENTATION
// ─────────────────────────────────────────────────────────

// We extend the Specialist interface locally to type the helper methods
export interface KingBountySpecialist extends Specialist {
  generateChallengeScript: (game: EngineContext) => TurnResult;
  checkMatch: (player: Player, flippedCard: Card | null) => boolean;
}

export const KingBounty: KingBountySpecialist = {
  canHandle(state: GameState): boolean {
    // The mode is set by Engine.syncGameState based purely on the Up Card being a King
    return state.mode === GameMode.KingBounty;
  },

  resolve(game: EngineContext, choice?: string | number): TurnResult | null {
    // 1. Strict Casing & Normalization
    const safeChoice = String(choice || "").toUpperCase();

    // 2. Decline Routing
    if (safeChoice === "DECLINE") {
      // Return null so the Engine's interceptor handles the state swap and stat tracking
      return null;
    }

    // 3. Accept Routing
    if (safeChoice === "ACCEPT") {
      return this.generateChallengeScript(game);
    }

    return null;
  },

  /**
   * Pre-calculates the entire draw sequence for the cinematic Director to play out.
   */
  generateChallengeScript(game: EngineContext): TurnResult {
    const player = game.players[game.currentPlayerIndex];
    
    // Type Guard: filter out nulls and tell TS this is strictly an array of Cards
    const activeHand = player.hand.filter((c): c is Card => c !== null);
    
    const sequence: BountyFlipStep[] = [];
    let matchFound = false;

    // Draw up to the number of cards currently in the player's hand
    for (let i = 0; i < activeHand.length; i++) {
      const flipped = Actions.draw(game);
      if (!flipped) break; // Deck empty fallback

      const isMatch = activeHand.some((c: Card) => c.rank === flipped.rank);
      sequence.push({ card: flipped, isMatch });

      if (isMatch) {
        matchFound = true;
        break; // Stop drawing once a match is hit
      }
    }

    // Strict Return Payload matching TurnResult interface
    return {
      success: matchFound, // Maps to the success property
      type: "ACCEPT_START",
      flipped: null, // The actual flipped cards are contained in the sequence array
      message: "BOUNTY_ACCEPTED", // Director will translate this to UI_STRINGS
      sequence: sequence, // Required for the Director's GSAP loop
      endTurn: true,
    };
  },

  /**
   * Helper to verify if a single flipped card matches anything in the player's hand.
   */
  checkMatch(player: Player, flippedCard: Card | null): boolean {
    if (!flippedCard) return false;
    return player.hand.some((c: Card | null) => c !== null && c.rank === flippedCard.rank);
  },
};