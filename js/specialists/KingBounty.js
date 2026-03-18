import { MODES, RANKS } from "../constants.js";
import { Actions } from "../core/Actions.js";

export const KingBounty = {
  canHandle(state) {
    // The mode is set by Engine.syncGameState based purely on the Up Card being a King
    return state.mode === MODES.KING_BOUNTY;
  },

  resolve(game, choice) {
    const safeChoice = choice || "";

    if (safeChoice === "DECLINE") {
      // Return null so the Engine's interceptor handles the state swap
      return null;
    }

    if (safeChoice === "ACCEPT") {
      return this.generateChallengeScript(game);
    }

    return null;
  },

  generateChallengeScript(game) {
    const player = game.players[game.currentPlayerIndex];
    const activeHand = player.hand.filter((c) => c !== null);
    const sequence = [];
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

  checkMatch(player, flippedCard) {
    if (!flippedCard) return false;
    return player.hand.some((c) => c !== null && c.rank === flippedCard.rank);
  },
};
