// =============================================================================
// BOUNTY — Sabotage Specialist
// src/specialists/Sabotage.ts
// =============================================================================

import { MODES, UI_STRINGS } from "../constants.js";
import { Actions } from "../core/Actions.js";
import { SoundManager } from "../core/SoundManager.js";
import type { Specialist } from "./Specialist.js";

export const Sabotage: Specialist = {
  canHandle(state) {
    return state.mode === MODES.SABOTAGE;
  },

  /**
   * RESOLVE: Handles the victim's single suit guess.
   */
  resolve(game, choice) {
    const flipped = Actions.draw(game);
    if (!flipped) return null;

    const actualColor = flipped.color;

    // Normalize both to uppercase so Human ("RED") and CPU ("Red") both
    // match the card color ("Red"). String() handles the string | number union.
    const success =
      String(choice).toUpperCase() === String(actualColor).toUpperCase();

    // CRITICAL: Clear the flag so the effect doesn't leak to the next player
    game.state.pendingSabotage = false;

    if (success) {
      return {
        success: true,
        type: "SABOTAGE_COMPLETE",
        flipped,
        message: UI_STRINGS.RESULT_CORRECT,
        endTurn: true,
      };
    }

    game.recordSpecialistStat("sabotage", "fail");
    return {
      success: false,
      type: "SABOTAGE_FAIL",
      flipped,
      message: `${UI_STRINGS.SABOTAGE_FAILED}`,
      endTurn: true,
    };
  },

  /**
   * EXECUTE: Triggered when a player plays a 4 from their hand.
   */
  execute(game, slotIndex) {
    const player = game.players[game.currentPlayerIndex];
    if (!player) return null;

    const card = player.hand[slotIndex];

    if (!card || card.rank !== 4) return null;

    // 1. Reset transient states (Aces, Queens, etc)
    game.resetState();

    // Block syncGameState from re-arming the Queen/Triple/Lucky7 on the
    // current Up Card. The 4 overrides whatever mode was active.
    game.state.socialResolved = true;
    game.state.specialistProcessed = true;

    // SOUND FIX: Play sabotage sound immediately on hand action
    SoundManager.play("sabotage");

    // STAT FIX: Use centralized tracking for the trigger
    game.recordSpecialistStat("sabotage", "trigger");

    // 2. Physical move to the table
    game.executePhysicalDiscard(slotIndex);

    // 3. THE FIX: Set the pending flag so syncGameState targets the NEXT player
    game.state.pendingSabotage = true;
    game.state.mode = MODES.SABOTAGE;

    return {
      success: true,
      type: "SABOTAGE_ACTIVATED",
      message: UI_STRINGS.SABOTAGE_VICTIM_MSG,
      endTurn: true,
    };
  },
};