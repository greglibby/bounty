import { GameMode, UI_STRINGS } from '../types/constants';
import { GameState, TurnResult, EngineContext, Specialist } from '../types/engine';
import { Actions } from '../core/Actions';

// ─────────────────────────────────────────────────────────
// SABOTAGE IMPLEMENTATION
// ─────────────────────────────────────────────────────────

export const Sabotage: Specialist = {
  canHandle(state: GameState): boolean {
    return state.mode === GameMode.Sabotage;
  },

  resolve(game: EngineContext, choice?: string | number): TurnResult | null {
    const flipped = Actions.draw(game);
    if (!flipped) return null;

    const actualColor = flipped.color;
    
    const success = String(choice).toUpperCase() === String(actualColor).toUpperCase();

    game.state.pendingSabotage = false;

    if (success) {
      return {
        success: true,
        type: "SABOTAGE_COMPLETE",
        flipped,
        message: UI_STRINGS["RESULT_CORRECT"],
        endTurn: true,
      };
    }

    game.recordSpecialistStat("sabotage", "fail");
    
    return {
      success: false,
      type: "SABOTAGE_FAIL",
      flipped,
      message: UI_STRINGS["SABOTAGE_FAILED"],
      endTurn: true,
    };
  },

  execute(game: EngineContext, slotIndex: number): TurnResult | null {
    const player = game.players[game.currentPlayerIndex];
    const card = player.hand[slotIndex];

    if (!card || card.rank !== 4) return null;

    game.resetState();

    // Changed to rainbow terminology!
    game.state.rainbowResolved = true;
    game.state.specialistProcessed = true; 

    game.recordSpecialistStat("sabotage", "trigger");
    game.executePhysicalDiscard(slotIndex);

    game.state.pendingSabotage = true;
    game.state.mode = GameMode.Sabotage;

    return {
      success: true,
      type: "SABOTAGE_ACTIVATED",
      flipped: null,
      message: UI_STRINGS["SABOTAGE_VICTIM_MSG"],
      endTurn: true,
    };
  },
};