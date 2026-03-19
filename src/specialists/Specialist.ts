// =============================================================================
// BOUNTY — Specialist Interface Contract
// src/specialists/Specialist.ts
//
// Every specialist module must satisfy this interface.
// Engine.specialists is typed as Specialist[], so TypeScript will catch
// any module that is missing or mistyping canHandle / resolve.
//
// IGameEngine is used for the game parameter (not the concrete BountyEngine
// class) to avoid a circular dependency: Engine imports specialists,
// specialists cannot import Engine back.
// =============================================================================

import type { IGameEngine, SpecialistResult, GameState } from "../types/index.js";

export interface Specialist {
  /** Return true when this specialist owns the current mode. */
  canHandle(state: GameState): boolean;

  /** Called when the player makes a guess in this mode. */
  resolve(
    game: IGameEngine,
    choice: string | number
  ): SpecialistResult | null;

  /**
   * Optional — only Sabotage and JackShield implement this.
   * Called when the player plays a card directly from their hand (rank 4 or J).
   */
  execute?(
    game: IGameEngine,
    slotIndex: number
  ): SpecialistResult | null;
}