import { View } from "./View.js";
import {
    TIMING,
    MODES,
    UI_STRINGS,
    RANK_LABELS,
    pickReaction,
    pickBountyReaction,
} from "../constants.js";
import { Sabotage } from "../specialists/Sabotage.js";
import { JackShield } from "../specialists/JackShield.js";
import { Actions } from "../core/Actions.js";
import { playCPUTurns } from "../ui/InputHandler.js";
import { KingBounty } from "../specialists/KingBounty.js";
import { SoundManager } from "../core/SoundManager.js";
import { RecordManager } from "../core/RecordManager.js";
import { FormatCard } from "../constants.js";
import { AnimationManager } from "../core/AnimationManager.js";
import type { Card, CardColor, GameMode, GameState, Player, SpecialistResult, IGameEngine } from "../types/index.js";
import { BountyEngine } from "../core/Engine.js";

// =============================================================================
// Local type augmentations
//
// GameState and BountyEngine are extended here — at runtime these properties
// exist on the objects but they are not part of the shared interface contract.
// =============================================================================

/** Extra transient fields Director writes onto game.state each turn. */
type AugmentedState = GameState & {
    turnDiscards?: (Card | null)[];
    lastFlippedCard?: Card | null;
    currentChoice?: string;
    tripleProgress?: unknown;
};

/** A bounty sequence step produced by KingBounty.resolve(). */
interface BountySequenceStep {
    card: Card;
    isMatch: boolean;
}

/**
 * The result returned by processGuess() when the player accepts a Bounty
 * Challenge. Extends SpecialistResult with the flip sequence.
 */
interface BountyAcceptResult extends SpecialistResult {
    sequence?: BountySequenceStep[];
}

/**
 * Union of all values processGuess() can return inside Director.
 * Mirrors the GuessResult declared in the Engine stub.
 */
type GuessResult =
    | SpecialistResult
    | BountyAcceptResult
    | { type: string; endTurn: boolean; success?: boolean }
    | null
    | false;

/** The payload passed from InputHandler to Director.resolveHumanDiscard(). */
type DiscardData = { index: number; card: Card | null } | number;

// =============================================================================
// Global Window augmentation
// =============================================================================

declare global {
    interface Window {
        /** True while an animation or engine action is in progress. */
        isProcessingAction: boolean;
        /** True when a headless simulation is running (turbo mode). */
        isSimulating?: boolean;
    }
}

// SUITS is referenced in Logger.getSuitSymbol but not defined/imported anywhere
// in this codebase — the method is dead code. The declaration suppresses the
// TypeScript compile error without changing runtime behaviour.
declare const SUITS: Record<string, { symbol?: string }>;

// =============================================================================
// GLOBAL SIMULATION CONTROL
// =============================================================================

export let isSimulating: boolean = false;

// =============================================================================
// sleep helper
// =============================================================================

const sleep = (ms: number): Promise<void> => {
    // Turbo mode for simulations
    if (isSimulating) return Promise.resolve();

    // Apply speed multiplier from settings
    const speedMultiplier =
        parseFloat(localStorage.getItem("BOUNTY_SPEED") ?? "") || 1.0;

    return new Promise((resolve) => setTimeout(resolve, ms * speedMultiplier));
};

// =============================================================================
// Logger
// =============================================================================

export const Logger = {
    getRankLabel(rank: number): string | number {
        return RANK_LABELS[rank] || rank;
    },

    getSuitSymbol(suitName: string): string {
        return SUITS[suitName]?.symbol || suitName;
    },

    formatCard(card: Card | null | undefined): string {
        if (!card) return "None";
        // If _strewn metadata exists, append it to the format
        const strewn = card._strewn ? ` [${card._strewn.rot}-${card._strewn.offset}]` : "";
        return FormatCard(card) + strewn;
    },

    formatHand(hand: (Card | null)[]): string {
        if (!hand || hand.length === 0) return "Empty";
        const activeCards = hand.filter((c) => c !== null);
        return activeCards.length > 0
            ? activeCards.map((c) => this.formatCard(c)).join(", ")
            : "Empty";
    },

    // Helper to log the history registry from a provided array
    logDiscardStack(stack: Card[] | null | undefined): void {
        const stackLog = stack && stack.length > 0
            ? stack.map((c) => this.formatCard(c)).join(" -> ")
            : "Empty";

        console.log(`%c Discard Registry: ${stackLog} `, "color: #888; font-style: italic;");
    },

    logTurn(
        game: BountyEngine,
        player: Player,
        choice: string | number,
        result: GuessResult,
        actionCard: Card | null,
        handAtStart: Card[],
        upCardAtStart: Card | null,
        registryAtStart: Card[]
    ): void {
        console.group(
            `%c Turn Start - ${player.name} `,
            "background: #1a1a1a; color: #ffd700; font-weight: bold;",
        );

        // Log Registry at Start using the pre-turn snapshot
        console.log("%c --- PRE-TURN STATE --- ", "color: #ff9100; font-weight: bold; font-size: 0.85em;");
        this.logDiscardStack(registryAtStart);

        console.log(`Game Mode - ${game.state.mode}`);
        console.log(`Cards in hand start - ${this.formatHand(handAtStart)}`);
        console.log(`Card played from hand - ${this.formatCard(actionCard)}`);
        console.log(`Up Card - ${this.formatCard(upCardAtStart)}`);
        console.log(`Guess - ${choice.toString()}`);

        if (result && (result as SpecialistResult).flipped) {
            console.log(`flip card: ${this.formatCard((result as SpecialistResult).flipped)}`);
        }

        if (result) {
            console.log(`Result - ${(result as SpecialistResult).message}`);
        }

        // Capture discards collected during the turn
        const discards = (game.state as AugmentedState).turnDiscards || [];
        console.log(
            `Turn Discards - ${discards.length > 0 ? discards.map((c) => this.formatCard(c)).join(", ") : "None"}`,
        );

        console.log(`Cards in Hand End - ${this.formatHand(player.hand)}`);

        // Log Registry at End using current game state
        console.log("%c --- POST-TURN STATE --- ", "color: #00ff41; font-weight: bold; font-size: 0.85em;");
        this.logDiscardStack(game.discardPile || []);

        console.groupEnd();

        // Cleanup for next turn
        (game.state as AugmentedState).turnDiscards = [];
    },

    logSpecialPlay(player: Player, card: Card | null | undefined, type: string): void {
        console.log(
            `%c ⚡ SPECIAL PLAY: ${player.name} used ${type} (${this.formatCard(card)}) `,
            "background: #4a148c; color: #fff; font-weight: bold; padding: 2px 4px; border-radius: 3px;",
        );
    },
};

// =============================================================================
// Director
// =============================================================================

export const Director = {
    /**
     * Settable by InputHandler so Director.handleDiscardPhase() can hand control
     * back to the human player's click event.
     */
    resolveHumanDiscard: null as ((data: DiscardData) => void) | null,

    setSimulationMode(val: boolean): void {
        isSimulating = val;
        console.warn(`SIMULATION MODE: ${val ? "ON (Turbo)" : "OFF (Normal)"}`);
    },

    async playOpeningCeremony(game: BountyEngine): Promise<void> {
        game.startCeremony();
        this.logMessage(game, UI_STRINGS.CEREMONY_MSG);
        View.render(game);
        // Human announces the ceremony opener via speech bubble
        View.showBubble(0, "LOWEST CARD GOES FIRST", false);
        await sleep(TIMING.CEREMONY_STEP);

        let candidates: number[] = game.players.map((_, i) => i);

        while (candidates.length > 1) {
            for (const idx of candidates) {
                SoundManager.play("flip");

                game.drawCeremonyCard(idx);

                // Render immediately so the card exists in the DOM
                View.render(game);

                // --- NEW: Animate the ceremony card from Deck to Hand ---
                const drawnCard = game.players[idx]?.hand.find(c => c !== null);
                if (drawnCard) {
                    await AnimationManager.flyDrawToHand(idx, drawnCard!);
                }

                await sleep(TIMING.CEREMONY_STEP);
            }

            const round = game.evaluateCeremonyRound(candidates);

            if (round.isTie) {
                this.logMessage(game, `TIE! ${UI_STRINGS.CEREMONY_BANNER}`);
                View.render(game);
                await sleep(TIMING.RESULT);

                game.players.forEach((p, idx) => {
                    if (!round.survivors.includes(idx)) p.hand = [];
                });

                candidates = round.survivors;
                View.render(game);
                await sleep(TIMING.CEREMONY_STEP);
            } else {
                const winnerIdx = round.survivors[0];

                if (winnerIdx !== undefined && game.players[winnerIdx]) {
                    game.finalizeCeremony(winnerIdx);
                    // Winner shouts their victory; message box stays clean
                    View.showBubble(winnerIdx, "I'M FIRST!", false);
                    this.logMessage(game, "");
                } else {
                    // FALLBACK: If ceremony fails, force Player 0 to start to prevent crash
                    console.warn(
                        "Ceremony failed to find winner. Defaulting to Player 0.",
                    );
                    game.finalizeCeremony(0);
                    View.showBubble(0, "I'M FIRST!", false);
                    this.logMessage(game, "");
                }

                View.render(game);
                await sleep(TIMING.VICTORY_PAUSE);
                candidates = [game.currentPlayerIndex]; // Use the index set by finalizeCeremony
            }
        }

        // 1. Clear ceremony cards from hands first
        game.endCeremony();

        // 2. Rebuild deck (will find 0 cards in hands, resulting in a 52-card pool)
        this.logMessage(game, UI_STRINGS.SHUFFLING);
        SoundManager.play("shuffle");
        Actions.prepareGameDeck(game);

        View.render(game);
        await sleep(TIMING.SHUFFLE);

        // 3. Draw the Up Card and route it through the Commit Gate
        SoundManager.play("flip");
        const startingCard: Card = Actions.draw(game)!;

        // --- NEW: Fly the starting Up Card from Deck to Center ---
        await AnimationManager.flyDrawToCenter(startingCard);

        Actions.commitToDiscard(game, startingCard);

        game.syncGameState();
        this.logMessage(game, "");
        View.render(game);
    },

    setButtonsPulse(isActive: boolean): void {
        // Select all action buttons that should wiggle
        const buttons = document.querySelectorAll<HTMLElement>(".btn-hl");
        buttons.forEach((btn) => {
            if (isActive) {
                btn.classList.add("waiting"); // Matches the CSS I provided earlier
            } else {
                btn.classList.remove("waiting");
            }
        });
    },

    async playTurn(game: BountyEngine, choice: string | number): Promise<void> {
        this.setButtonsPulse(false);
        // Clear any lingering speech bubbles from the previous turn
        View.clearAllBubbles();
        game.syncGameState();
        const player: Player = game.players[game.currentPlayerIndex]!;
        // IDENTIFY HUMAN BY INDEX
        const isHuman: boolean = game.currentPlayerIndex === 0 && !isSimulating;
        const handAtStart: Card[] = player.hand
            .filter((c): c is Card => c !== null)
            .map((c) => ({ ...c }));
        const upCardAtStart: Card | null = game.upCard ? { ...game.upCard } : null;

        // THE FIX: Capture a shallow copy of the discard registry before Engine processes it
        const registryAtStart: Card[] = [...(game.discardPile || [])];

        (game.state as AugmentedState).turnDiscards = [];

        // --- 1. LOCK UI AND SHOW INITIAL STATE ---
        window.isProcessingAction = true;

        // SNAP TRIGGER: Update the meter immediately when turn begins
        View.updateDangerMeter(game);

        // SABOTAGE FIX: Clear instruction message for CPU victims during the thinking phase (Phase 2).
        if (game.state.mode === MODES.SABOTAGE && !isHuman) {
            game.state.lastResult = "";
        }

        View.render(game);

        // --- 2. CINEMATIC THINKING PAUSE ---
        if (!isHuman && !isSimulating) {
            await sleep(TIMING.THINKING);

            // CPU reacts to the Bounty Challenge based on hand size
            if (game.state.mode === MODES.KING_BOUNTY) {
                const activeCards: number = player.hand.filter((c) => c !== null).length;
                View.showBubble(
                    game.currentPlayerIndex,
                    pickBountyReaction(activeCards),
                    false,
                );
                await sleep(TIMING.THINKING);
            }
        }

        // --- 3. DECK EXHAUSTION CHECK ---
        if (game.deck.length === 0 && game.discardPile.length > 0) {
            this.logMessage(game, UI_STRINGS.SHUFFLING);

            // FIX: Isolate the Up Card so it remains visible during shuffle
            const topCard: Card = game.discardPile[game.discardPile.length - 1];
            const remainingDiscards: Card[] = game.discardPile.slice(0, -1);

            game.discardPile = [topCard];

            // Render immediately so only the top card is visible in the discard zone
            View.render(game);

            // The player whose turn it is announces the reshuffle
            View.showBubble(game.currentPlayerIndex, "RESHUFFLING!", false);
            SoundManager.play("shuffle");
            if (game.gameStats) game.gameStats.reshuffles++;

            // Shuffle the remaining discard cards and make them the new deck
            game.deck = Actions.shuffle(remainingDiscards);

            await sleep(TIMING.SHUFFLE);
            this.logMessage(game, "");
            View.render(game);
        }

        const turnMode: GameMode = game.state.mode;

        // --- 4. QUEEN SOCIAL: No theme selection. Proceeds directly to color guess. ---

        const result: GuessResult = game.processGuess(choice);

        // --- 5. SPECIALIST HAND ACTION ROUTING ---
        if (
            result &&
            ((result as SpecialistResult).type === "SABOTAGE_ACTIVATED" ||
                (result as SpecialistResult).type === "SHIELD_ACTIVATED")
        ) {
            Logger.logTurn(
                game,
                player,
                "HAND ACTION",
                result,
                null,
                handAtStart,
                upCardAtStart,
                registryAtStart // Pass snapshot
            );
            View.render(game);
            await sleep(TIMING.SPECIAL_CARD);
            window.isProcessingAction = false;
            this.advanceToNextActivePlayer(game);

            if (
                !game.state.gameOver &&
                (isSimulating || game.currentPlayerIndex !== 0) // FIX: Check index, not name
            ) {
                this.kickstartCPU(game);
            }
            return;
        }

        // --- 6. KING BOUNTY CINEMATIC ROUTING ---
        if (result && (result as SpecialistResult).type === "ACCEPT_START") {
            this.logMessage(game, UI_STRINGS.BOUNTY_ACCEPTED);
            // Player announces their decision via bubble
            View.showBubble(game.currentPlayerIndex, "ACCEPT!", false);
            View.updateDangerMeter(game);
            View.render(game);
            await sleep(TIMING.REVEAL);
            await this.playKingBountySequence(game, player, result as BountyAcceptResult);
            return;
        }

        // --- BOUNTY DECLINE FIX ---
        if (result && (result as SpecialistResult).type === "DECLINED_ACTION") {
            this.logMessage(game, UI_STRINGS.BOUNTY_DECLINED);
            // Player announces their decision via bubble
            View.showBubble(game.currentPlayerIndex, "DECLINE!", false);
            View.updateDangerMeter(game);
            View.render(game);
            await sleep(TIMING.REVEAL);
            window.isProcessingAction = false;

            if (game.currentPlayerIndex !== 0 || isSimulating) {
                // FIX: Check index 0
                this.kickstartCPU(game);
            } else {
                View.render(game);
                this.setButtonsPulse(true);
            }
            return;
        }

        // --- 7. STANDARD REVEAL SEQUENCE ---
        await this.executeRevealSequence(game, player, choice, result, turnMode);
        Logger.logTurn(
            game,
            player,
            choice,
            result,
            null,
            handAtStart,
            upCardAtStart,
            registryAtStart
        );

        if (!game.state.gameOver) {
            await sleep(isSimulating ? 10 : TIMING.POST_TURN);

            // --- THE FIX: DISCARD AWARENESS ---
            // If a discard is required, we unlock the UI but do NOT move to the next player.
            // This allows the CPU loop or Human to process the discard on the current turn.
            if (game.state.mustDiscard.length > 0) {
                window.isProcessingAction = false;
                View.render(game);
            } else if ((result as SpecialistResult)?.endTurn !== false) {
                window.isProcessingAction = false;
                this.advanceToNextActivePlayer(game);
            } else {
                window.isProcessingAction = false;
                View.render(game);
            }

            if (
                !game.state.gameOver &&
                (isSimulating || game.currentPlayerIndex !== 0) // FIX: Check index 0
            ) {
                this.kickstartCPU(game);
            }
        } else {
            await this.handleGameOver(game);
        }
    },

    async playKingBountySequence(
        game: BountyEngine,
        player: Player,
        result: BountyAcceptResult
    ): Promise<void> {
        // STAT: Record the opportunity (trigger) and the decision (accepted)
        game.recordSpecialistStat("bounty", "trigger");
        game.recordSpecialistStat("bounty", "accepted");

        if (!result || !result.sequence) {
            window.isProcessingAction = false;
            this.advanceToNextActivePlayer(game);
            return;
        }

        let finalFlippedCard: Card | null = null;

        for (let i = 0; i < result.sequence.length; i++) {
            const step = result.sequence[i];
            if (!step) continue;
            finalFlippedCard = step.card;
            const isLastFlip: boolean = i === result.sequence.length - 1;

            View.renderMessageCenter(
                game,
                MODES.KING_BOUNTY,
                null,
                `BOUNTY FLIP ${i + 1} OF ${player.hand.filter((c) => c !== null).length}...`,
            );
            await sleep(TIMING.REVEAL);

            SoundManager.play("flip");
            (game.state as AugmentedState).lastFlippedCard = step.card;
            View.render(game);
            await sleep(TIMING.REVEAL);

            if (step.isMatch) {
                game.recordSpecialistStat("bounty", "win");

                // NEW: Save the winning card state so the View knows not to clear it
                game.state.bountyWinningCard = step.card;

                // FIXED: Set data for the winner's Cause and Gold Card highlight
                player.eliminationData = {
                    cause: "Bounty Challenge",
                    matchRank: step.card.rank,
                    finalHand: [...player.hand.filter((c): c is Card => c !== null)],
                    round: game.gameStats.totalRounds,
                } as unknown as typeof player.eliminationData;

                game.state.winner = player;
                game.state.gameOver = true;

                View.showBubble(
                    game.currentPlayerIndex,
                    pickReaction("CORRECT"),
                    false,
                );
                View.renderMessageCenter(
                    game,
                    MODES.KING_BOUNTY,
                    null,
                    UI_STRINGS.KING_BOUNTY_SUCCESS,
                );
                await sleep(TIMING.VICTORY_PAUSE);
                await this.handleGameOver(game);
                return;
            } else {
                const failMsg: string = isLastFlip ? "NO MATCH! TAKE CARD." : "NO MATCH!";
                View.showBubble(
                    game.currentPlayerIndex,
                    pickReaction("INCORRECT"),
                    false,
                );
                View.renderMessageCenter(game, MODES.KING_BOUNTY, null, failMsg);
                await sleep(TIMING.RESULT);

                // --- THE FIX: ROUTE NON-MATCHING CARDS TO THE DISCARD REGISTRY ---
                // If it isn't a match and it's not the final penalty card, it physically hits the discard pile.
                if (!isLastFlip) {
                    Actions.commitToDiscard(game, step.card);
                }
            }
        }

        if (finalFlippedCard) {
            (game.state as AugmentedState).lastFlippedCard = null;
            View.render(game);
            const emptyIdx: number = player.hand.indexOf(null);
            if (emptyIdx !== -1) player.hand[emptyIdx] = finalFlippedCard;
            else player.hand.push(finalFlippedCard);
        }

        // 1. Run the check
        game.checkCombos(player);
        View.render(game); // Ensure UI shows the new card and combo message

        // 2. THE FIX: If a combo was found, the mode is now MODES.DISCARD.
        // We must NOT advance the turn; we must stay on this player so they can discard.
        if (game.state.mode === MODES.DISCARD) {
            window.isProcessingAction = false;
            // If it's a CPU, kickstart their logic to handle the discard
            if (game.currentPlayerIndex !== 0) {
                this.kickstartCPU(game);
            }
            return; // Exit early! Do not advanceToNextActivePlayer.
        }

        // 3. Only advance if no combo was formed
        window.isProcessingAction = false;
        this.advanceToNextActivePlayer(game);
        this.kickstartCPU(game);
    },

    async handleThemeSelection(
        game: BountyEngine,
        player: Player,
        choice: string,
        handAtStart: Card[],
        upCardAtStart: Card | null
    ): Promise<void> {
        // 1. Set the theme in the state
        game.state.socialTheme = choice as CardColor;

        // BRIDGE FIX: Set currentChoice so the Engine's probability
        // calculator sees the change immediately during this render cycle.
        (game.state as AugmentedState).currentChoice = choice;

        // STAT FIX: Record global Social Round and specific theme round
        game.recordSpecialistStat("queen", "round_start");
        game.recordSpecialistStat(
            "queen",
            choice === "COLOR" ? "color_round" : "suit_round",
        );

        // 2. LOGGING
        console.group(
            `%c Social Theme Selection - ${player.name} `,
            "background: #1a1a1a; color: #00fbff; font-weight: bold;",
        );
        console.log(`Theme Chosen - ${choice}`);
        console.groupEnd();

        // 3. Visual Reveal
        this.logMessage(
            game,
            `${player.name}${UI_STRINGS.SOCIAL_PICKED}${choice}!`,
        );

        // --- THE BRIDGE FIX ---
        // Update the meter first so it calculates the new 7 or 9 difficulty
        View.updateDangerMeter(game);

        // Render the "PICKED" message and the updated neon bars
        View.render(game);

        // Pause so the player can see the meter spike to Red (if SUIT)
        await sleep(TIMING.RESULT);

        const isHuman: boolean = game.currentPlayerIndex === 0 && !isSimulating;

        if (isHuman) {
            window.isProcessingAction = false;
            View.render(game);
        } else {
            window.isProcessingAction = false;
            this.kickstartCPU(game);
        }
    },

    async executeRevealSequence(
        game: BountyEngine,
        player: Player,
        choice: string | number,
        result: GuessResult,
        turnMode: GameMode
    ): Promise<void> {
        if (!result || !(result as SpecialistResult).flipped) return;

        const pIdx: number = game.currentPlayerIndex;

        const guessShouts: Record<string, string> = {
            higher: "HIGHER!", lower: "LOWER!", HIGHER: "HIGHER!", LOWER: "LOWER!",
            Yellow: "YELLOW!", Red: "RED!", Blue: "BLUE!", Green: "GREEN!",
        };
        const guessShout: string = guessShouts[String(choice)] || `${String(choice).toUpperCase()}!`;
        View.showBubble(pIdx, guessShout, false);

        const guessMsg: string = `${player.name} guessed ${choice.toString()}!`;
        View.renderMessageCenter(game, turnMode, null, guessMsg, game.deck.length + 1);

        // --- ANIMATION 1: DRAW FROM DECK ---
        await AnimationManager.flyDrawToCenter((result as SpecialistResult).flipped!);
        SoundManager.play("flip");

        // Physical Flip (Transient Card sync)
        (game.state as AugmentedState).lastFlippedCard = (result as SpecialistResult).flipped;
        View.render(game);

        View.renderMessageCenter(game, turnMode, null, guessMsg);
        await sleep(TIMING.REVEAL);

        // 2. RESULT PHASE
        if (
            (result as SpecialistResult).type === "TIE" ||
            (result as SpecialistResult).type === "TIE_REGUESS"
        ) {
            SoundManager.play("incorrect");
            View.animateFlipCardIncorrect();
            View.showBubble(pIdx, pickReaction("INCORRECT"), false);
            await sleep(450); // wait for wobble
        } else if ((result as SpecialistResult).success) {
            SoundManager.play("correct");
            View.animateFlipCardCorrect();

            const flipped = (result as SpecialistResult).flipped!;
            if (!game.discardPile.includes(flipped)) {
                game.discardPile.push(flipped);
            }

            const successShout: string =
                turnMode === MODES.LUCKY_7 &&
                    (result as SpecialistResult).type === "LUCKY_7_SUCCESS"
                    ? "LUCKY DISCARD!"
                    : pickReaction("CORRECT");
            View.showBubble(pIdx, successShout, false);
            await sleep(450);
        } else {
            SoundManager.play("incorrect");
            View.animateFlipCardIncorrect();
            View.showBubble(pIdx, pickReaction("INCORRECT"), false);

            // Wait for the wobble animation to finish
            await sleep(450);

            // --- ANIMATION 2: TRANSIENT TO HAND ---
            // 1. Measure the start coordinates while it's still in the center
            const transientSlot = document.getElementById("transient-card");
            const startRect: DOMRect | null = transientSlot
                ? transientSlot.getBoundingClientRect()
                : null;

            // 2. Clear the transient flag so View.js knows it's safe to render it in the hand
            (game.state as AugmentedState).lastFlippedCard = null;

            // 3. Render (Card disappears from center, appears in hand)
            View.render(game);

            // 4. Fly the ghost card from the center to that new hand slot
            if (startRect) {
                await AnimationManager.flyTransientToHand(
                    pIdx,
                    (result as SpecialistResult).flipped!,
                    startRect
                );
            }
        }

        View.renderMessageCenter(game, turnMode, null, (result as SpecialistResult).message);

        const hasCombo: boolean = game.checkCombos(player);
        const activeCardCount: number = player.hand.filter((c) => c !== null).length;

        if (activeCardCount >= 4 && !hasCombo) {
            SoundManager.play("eliminated");
        }

        // STAT TRACKING logic remains identical...
        // @ts-ignore — MODES.ACE_STREAK does not exist in the current constants;
        // this branch is leftover from an earlier design and is never reached.
        if (turnMode === MODES.ACE_STREAK) {
            // @ts-ignore
            if ((result as SpecialistResult).type === "ACE_STREAK_COMPLETE")
                game.recordSpecialistStat("ace", "success");
        } else if (turnMode === MODES.LUCKY_7) {
            if ((result as SpecialistResult).type === "LUCKY_7_SUCCESS")
                game.recordSpecialistStat("lucky7", "success");
        } else if (turnMode === MODES.SABOTAGE) {
            if ((result as SpecialistResult).type === "SABOTAGE_FAIL")
                game.recordSpecialistStat("sabotage", "fail");
            else if ((result as SpecialistResult).success)
                game.recordSpecialistStat("sabotage", "success");
        } else if (turnMode === MODES.KING_BOUNTY) {
            if ((result as SpecialistResult).success) {
                game.recordSpecialistStat("bounty", "accepted");
                if ((result as SpecialistResult).type === "BOUNTY_MATCH")
                    game.recordSpecialistStat("bounty", "win");
            }
        }

        await sleep(TIMING.RESULT);

        // PHASE 2 CLEANUP
        (game.state as AugmentedState).lastFlippedCard = null;
        View.render(game);

        // PHASE 4: ACTION STEP (Discard/Combos)
        if (game.state.mustDiscard.length > 0 && !game.state.gameOver) {
            if (game.state.lastResult === UI_STRINGS.COMBO_PAIR) { game.recordCombo("pair"); View.showBubble(pIdx, "DISCARDING PAIR!", true); }
            if (game.state.lastResult === UI_STRINGS.COMBO_STRAIGHT) { game.recordCombo("straight"); View.showBubble(pIdx, "DISCARDING STRAIGHT!", true); }
            if (game.state.lastResult === UI_STRINGS.COMBO_FLUSH) { game.recordCombo("flush"); View.showBubble(pIdx, "DISCARDING FLUSH!", true); }
            if (
                game.state.lastResult === UI_STRINGS.LUCKY_7_SUCCESS &&
                !game.state.lastResult.includes("PAIR") &&
                !game.state.lastResult.includes("STRAIGHT") &&
                !game.state.lastResult.includes("FLUSH")
            ) {
                View.showBubble(pIdx, "LUCKY DISCARD!", true);
            }

            window.isProcessingAction = true;
            await sleep(TIMING.DISCARD_PAUSE);
            game.state.mode = MODES.DISCARD;
            View.render(game);
            await sleep(TIMING.RESULT);

            await this.handleDiscardPhase(game);
            View.clearBubble(game.currentPlayerIndex);
            window.isProcessingAction = true;
        }
    },

    async handleDiscardPhase(game: BountyEngine): Promise<void> {
        const player: Player = game.players[game.currentPlayerIndex]!;
        const isHuman: boolean = game.currentPlayerIndex === 0 && !isSimulating;

        const activeCards: number = player.hand.filter((c) => c !== null).length;
        if (activeCards === 0) {
            game.state.mustDiscard = [];
            return;
        }

        game.state.mode = MODES.DISCARD;
        window.isProcessingAction = true;
        View.render(game);

        if (isHuman) {
            window.isProcessingAction = false;

            while (
                game.state.mustDiscard.length > 0 &&
                player.hand.some((c) => c !== null)
            ) {
                game.state.mode = MODES.DISCARD;

                // 1. Wait for human to click a card.
                // Note: Your InputHandler needs to pass the index to this resolve function
                // e.g., Director.resolveHumanDiscard({ index: clickedIndex, card: cardObj })
                const discardData: DiscardData = await new Promise<DiscardData>((resolve) => {
                    this.resolveHumanDiscard = resolve;
                });

                window.isProcessingAction = true; // Lock UI during animation

                // 2. Extract data safely (handles both object or primitive index)
                const actualIndex: number =
                    typeof discardData === "object" ? discardData.index : discardData;
                const cardToDiscard: Card | null =
                    typeof discardData === "object"
                        ? discardData.card
                        : game.discardPile[game.discardPile.length - 1] ?? null;

                // 3. MEASURE BEFORE RENDER: Grab the exact coordinates of the hand slot
                // before View.render() clears the image out of it.
                let startRect: DOMRect | null = null;
                if (actualIndex !== undefined && actualIndex !== null) {
                    const playerBox = document.getElementById(`player-0`);
                    const slotEl = playerBox?.querySelector<HTMLElement>(
                        `.card-slot[data-index="${actualIndex}"]`
                    );
                    if (slotEl) startRect = slotEl.getBoundingClientRect();
                }

                // 4. Render the new state (Card visually moves to the Discard Registry)
                View.render(game);

                // 5. ANIMATION 3: Fly the ghost card from the human hand to the pile
                if (startRect && cardToDiscard) {
                    await AnimationManager.flyHandToDiscard(startRect, cardToDiscard);
                } else {
                    // Fallback if measurements fail
                    await sleep(TIMING.REVEAL);
                }

                window.isProcessingAction = false; // Unlock for next discard if combo requires multiple
            }
        } else {
            while (game.state.mustDiscard.length > 0) {
                game.state.mode = MODES.DISCARD;
                await sleep(isSimulating ? 5 : TIMING.REVEAL);

                const targetRequirement = game.state.mustDiscard[0];
                if (targetRequirement === undefined) break;
                let actualIndex: number = -1;

                if (targetRequirement === -1) {
                    const validIndices: number[] = player.hand
                        .map((c, i) => (c !== null ? i : -1))
                        .filter((i) => i !== -1);
                    actualIndex = validIndices.sort((a, b) => {
                        const distA = Math.abs((player.hand[a] as Card).rank - 7);
                        const distB = Math.abs((player.hand[b] as Card).rank - 7);
                        return distA - distB;
                    })[0] ?? -1;
                } else {
                    actualIndex = player.hand[targetRequirement]
                        ? targetRequirement
                        : player.hand.findIndex((c) => c !== null);
                }

                if (actualIndex !== -1 && player.hand[actualIndex]) {
                    const cardToDiscard: Card | null = player.hand[actualIndex] ?? null;
                    const augState = game.state as AugmentedState;
                    if (!augState.turnDiscards) augState.turnDiscards = [];
                    augState.turnDiscards.push(cardToDiscard);

                    // --- 1. Measure Start Rect BEFORE array mutation ---
                    const playerBox = document.getElementById(`player-${game.currentPlayerIndex}`);
                    const slotEl = playerBox?.querySelector<HTMLElement>(
                        `.card-slot[data-index="${actualIndex}"]`
                    );
                    const startRect: DOMRect | null = slotEl
                        ? slotEl.getBoundingClientRect()
                        : null;

                    SoundManager.play("flip");
                    game.processDiscard(actualIndex);

                    // --- 2. Render so Discard Pile receives the card in the DOM ---
                    View.render(game);

                    // --- ANIMATION 3: HAND TO DISCARD PILE ---
                    if (startRect) {
                        await AnimationManager.flyHandToDiscard(startRect, cardToDiscard!);
                    } else {
                        await sleep(isSimulating ? 5 : TIMING.REVEAL);
                    }
                } else {
                    game.state.mustDiscard = [];
                    break;
                }
            }
        }

        // THE FIX: Do not clear lastResult or run syncGameState here.
        // We maintain window.isProcessingAction = true to prevent clicks during the pause.
        window.isProcessingAction = true;

        View.render(game);
        await sleep(isSimulating ? 5 : TIMING.POST_TURN);
    },

    async handleHandAction(
        game: BountyEngine,
        slotIndex: number,
        player: Player
    ): Promise<void> {
        const cardToPlay: Card | null = player.hand[slotIndex];
        if (!cardToPlay) return;

        const isSabotage: boolean = cardToPlay.rank === 4;
        const isShield: boolean = cardToPlay.rank === 11;

        // Execute the logic in the engine
        const result: GuessResult = game.processGuess(slotIndex);

        if (result) {
            // --- THE FIX: PHYSICALLY DISCARD THE HAND ACTION CARD ---
            // Ensures the card formally enters the discard array and naturally covers the Queen/Up Card
            game.executePhysicalDiscard(slotIndex);

            if (isSabotage) {
                await this.playSabotageSkip(game);
            } else if (isShield) {
                await this.playShieldSkip(game);
            }
        }
    },

    async playSabotageSkip(game: BountyEngine): Promise<void> {
        const player: Player = game.players[game.currentPlayerIndex]!;
        // 1. PHASE 1: ACTIVATION
        game.state.mode = MODES.SABOTAGE;
        game.state.pendingSabotage = true; // Set the flag for the next player
        game.state.lastResult = UI_STRINGS.SABOTAGE_VICTIM_MSG;

        Logger.logSpecialPlay(player, game.upCard, "SABOTAGE");
        // Player shouts sabotage via bubble
        View.showBubble(game.currentPlayerIndex, "SABOTAGE!", false);
        View.render(game); // Render immediately to show "SABOTAGE!" banner

        await sleep(TIMING.SPECIAL_CARD);

        // 2. PHASE 2: TRANSITION TO VICTIM
        this.advanceToNextActivePlayer(game);

        // Set the instruction for the victim's UI buttons
        game.state.lastResult = UI_STRINGS.SABOTAGE_INSTRUCTION;

        window.isProcessingAction = false;
        View.render(game);
        this.kickstartCPU(game);
    },

    async playShieldSkip(game: BountyEngine): Promise<void> {
        const player: Player = game.players[game.currentPlayerIndex]!;
        // 1. SET VISUAL STATE IMMEDIATELY (Blue Theme)
        game.state.mode = MODES.SHIELD;
        game.state.lastResult = UI_STRINGS.SHIELD_MESSAGE;

        // 2. LOGGING & SOUND
        Logger.logSpecialPlay(player, game.upCard, "JACK SHIELD");
        // Player shouts via bubble
        View.showBubble(game.currentPlayerIndex, "SKIP TURN!", false);

        // 3. RENDER & CINEMATIC PAUSE (1500ms)
        // We pass MODES.SHIELD to force the Blue banner
        View.renderMessageCenter(game, MODES.SHIELD, UI_STRINGS.SHIELD_BANNER);
        View.render(game);

        await sleep(TIMING.SPECIAL_CARD);

        // 4. ADVANCE
        // Engine.nextTurn() -> syncGameState() will see the Up Card is a Jack
        // and set the mode back to NORMAL for the next player.
        this.advanceToNextActivePlayer(game);

        window.isProcessingAction = false;
        this.kickstartCPU(game);
    },

    kickstartCPU(game: IGameEngine): void {
        const nextPlayer: Player | undefined = game.players[game.currentPlayerIndex];
        if (!nextPlayer) return;

        // FIX: Identify human by index 0
        if (
            (game.currentPlayerIndex !== 0 || isSimulating) &&
            !game.state.gameOver
        ) {
            window.isProcessingAction = false;
            if (typeof playCPUTurns === "function") {
                playCPUTurns();
            }
        }
    },

    advanceToNextActivePlayer(game: BountyEngine): void {
        if (game.state.gameOver) return;
        const prevIndex: number = game.currentPlayerIndex;

        // Rotate turn
        game.nextTurn();

        game.state.turnCount++;
        game.gameStats.totalTurns = game.state.turnCount;

        if (game.currentPlayerIndex <= prevIndex) {
            game.state.roundCount++;
            game.gameStats.totalRounds = game.state.roundCount;
        }

        // --- PERSISTENCE CHECK ---
        // Instead of clearing lastResult blindly, we only clear "transient" messages
        // like "CORRECT". We want "HOT STREAK!" or "LUCKY 7!" to persist if the mode persists.
        const msg: string = game.state.lastResult || "";
        const isTransient: boolean =
            msg.includes("CORRECT") ||
            msg.includes("INCORRECT") ||
            msg.includes("TIE") ||
            msg === "SHUFFLING DECK...";

        if (isTransient) {
            game.state.lastResult = "";
        }

        if (
            game.state.mustDiscard.length === 0 &&
            game.currentPlayerIndex === 0 &&
            !isSimulating
        ) {
            window.isProcessingAction = false;
            this.setButtonsPulse(true);
        } else {
            window.isProcessingAction = true;
        }

        View.render(game);

        // Pin a contextual bubble for the human on their turn
        if (
            game.currentPlayerIndex === 0 &&
            !isSimulating &&
            !game.state.gameOver
        ) {
            if (game.state.mode === MODES.KING_BOUNTY) {
                const activeCards: number = game.players[0].hand.filter(
                    (c) => c !== null,
                ).length;
                View.showBubble(0, pickBountyReaction(activeCards), true);
            } else if (
                game.state.mode === MODES.SABOTAGE &&
                game.state.pendingSabotage
            ) {
                // intentionally empty — victim UI is handled by the SABOTAGE banner
            }
        }
    },

    async handleGameOver(game: BountyEngine): Promise<void> {
        const survivors: Player[] = game.players.filter((p) => !p.isEliminated);
        const humanPlayer = game.players[0];
        if (!humanPlayer) return;
        const isWinner: boolean = game.state.winner === humanPlayer;

        // 1. Human eliminated: Keep the turn loop running for CPUs if others remain
        if (
            humanPlayer.isEliminated &&
            survivors.length > 1 &&
            !game.state.gameOver
        ) {
            this.kickstartCPU(game);
            return;
        }

        // 2. Final Game Over sequence
        if (game.state.gameOver) {
            await sleep(TIMING.RESULT);

            if (isWinner) {
                SoundManager.play("win");
            }

            // --- FIXED: Identify Win Method for RecordManager ---
            // If the game ended via a bounty match, use BOUNTY_INSTANT
            const finalWinMethod: string = game.state.bountyWinningCard
                ? "BOUNTY_INSTANT"
                : "LAST_MAN_STANDING";

            RecordManager.updateRecords({
                ...game.gameStats,
                winMethod: finalWinMethod, // Ensure this is passed
                playerWon: isWinner,
            });

            document.body.classList.add("game-over");
            window.isProcessingAction = true;
            game.state.mode = MODES.NORMAL;

            const endBanner: string = isWinner
                ? UI_STRINGS.VICTORY_BANNER
                : UI_STRINGS.GAME_OVER_BANNER;
            game.state.lastResult = isWinner
                ? UI_STRINGS.VICTORY_MSG
                : UI_STRINGS.GAME_OVER_MSG;

            View.render(game, endBanner);

            // --- FIXED: AUTO-SHOW STATS AFTER PAUSE ---
            await sleep(TIMING.VICTORY_PAUSE);

            // We check if it exists to prevent the "Enter Name" screen error
            if (typeof View.renderStatsOverlay === "function") {
                View.renderStatsOverlay(game);
            }

            return;
        }
    },

    logMessage(game: BountyEngine, msg: string): void {
        game.state.lastResult = msg;
    },
};