import { MODES } from "../constants.js";
import { Actions } from "../core/Actions.js";
import type { IGameEngine, Player, Card, GameState, SpecialistResult } from "../types/index.js";
import type { Specialist } from "./Specialist.js";

interface BountySequenceStep {
  card: Card;
  isMatch: boolean;
}

interface ChallengeScript {
  type: "ACCEPT_START";
  sequence: BountySequenceStep[];
  matchFound: boolean;
  endTurn: true;
}

export const KingBounty: Omit<Specialist, "execute"> & {
  generateChallengeScript(game: IGameEngine): ChallengeScript;
  checkMatch(player: Player, flippedCard: Card | null): boolean;
} = {
  canHandle(state: GameState): boolean {
    // The mode is set by Engine.syncGameState based purely on the Up Card being a King
    return state.mode === MODES.KING_BOUNTY;
  },

  resolve(game: IGameEngine, choice: string | number): SpecialistResult | null {
    const safeChoice = choice || "";

    if (safeChoice === "DECLINE") {
      // Return null so the Engine's interceptor handles the state swap
      return null;
    }

    if (safeChoice === "ACCEPT") {
      return this.generateChallengeScript(game) as unknown as SpecialistResult;
    }

    return null;
  },

  generateChallengeScript(game: IGameEngine): ChallengeScript {
    const player = game.players[game.currentPlayerIndex];
    if (!player) {
      return { type: "ACCEPT_START", sequence: [], matchFound: false, endTurn: true };
    }

    const activeHand = player.hand.filter((c): c is Card => c !== null);
    const sequence: BountySequenceStep[] = [];
    let matchFound = false;

    for (let i = 0; i < activeHand.length; i++) {
      const flipped = Actions.draw(game);
      if (!flipped) break;

      const isMatch = activeHand.some((c) => c.rank === flipped.rank);
      sequence.push({ card: flipped, isMatch });

      if (isMatch) {
        matchFound = true;
        break;
      }
    }

    return {
      type: "ACCEPT_START",
      sequence: sequence,
      matchFound: matchFound,
      endTurn: true,
    };
  },

  checkMatch(player: Player, flippedCard: Card | null): boolean {
    if (!flippedCard) return false;
    return player.hand.some((c) => c !== null && c.rank === flippedCard.rank);
  },
};