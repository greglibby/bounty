import { MODES, UI_STRINGS } from "../constants.js";
import { Actions } from "../core/Actions.js";
import type { IGameEngine, Player, GameState, SpecialistResult } from "../types/index.js";
import type { Specialist } from "./Specialist.js";

export const JackShield: Omit<Specialist, "execute"> & {
  shouldCPUPlay(game: IGameEngine, player: Player): number;
  execute(game: IGameEngine, slotIndex: number): { type: string; success: boolean } | false;
} = {
  canHandle(state: GameState): boolean {
    return state.mode === MODES.SHIELD;
  },

  resolve(game: IGameEngine, choice: string | number): SpecialistResult {
    return {
      type: "SHIELD_SKIP",
      success: true,
      flipped: undefined,
      message: UI_STRINGS.SHIELD_MESSAGE,
      endTurn: true,
    };
  },

  shouldCPUPlay(game: IGameEngine, player: Player): number {
    if (!player.hand || player.hand.every((c) => c === null)) return -1;

    const jackIndex = player.hand.findIndex((c) => c && c.rank === 11);
    if (jackIndex === -1) return -1;

    if (game.state.streakCount !== 0) return -1;

    const cardCount = player.hand.filter((c) => c !== null).length;
    const activeOpponents = game.players.filter(
      (p) => !p.isEliminated && p !== player,
    );

    if (cardCount >= 3) return jackIndex;

    if (cardCount === 2) {
      const everyoneElseFull = activeOpponents.every(
        (p) => p.hand.filter((c) => c !== null).length >= 3,
      );
      return everyoneElseFull ? -1 : jackIndex;
    }

    return -1;
  },

  execute(
    game: IGameEngine,
    slotIndex: number,
  ): { type: string; success: boolean } | false {
    const player = game.players[game.currentPlayerIndex];
    if (!player) return false;
    const jack = player.hand[slotIndex];

    if (!jack || jack.rank !== 11) return false;

    // 1. THE GREAT RESET: Purge Social/Bounty/Streak contexts
    game.resetState();

    // Block syncGameState from re-arming the Queen/Triple/Lucky7 on the
    // current Up Card. The Jack overrides whatever mode was active.
    game.state.socialResolved = true;
    game.state.specialistProcessed = true;

    import("../core/SoundManager.js").then(({ SoundManager }) => {
      SoundManager.play("shield");
    });

    game.gameStats.specialists.shield.total++;

    // 2. Physical Move: Jack becomes the new Up Card via the Commit Gate
    // This ensures it enters the registry and bakes _strewn metadata
    Actions.commitToDiscard(game, jack);
    player.hand[slotIndex] = null;

    // 3. Explicitly set state for Director's cinematic phase
    game.state.mode = MODES.SHIELD;
    game.state.lastResult = UI_STRINGS.SHIELD_MESSAGE;

    return { type: "SHIELD_ACTIVATED", success: true };
  },
};