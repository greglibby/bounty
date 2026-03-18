import { GameMode, UI_STRINGS } from '../types/constants';
import { GameState, TurnResult, EngineContext, Specialist } from '../types/engine';
import { Player } from '../types/entities';
import { Actions } from '../core/Actions';

// ─────────────────────────────────────────────────────────
// JACK SHIELD IMPLEMENTATION & CPU AI
// ─────────────────────────────────────────────────────────

export interface JackShieldSpecialist extends Specialist {
  shouldCPUPlay: (game: EngineContext, player: Player) => number;
}

export const JackShield: JackShieldSpecialist = {
  canHandle(state: GameState): boolean {
    return state.mode === GameMode.Shield;
  },

  // Prefixing variables with an underscore tells TypeScript we know they are unused
  resolve(_game: EngineContext, _choice?: string | number): TurnResult | null {
    return {
      type: "SHIELD_SKIP",
      success: true,
      flipped: null,
      message: UI_STRINGS["SHIELD_MESSAGE"],
      endTurn: true,
    };
  },

  shouldCPUPlay(game: EngineContext, player: Player): number {
    if (!player.hand || player.hand.every((c) => c === null)) return -1;

    const jackIndex = player.hand.findIndex((c) => c && c.rank === 11);
    if (jackIndex === -1) return -1;

    if (game.state.streakCount !== 0) return -1;

    const cardCount = player.hand.filter((c) => c !== null).length;
    const activeOpponents = game.players.filter(
      (p) => !p.isEliminated && p !== player
    );

    if (cardCount >= 3) return jackIndex;

    if (cardCount === 2) {
      const everyoneElseFull = activeOpponents.every(
        (p) => p.hand.filter((c) => c !== null).length >= 3
      );
      return everyoneElseFull ? -1 : jackIndex;
    }

    return -1; 
  },

  execute(game: EngineContext, slotIndex: number): TurnResult | null {
    const player = game.players[game.currentPlayerIndex];
    const jack = player.hand[slotIndex];

    if (!jack || jack.rank !== 11) return null; 

    game.resetState();

    // Changed to rainbow terminology!
    game.state.rainbowResolved = true;
    game.state.specialistProcessed = true; 

    if (!game.gameStats.specialists.shield) {
      game.gameStats.specialists.shield = { total: 0 };
    }
    game.gameStats.specialists.shield.total++;

    Actions.commitToDiscard(game, jack);
    player.hand[slotIndex] = null;

    game.state.mode = GameMode.Shield;

    return { 
      type: "SHIELD_ACTIVATED", 
      success: true,
      flipped: null,
      message: UI_STRINGS["SHIELD_MESSAGE"],
      endTurn: true
    };
  },
};