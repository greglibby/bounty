import { BountyEngine } from "../core/Engine.js";
import { Director, isSimulating } from "./Director.js";
import { View } from "./View.js";
import { MODES, UI_STRINGS, TIMING } from "../constants.js";
import { JackShield } from "../specialists/JackShield.js";
import { Sabotage } from "../specialists/Sabotage.js";
import { KingBounty } from "../specialists/KingBounty.js";
import { Actions } from "../core/Actions.js";
import { SoundManager } from "../core/SoundManager.js";
import { RecordManager } from "../core/RecordManager.js";
import { AnimationManager } from "../core/AnimationManager.js";
import type { Card, CardColor, Player } from "../types/index.js";

// =============================================================================
// Local type augmentations
// =============================================================================

/**
 * BountyEngine extended with the transient CPU-loop flag that lives only in
 * the UI layer, not in the shared engine contract.
 */
type InputHandlerGame = BountyEngine & { isCPULoopRunning?: boolean };

// =============================================================================
// Global Window augmentation
// =============================================================================

declare global {
  interface Window {
    /** Mutable reference to SoundManager exposed for non-module script blocks. */
    SoundManager: typeof SoundManager;
    /** True while an animation or engine action is in progress. */
    isProcessingAction: boolean;
    /** True when a headless simulation is running (turbo mode). */
    isSimulating?: boolean;
  }
}

// Expose SoundManager globally so inline <script> blocks (avatar picker,
// settings gear) can call window.SoundManager.play() without module imports.
window.SoundManager = SoundManager;

// Unlock audio context on the very first user interaction anywhere on the page
// — covers tapping the avatar icon or gear before the Start button is pressed.
document.addEventListener(
  "pointerdown",
  function unlockAudio(): void {
    if (SoundManager.init) SoundManager.init();
    document.removeEventListener("pointerdown", unlockAudio);
  },
  { once: true },
);

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

let isConfirmingNewGame: boolean = false;
// Definite-assignment assertion: `game` is always set before any event handler
// can access it (all handlers guard with `if (!game …)` first).
let game!: InputHandlerGame;

// =============================================================================
// Settings UI
// =============================================================================

function updateSettingsUI(): void {
  const speed: string = localStorage.getItem("BOUNTY_SPEED") || "1.0";
  const diff: string = localStorage.getItem("BOUNTY_DIFFICULTY") || "NORMAL";
  const isMuted: boolean = localStorage.getItem("BOUNTY_MUTED") === "true";

  // Use the .setting-active class for Gold styling
  document.querySelectorAll<HTMLElement>("#speed-options .nav-btn").forEach((btn) => {
    btn.classList.toggle("setting-active", btn.dataset.speed === speed);
  });

  document.querySelectorAll<HTMLElement>("#diff-options .nav-btn").forEach((btn) => {
    btn.classList.toggle("setting-active", btn.dataset.diff === diff);
  });

  const soundBtn = document.getElementById("btn-toggle-sound") as HTMLElement | null;
  if (soundBtn) {
    soundBtn.textContent = `SOUND: ${isMuted ? "OFF" : "ON"}`;
    // Keeping your logic for the sound button as you liked it
    soundBtn.style.borderColor = isMuted ? "#ff4d4d" : "var(--neon)";
    soundBtn.style.color = isMuted ? "#ff4d4d" : "var(--neon)";
    soundBtn.style.background = isMuted
      ? "rgba(255, 77, 77, 0.1)"
      : "rgba(0, 255, 65, 0.1)";
  }
}

// =============================================================================
// init — attaches all event listeners
// =============================================================================

const init = (): void => {
  console.log("🚀 InputHandler: Initializing listeners...");

  // --- HOME SCREEN BUTTONS ---
  const startBtn = document.getElementById("btn-start-game");
  if (startBtn)
    startBtn.onclick = (_e: MouseEvent): void => {
      // Init audio context on first real user gesture
      if (SoundManager.init) SoundManager.init();
      SoundManager.play("menu");
      initiateGame();
    };

  const recordsBtnHome = document.getElementById("btn-records-home");
  if (recordsBtnHome) {
    recordsBtnHome.onclick = (_e: MouseEvent): void => {
      SoundManager.play("menu");
      View.renderAllTimeRecordsOverlay();
    };
  }

  const rulesBtnHome = document.getElementById("btn-rules-home");
  if (rulesBtnHome) {
    rulesBtnHome.onclick = (e: MouseEvent): void => {
      e.stopPropagation();
      SoundManager.play("menu");
      const rulesOverlay = document.getElementById("rules-overlay");
      if (rulesOverlay) rulesOverlay.style.display = "flex";
    };
  }

  const settingsBtnHome = document.getElementById("btn-settings-home");
  const settingsOverlay = document.getElementById("settings-overlay") as HTMLElement | null;

  if (settingsBtnHome) {
    settingsBtnHome.onclick = (e: MouseEvent): void => {
      e.stopPropagation();
      SoundManager.play("menu");
      settingsOverlay!.style.display = "flex";
      updateSettingsUI();
    };
  }

  if (settingsOverlay) {
    settingsOverlay.onclick = (e: MouseEvent): void => {
      if (
        !(e.target as HTMLElement).closest(".settings-container") ||
        e.target === settingsOverlay
      ) {
        SoundManager.play("menu");
        settingsOverlay.style.display = "none";
      }
    };
  }

  // Speed and Difficulty Click Listeners
  document
    .querySelectorAll<HTMLElement>("#speed-options .nav-btn, #diff-options .nav-btn")
    .forEach((btn) => {
      btn.onclick = (e: MouseEvent): void => {
        e.stopPropagation();
        SoundManager.play("menu");
        if (btn.dataset.speed) {
          localStorage.setItem("BOUNTY_SPEED", btn.dataset.speed);
        } else if (btn.dataset.diff) {
          localStorage.setItem("BOUNTY_DIFFICULTY", btn.dataset.diff);
        }
        updateSettingsUI();
      };
    });

  const soundBtn = document.getElementById("btn-toggle-sound");
  if (soundBtn) {
    soundBtn.onclick = (e: MouseEvent): void => {
      e.stopPropagation();
      const currentlyMuted: boolean =
        localStorage.getItem("BOUNTY_MUTED") === "true";
      const newMuteState: boolean = !currentlyMuted;
      localStorage.setItem("BOUNTY_MUTED", String(newMuteState));
      updateSettingsUI();
      if (!newMuteState) {
        SoundManager.play("menu");
      }
    };
  }

  // --- BOTTOM NAV & UTILITY BUTTONS ---
  const newGameBtn = document.getElementById("btn-new-game") as HTMLElement | null;
  const statsBtn = document.getElementById("btn-view-stats");
  const recordsBtnEnd = document.getElementById("btn-records");
  const rulesBtnNav = document.getElementById("btn-rules");

  if (newGameBtn) {
    newGameBtn.onclick = (e: MouseEvent): void => {
      e.stopPropagation();
      // Check if game exists and is active
      const isActive: boolean =
        document.body.classList.contains("game-active") &&
        typeof game !== "undefined" &&
        !!game &&
        !game.state.gameOver;

      if (!isConfirmingNewGame) {
        // --- PHASE 1: User clicks "END GAME" ---
        isConfirmingNewGame = true;
        SoundManager.play("menuEnd"); // Plays menu-end-game.wav
        newGameBtn.textContent = "CONFIRM?";
        newGameBtn.classList.add("confirming");

        setTimeout(() => {
          if (isConfirmingNewGame) {
            isConfirmingNewGame = false;
            newGameBtn.textContent = isActive ? "END GAME" : "NEW GAME";
            newGameBtn.classList.remove("confirming");
          }
        }, 3000);
      } else {
        // --- PHASE 2: CONFIRMED (GO HOME) ---
        isConfirmingNewGame = false;

        // TRIGGER: Play normal menu sound immediately on click
        SoundManager.play("menu");

        // 100ms Delay: Allow the sound to initialize before the page reloads
        setTimeout(() => {
          // 1. Force stop any background loops
          window.isProcessingAction = false;
          if (typeof game !== "undefined" && game && game.state) {
            game.state.gameOver = true;
          }

          // 2. Hide everything immediately
          document.body.classList.remove("game-active", "game-over");

          // 3. Clear overlays
          (["stats-overlay", "records-overlay", "rules-overlay"] as const).forEach(
            (id) => {
              const el = document.getElementById(id);
              if (el) {
                if (id === "rules-overlay") {
                  el.style.display = "none";
                } else {
                  el.remove();
                }
              }
            },
          );

          // 4. Hard Reset to Home Screen
          location.reload();
        }, 100);
      }
    };
  }

  const settingsBtnNav = document.getElementById("btn-settings-nav");

  if (settingsBtnNav) {
    settingsBtnNav.onclick = (e: MouseEvent): void => {
      e.stopPropagation();
      SoundManager.play("menu");
      settingsOverlay!.style.display = "flex";
      updateSettingsUI();
    };
  }

  if (statsBtn) {
    statsBtn.onclick = (_e: MouseEvent): void => {
      SoundManager.play("menu");
      if (game) View.renderStatsOverlay(game);
    };
  }

  if (recordsBtnEnd) {
    recordsBtnEnd.onclick = (_e: MouseEvent): void => {
      SoundManager.play("menu");
      View.renderAllTimeRecordsOverlay();
    };
  }

  if (rulesBtnNav) {
    rulesBtnNav.onclick = (e: MouseEvent): void => {
      e.stopPropagation();
      SoundManager.play("menu");
      const rulesOverlay = document.getElementById("rules-overlay");
      if (rulesOverlay) rulesOverlay.style.display = "flex";
    };
  }

  const rulesOverlay = document.getElementById("rules-overlay");
  if (rulesOverlay) {
    rulesOverlay.onclick = (_e: MouseEvent): void => {
      SoundManager.play("menu");
      rulesOverlay.style.display = "none";
    };
  }

  // --- UNIFIED INTERACTION HANDLER ---
  document.addEventListener("click", async (e: MouseEvent): Promise<void> => {
    // 1. Guard against overlapping actions and unauthorized turn input
    // Combined check: Logical (is it your turn?) and Physical (is an animation running?)
    if (!game || !game.canAcceptInput || window.isProcessingAction) return;

    // 2. Identify Targets
    const actionBtn = (e.target as HTMLElement).closest<HTMLElement>(".btn-hl");
    const cardSlot = (e.target as HTMLElement).closest<HTMLElement>(".card-slot");

    // Ignore clicks on utility/nav buttons (already handled by direct onclicks)
    if (
      (e.target as HTMLElement).closest(".nav-btn") ||
      (e.target as HTMLElement).closest(".menu-btn")
    ) return;
    if (game.state.isCeremony) return;

    // 3. Handle Action Buttons (Higher, Lower, Suit, Color, Accept, Decline)
    if (actionBtn) {
      // THE FIX: Move the Sound trigger ABOVE the data attribute check
      // to ensure Accept/Decline (which may use different dataset keys) also beep.
      SoundManager.play("action");

      // IMMEDIATELY stop the wiggle when clicked
      Director.setButtonsPulse(false);

      const choice: string | undefined =
        actionBtn.dataset.theme || actionBtn.dataset.guess;
      if (choice) {
        window.isProcessingAction = true;
        View.render(game);

        await Director.playTurn(game, choice);
        return;
      }
    }

    // 4. Handle Card Slot Interactions
    if (cardSlot) {
      const player: Player = game.players[game.currentPlayerIndex];
      // FIX: Identify the human as the player at index 0
      if (!player || game.currentPlayerIndex !== 0) return;

      const slotIndex: number = parseInt(cardSlot.dataset.index ?? "", 10);
      if (isNaN(slotIndex)) return;

      // PHASE A: Discard Mode
      if (game.state.mustDiscard.length > 0) {
        if (cardSlot.classList.contains("discardable")) {
          // 1. Capture the card object BEFORE the engine removes it from the hand
          const cardToDiscard: Card | null = player.hand[slotIndex];

          if (game.processDiscard(slotIndex)) {
            // 2. Hand over control to Director for the FLIP animation sequence
            if (Director.resolveHumanDiscard) {
              const resolve = Director.resolveHumanDiscard;
              Director.resolveHumanDiscard = null;
              // Pass the index and card so AnimationManager can do its math
              resolve({ index: slotIndex, card: cardToDiscard });
            } else {
              // Fallback just in case the Director loop isn't actively awaiting
              View.render(game);
            }
          }
        }
        return;
      }

      // PHASE B: Specialist Hand Actions (Jacks/4s)
      if (cardSlot.classList.contains("playable")) {
        window.isProcessingAction = true; // Lock UI for cinematic
        SoundManager.play("action");
        Director.setButtonsPulse(false);
        View.render(game); // Immediately drop the "playable" UI

        if (
          cardSlot.classList.contains("shield-card") ||
          cardSlot.classList.contains("sabotage-card")
        ) {
          // 1. Capture the bounding rect BEFORE Director removes it
          const img = cardSlot.querySelector<HTMLElement>(".card-img");
          const startRect: DOMRect | null = img
            ? img.getBoundingClientRect()
            : null;
          const cardObj: Card | null = player.hand[slotIndex];

          // 2. Fire the Director action (which places the card in the pile)
          const actionPromise: Promise<void> = Director.handleHandAction(
            game,
            slotIndex,
            player
          );

          // 3. Delay animation slightly so Director can render the target card
          //    in the discard pile first
          setTimeout(() => {
            AnimationManager.flyHandToDiscard(startRect!, cardObj!);
          }, 50);

          await actionPromise;
        } else {
          window.isProcessingAction = false;
        }
      }
    }
  });
};

// =============================================================================
// initiateGame
// =============================================================================

async function initiateGame(): Promise<void> {
  // 1. If a game is already running, force it to end to stop background loops
  if (game) game.state.gameOver = true;

  // 2. Reset the master UI classes for a fresh session
  document.body.classList.remove("game-over");
  document.body.classList.add("game-active");

  // PERSISTENCE: Retrieve the saved name
  const savedName: string =
    localStorage.getItem("BOUNTY_PLAYER_NAME") || "PLAYER 1";

  // 3. Initialize Engine with the captured name
  game = new BountyEngine(savedName) as InputHandlerGame;
  initDebugKeys(game);

  // 5. Start the cinematic opening sequence
  await Director.playOpeningCeremony(game);

  // 6. Handle turn initiation
  const isHumanTurn: boolean = game.currentPlayerIndex === 0;
  if (!isHumanTurn || isSimulating) {
    playCPUTurns();
  } else {
    Director.setButtonsPulse(true);
  }
}

// =============================================================================
// playCPUTurns
// =============================================================================

export async function playCPUTurns(): Promise<void> {
  if (game.isCPULoopRunning) return;
  game.isCPULoopRunning = true;

  while (game && !game.state.gameOver) {
    const player: Player = game.players[game.currentPlayerIndex];

    // 1. Safety Guard for eliminated players or invalid turns
    if (!player || player.isEliminated) {
      game.nextTurn();
      continue;
    }

    // 2. THE HUMAN CHECK (Position-based identification)
    // If current index is 0 and we aren't in simulation mode, stop and wait for input.
    // This works regardless of what the player's .name property is.
    if (game.currentPlayerIndex === 0 && !isSimulating) {
      game.isCPULoopRunning = false;

      // TRIGGER: Human's turn, buttons should now wiggle
      Director.setButtonsPulse(true);

      return;
    }

    // 3. Thinking Pause (Respects custom speed settings)
    if (!isSimulating) {
      window.isProcessingAction = false;
      View.render(game);
      const speedMultiplier: number =
        parseFloat(localStorage.getItem("BOUNTY_SPEED") ?? "") || 1.0;
      await sleep(500 * speedMultiplier);
    }

    game.syncGameState();

    // --- HIGH PRIORITY DISCARD HANDLING ---
    // Forces the CPU to resolve discards/combos before attempting any actions.
    if (
      game.state.mode === MODES.DISCARD ||
      game.state.mustDiscard.length > 0
    ) {
      const indicesToDiscard: number[] = [...game.state.mustDiscard];

      for (const cardIdx of indicesToDiscard) {
        // Handle wildcard (-1) from Ties/Lucky 7 or specific indices from Combos
        const targetIdx: number =
          cardIdx === -1
            ? player.hand.findIndex((c) => c !== null)
            : cardIdx;

        if (targetIdx !== -1) {
          game.processDiscard(targetIdx);
          View.render(game);

          if (!isSimulating) {
            await sleep(TIMING.DISCARD_PAUSE);
          }
        }
      }

      // If we still need to discard more (e.g. sequence of combos), restart loop
      if (game.state.mustDiscard.length > 0) continue;

      // If discards are cleared, check if turn should end or continue to guessing
      if (player.hand.filter((c) => c !== null).length >= 4) {
        game.nextTurn();
        continue;
      }
    }

    const mode: string = game.state.mode;
    const hand: Card[] = player.hand.filter((c): c is Card => c !== null);
    let strategicChoice: string = "";

    // 4. PRIORITY: HAND ACTIONS (Jacks/4s)
    if (
      mode === MODES.NORMAL ||
      mode === MODES.LUCKY_7 ||
      // @ts-ignore — MODES.ACE_STREAK does not exist in the current constants;
      // this branch is leftover from an earlier design and is never reached.
      mode === MODES.ACE_STREAK
    ) {
      const sabotageIdx: number = player.hand.findIndex((c) => c?.rank === 4);
      if (sabotageIdx !== -1) {
        window.isProcessingAction = true; // Lock UI
        View.render(game); // Immediately drop the "playable" fanned-out UI

        const slot = document.querySelector<HTMLElement>(
          `#player-${game.currentPlayerIndex} .card-slot[data-index="${sabotageIdx}"] .card-img`
        );
        const startRect: DOMRect | null = slot
          ? slot.getBoundingClientRect()
          : null;
        const cardObj: Card | null = player.hand[sabotageIdx];

        const actionPromise: Promise<void> = Director.handleHandAction(
          game,
          sabotageIdx,
          player
        );
        if (!isSimulating && startRect) {
          setTimeout(() => {
            AnimationManager.flyHandToDiscard(startRect, cardObj!);
          }, 50);
        }
        await actionPromise;
        continue;
      }

      const shieldIdx: number = player.hand.findIndex((c) => c?.rank === 11);
      if (shieldIdx !== -1 && hand.length >= 2) {
        window.isProcessingAction = true; // Lock UI
        View.render(game); // Immediately drop the "playable" fanned-out UI

        const slot = document.querySelector<HTMLElement>(
          `#player-${game.currentPlayerIndex} .card-slot[data-index="${shieldIdx}"] .card-img`
        );
        const startRect: DOMRect | null = slot
          ? slot.getBoundingClientRect()
          : null;
        const cardObj: Card | null = player.hand[shieldIdx];

        const actionPromise: Promise<void> = Director.handleHandAction(
          game,
          shieldIdx,
          player
        );
        if (!isSimulating && startRect) {
          setTimeout(() => {
            AnimationManager.flyHandToDiscard(startRect, cardObj!);
          }, 50);
        }
        await actionPromise;
        continue;
      }
    }

    // 5. MODE LOGIC: Identify the correct "Button" to push via Specialist Logic
    if (mode === MODES.SABOTAGE) {
      const colors: CardColor[] = ["Yellow", "Red", "Blue", "Green"];
      strategicChoice = colors[Math.floor(Math.random() * colors.length)];
    } else if (mode === MODES.QUEEN_SOCIAL) {
      strategicChoice = getCPUSocialChoice();
    } else if (mode === MODES.KING_BOUNTY) {
      strategicChoice = evaluateCPUBounty(game, player);
    } else {
      strategicChoice = getCPUStandardGuess(game.upCard!.rank);
    }

    // 6. EXECUTE THE TURN
    window.isProcessingAction = true; // Lock UI
    View.render(game); // Instantly drop the UI upon committing to a guess

    // --- SURGICAL FIX: CPU Guessing Pause ---
    // Force the CPU to visually announce its guess and wait BEFORE the card deals
    if (!isSimulating) {
      View.showBubble(game.currentPlayerIndex, strategicChoice, false);
      const speedMultiplier: number =
        parseFloat(localStorage.getItem("BOUNTY_SPEED") ?? "") || 1.0;
      await sleep(TIMING.THINKING * speedMultiplier);
    }

    await Director.playTurn(game, strategicChoice);

    if (game.state.gameOver) break;
  }

  game.isCPULoopRunning = false;
}

// =============================================================================
// CPU decision helpers
// =============================================================================

function evaluateCPUBounty(game: InputHandlerGame, player: Player): string {
  const hand: Card[] = player.hand.filter((c): c is Card => c !== null);
  const others: Player[] = game.players.filter(
    (p) => p !== player && !p.isEliminated
  );
  const otherHandSizes: number[] = others.map(
    (p) => p.hand.filter((c) => c !== null).length,
  );

  // Strategy for 1 card: Accept unless all others have 0 cards
  if (hand.length === 1) {
    const allOthersEmpty: boolean = otherHandSizes.every((size) => size === 0);
    return allOthersEmpty ? "DECLINE" : "ACCEPT";
  }

  // Strategy for 2 cards: Do not accept if all others have <= 1 card
  if (hand.length === 2) {
    const allOthersLow: boolean = otherHandSizes.every((size) => size <= 1);
    return allOthersLow ? "DECLINE" : "ACCEPT";
  }

  // Strategy for 3 cards: Do not accept unless 1 player left and they have a 4
  if (hand.length === 3) {
    if (others.length === 1) {
      const hasSabotage: boolean = others[0].hand.some((c) => c?.rank === 4);
      return hasSabotage ? "ACCEPT" : "DECLINE";
    }
    return "DECLINE";
  }

  return "DECLINE";
}

function getCPUStandardGuess(rank: number): string {
  const difficulty: string =
    localStorage.getItem("BOUNTY_DIFFICULTY") || "NORMAL";

  // 1. EASY: Simplified Range Logic
  if (difficulty === "EASY") {
    if (rank <= 4) return "higher"; // Guess Higher on A-4
    if (rank >= 10) return "lower"; // Guess Lower on 10-K
    return Math.random() < 0.5 ? "higher" : "lower"; // Random on 5-9
  }

  // 2. HARD: Probabilistic "Card Counter"
  if (difficulty === "HARD" && game) {
    const cardsInHands: Card[] = [];
    game.players.forEach((p) =>
      cardsInHands.push(...p.hand.filter((c): c is Card => c !== null)),
    );

    // Hard mode "remembers" everything currently visible on the table
    const knownCards: (Card | null)[] = [
      ...cardsInHands,
      game.upCard,
      ...game.discardPile,
    ];

    let higherPossible: number = 0;
    let lowerPossible: number = 0;

    // Calculate remaining cards in a standard 52-card deck
    for (let r = 1; r <= 13; r++) {
      // Count how many of this rank are already accounted for
      const countKnownOfRank: number = knownCards.filter(
        (k) => k !== null && (k as Card).rank === r
      ).length;
      const remainingOfRank: number = 4 - countKnownOfRank;

      if (r > rank) higherPossible += remainingOfRank;
      if (r < rank) lowerPossible += remainingOfRank;
    }

    // Choose the side with the higher mathematical probability
    if (higherPossible === lowerPossible)
      return Math.random() < 0.5 ? "higher" : "lower";
    return higherPossible > lowerPossible ? "higher" : "lower";
  }

  // 3. NORMAL: Standard Threshold Logic
  if (rank <= 6) return "higher";
  if (rank >= 8) return "lower";
  return Math.random() < 0.5 ? "higher" : "lower";
}

function getCPUSocialChoice(): CardColor {
  const colors: CardColor[] = ["Yellow", "Red", "Blue", "Green"];
  return colors[Math.floor(Math.random() * colors.length)];
}

// =============================================================================
// Debug key bindings
// =============================================================================

const initDebugKeys = (game: InputHandlerGame): void => {
  document.addEventListener("keydown", async (e: KeyboardEvent): Promise<void> => {
    if (!game || game.state.isCeremony) return;

    // --- FORCE LUCKY 7 ON TABLE (Press '7') ---
    if (e.key === "7") {
      console.log("🛠️ Debug: Forcing Lucky 7 Challenge...");
      const debugSeven: Card = { rank: 7, color: "Yellow" };
      Actions.updateUpCard(game, debugSeven);
      game.state.mode = "LUCKY_7";
      game.state.lastResult = "DISCARD 1 ON SUCCESS";
      View.render(game);
    }

    // --- FORCE TRIPLE MODE (Press 'T') ---
    if (e.key === "t" || e.key === "T") {
      console.log("🛠️ Debug: Forcing Triple Challenge...");
      const debugThree: Card = { rank: 3, color: "Yellow" };
      Actions.updateUpCard(game, debugThree);
      game.state.mode = "TRIPLE";
      game.state.streakCount = 0;
      // @ts-ignore — tripleProgress is a debug-only field not in GameState
      game.state.tripleProgress = null;
      const label = document.getElementById("special-label");
      if (label) label.textContent = "TRIPLE (1/3)";
      game.state.lastResult = "3 CORRECT GUESSES TO WIN";
      View.render(game);
    }

    // --- FORCE FLUSH-STRAIGHT COMBO (Press 'f') ---
    if (e.key.toLowerCase() === "f") {
      console.log("🛠️ Debug: Forcing 5-6-7 Flush-Straights for all players...");

      const colors: CardColor[] = ["Red", "Blue", "Green", "Yellow"];

      game.players.forEach((player, index) => {
        const color: CardColor = colors[index] || "Red";
        player.hand = [
          { rank: 5, color: color },
          { rank: 6, color: color },
          { rank: 7, color: color },
          null,
        ];
        console.log(`Configured ${player.name} with 5-6-7 in ${color}`);
      });

      View.render(game);
      game.state.lastResult = "DEBUG: ALL PLAYERS GIVEN COMBO";
    }

    // --- GIVE SELF RANDOM CARD (Press 'z') ---
    if (e.key.toLowerCase() === "z") {
      console.log("🛠️ Debug: Adding random card to human hand...");
      const player: Player = game.players[0];

      if (player.hand.filter((c) => c !== null).length < 4) {
        const ranks: number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
        const colors: CardColor[] = ["Red", "Blue", "Green", "Yellow"];
        const randomCard: Card = {
          rank: ranks[Math.floor(Math.random() * ranks.length)],
          color: colors[Math.floor(Math.random() * colors.length)],
        };

        const emptyIdx: number = player.hand.indexOf(null);
        if (emptyIdx !== -1) {
          player.hand[emptyIdx] = randomCard;
        } else {
          player.hand.push(randomCard);
        }

        View.render(game);

        if (game.checkElimination(player)) {
          Director.handleGameOver(game);
        }
      } else {
        console.warn("Hand is already full!");
      }
    }

    // --- SIMULATION MODE (Press 's') ---
    if (e.key.toLowerCase() === "s") {
      console.log("🚀 Debug: Starting Full Simulation...");
      window.isSimulating = true;
      Director.setSimulationMode(true);

      if (!document.body.classList.contains("game-active")) {
        await initiateGame();
      } else {
        playCPUTurns();
      }
    }

    // --- INSTANT WIN (Press 'w') ---
    if (e.key.toLowerCase() === "w") {
      console.log("🛠️ Debug: Forcing Instant Win...");
      game.players.forEach((p, index) => {
        if (index !== 0) p.isEliminated = true;
      });
      game.state.winner = game.players[0];
      game.state.gameOver = true;
      game.gameOver = true;
      Director.handleGameOver(game);
    }

    // --- FORCE KING BOUNTY CHALLENGE (Press 'b') ---
    if (e.key.toLowerCase() === "b") {
      console.log("🛠️ Debug: Forcing King Bounty Challenge...");
      const debugKing: Card = { rank: 13, color: "Yellow" };
      Actions.updateUpCard(game, debugKing);
      game.state.mode = MODES.KING_BOUNTY;
      game.state.bountyProcessed = false;
      game.state.lastResult = UI_STRINGS.KING_BOUNTY_INSTRUCTION;
      View.render(game);
    }

    // --- RANDOM CPU HANDS (Press 'x') ---
    if (e.key.toLowerCase() === "x") {
      console.log("🛠️ Debug: Adding random cards to all CPUs...");
      game.players.forEach((player, index) => {
        if (index === 0) return;
        if (player.hand.filter((c) => c !== null).length < 4) {
          const ranks: number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
          const colors: CardColor[] = ["Red", "Blue", "Green", "Yellow"];
          const randomCard: Card = {
            rank: ranks[Math.floor(Math.random() * ranks.length)],
            color: colors[Math.floor(Math.random() * colors.length)],
          };
          const emptyIdx: number = player.hand.indexOf(null);
          if (emptyIdx !== -1) player.hand[emptyIdx] = randomCard;
          else player.hand.push(randomCard);
        }
      });
      View.render(game);
    }

    // --- GIVE SELF RANK 4 / SABOTAGE (Press '4') ---
    if (e.key === "4") {
      const player: Player = game.players[0];
      const emptyIdx: number = player.hand.indexOf(null);
      const debugCard: Card = { rank: 4, color: "Red" };
      if (emptyIdx !== -1) player.hand[emptyIdx] = debugCard;
      else if (player.hand.length < 4) player.hand.push(debugCard);
      View.render(game);
    }

    // --- GIVE EMMA RANK 4 / SABOTAGE (Press '5') ---
    if (e.key === "5") {
      const emma: Player = game.players[3];
      const emptyIdx: number = emma.hand.indexOf(null);
      const debugCard: Card = { rank: 4, color: "Green" };
      if (emptyIdx !== -1) emma.hand[emptyIdx] = debugCard;
      else if (emma.hand.length < 4) emma.hand.push(debugCard);
      View.render(game);
    }

    // --- GIVE SELF JACK / SHIELD (Press 'j') ---
    if (e.key.toLowerCase() === "j") {
      const player: Player = game.players[0];
      const emptyIdx: number = player.hand.indexOf(null);
      const debugCard: Card = { rank: 11, color: "Blue" };
      if (emptyIdx !== -1) player.hand[emptyIdx] = debugCard;
      else if (player.hand.length < 4) player.hand.push(debugCard);
      View.render(game);
    }

    // --- GIVE EMMA JACK / SHIELD (Press 'k') ---
    if (e.key.toLowerCase() === "k") {
      const emma: Player = game.players[3];
      const emptyIdx: number = emma.hand.indexOf(null);
      const debugCard: Card = { rank: 11, color: "Yellow" };
      if (emptyIdx !== -1) emma.hand[emptyIdx] = debugCard;
      else if (emma.hand.length < 4) emma.hand.push(debugCard);
      View.render(game);
    }

    // --- FORCE QUEEN SOCIAL ROUND ON TABLE (Press 'q') ---
    if (e.key.toLowerCase() === "q") {
      console.log("🛠️ Debug: Forcing Queen Social Round...");
      const debugQueen: Card = { rank: 12, color: "Red" };
      game.upCard = debugQueen;
      game.state.mode = "QUEEN_SOCIAL";
      game.state.socialTheme = null;
      game.state.socialOriginator = -1;
      game.state.socialRoundCount = 0;
      game.state.lastResult = "Social Round Start!";
      View.render(game);
    }
  });
};

// =============================================================================
// Bootstrap
// =============================================================================

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}