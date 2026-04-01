import { Director } from "./Director.js";
import { MODES, RANK_LABELS, UI_STRINGS, STREWN_CONFIG, FormatCard } from "../constants.js";
import { RecordManager } from "../core/RecordManager.js";
import { SoundManager } from "../core/SoundManager.js";
import type { Card, CardColor, GameMode, GameState, Player, GameStats, RankAccuracyStat, IGameEngine, StrewnMetadata } from "../types/index.js";
import { getCardImage, deckImage } from "../assets/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Window augmentation — runtime flags set by Director / Engine
// ─────────────────────────────────────────────────────────────────────────────

declare global {
  interface Window {
    isSimulating?: boolean;
    isProcessingAction: boolean;
  }
  interface HTMLElement {
    _clearTimer?: ReturnType<typeof setTimeout> | null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Local types
// ─────────────────────────────────────────────────────────────────────────────

/** Strewn metadata as used inside View (rot can be a number or string key). */
interface StrewnMeta {
  rot: number | string;
  offset: string;
}

/**
 * GameState extended with the transient field added by the engine at runtime.
 * `lastFlippedCard` is not part of the shared GameState contract but View reads it.
 */
interface ViewGameState extends GameState {
  lastFlippedCard?: Card | null;
}

/** The shape of the game object the View consumes. */
interface ViewGame extends Omit<IGameEngine, "state"> {
  state: ViewGameState;
}

/** Shape returned by RecordManager.getRecords(). */
interface SpecialistHighs {
  ace: number;
  lucky7: number;
  queen: number;
  bounty: number;
  sabotage: number;
  shield: number;
}

interface ComboCounts {
  pair: number;
  straight: number;
  flush: number;
}

interface SubStats {
  aceSuccess: { attempts: number; success: number };
  lucky7Success: { attempts: number; success: number };
  queenGuessAccuracy: { attempts: number; success: number };
  queenRoundLength: { totalRounds: number; totalGuesses: number; low: number | null; high: number };
  bountyInstant: { totalAccepted: number; success: number };
  bountyDeclined: { high: number; total: number };
  sabotageCleared: { attempts: number; success: number };
  [key: string]: unknown;
}

interface GameRecords {
  longestGameTurns: number;
  shortestGameTurns: number;
  shortestGameRounds: number;
  mostRounds: number;
  totalGamesPlayed: number;
  gamesWon: number;
  totalTurnsAllTime: number;
  totalRoundsAllTime: number;
  mostSpecialistsInOneGame: SpecialistHighs;
  lowSpecialists: SpecialistHighs;
  totalSpecialistCounts: SpecialistHighs;
  mostCombosInOneGame: ComboCounts;
  lowCombosInOneGame: ComboCounts;
  totalComboCounts: ComboCounts;
  subStats: SubStats;
  rankAccuracyAllTime: Array<{ correct?: number; incorrect?: number }>;
  eliminationCauses: Record<string, number>;
  winMethods: { LAST_MAN_STANDING: number; BOUNTY_INSTANT: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// STREWN_LOOKUP
// ─────────────────────────────────────────────────────────────────────────────

const STREWN_LOOKUP: {
  rotation: Record<number, number>;
  offset: Record<string, { x: number; y: number }>;
} = {
  rotation: {
    1: -35, // Slightly pushed past -30
    2: -26, // Messy intermediate
    3: 0,   // Dead straight (Kept for the first card)
    4: -19,  // Slightly pushed past 30
    5: 34, // Slight tilt left
    6: 18,   // Very slight tilt right
    7: 27, // Aggressive mid-left
    8: -8,  // Aggressive mid-right
    9: 9,   // Slight tilt left
  },
  offset: {
    A: { x: 0, y: 0 },    // Dead center
    B: { x: 0, y: -11 },  // Top
    C: { x: 10, y: 0 },   // Right (Kept exactly as (10,0) so your first card logic stays consistent)
    D: { x: 0, y: 11 },   // Bottom
    E: { x: -11, y: 0 },  // Left
    F: { x: 8, y: 8 },    // Bottom-Right diagonal
    G: { x: -8, y: -7 },  // Top-Left diagonal
    H: { x: 7, y: -9 },   // Top-Right diagonal
    I: { x: -8, y: 9 }    // Bottom-Left diagonal
  }
};

export const View = {
  render(game: ViewGame, overrideBanner: string | null = null): void {
    if (!document.body.classList.contains("game-active")) {
      document.body.classList.add("game-active");
    }

    this.updateModeStyles(game.state.mode);

    // 1. NEW DRAW PILE (Dynamic Depletion)
    this.renderDrawPile(game);

    // 2. NEW DISCARD PILE (Registry View)
    // This now looks at the actual array instead of being "empty"
    this.renderDiscardPile(game);

    // 5. REST OF UI
    this.renderPlayers(game.players, game.currentPlayerIndex, game);
    this.renderMessageCenter(game, null, overrideBanner);
    this.renderControls(game.state.mode, game.players[game.currentPlayerIndex]!, game.state, game);
    this.updateDangerMeter(game);
  },

  renderDiscardPile(game: ViewGame): void {
    const container = document.getElementById("discard-pile-slot");
    if (!container) return;

    const history = game.discardPile || [];

    // 1. Remove the temporary transient card if it exists
    const oldTempTransient = container.querySelector(".transient-card-temp");
    if (oldTempTransient) oldTempTransient.remove();

    // Remove the ID from any history cards from the previous turn
    const oldTransientId = document.getElementById("transient-card");
    if (oldTransientId) oldTransientId.removeAttribute("id");

    let existingCards: NodeListOf<Element> | Element[] =
      container.querySelectorAll(".strewn-card:not(.transient-card-temp)");
    if (history.length < existingCards.length || history.length === 0) {
      container.innerHTML = "";
      existingCards = [];
    }

    // 2. SMART RENDER: Persistent History
    for (let i = existingCards.length; i < history.length; i++) {
      const card = history[i];
      if (!card) continue;                     // ← add this guard
      if (!card._strewn) {
        const prevCard = i > 0 ? history[i - 1] ?? null : null;  // ← ?? null
        card._strewn = this.generateStrewnMeta(prevCard);
      }
      const cardEl = this.createStrewnCardElement(card, i);
      container.appendChild(cardEl);
    }

    // 3. Transient Sync
    const transientCard = game.state.lastFlippedCard || (game.state.gameOver ? game.state.bountyWinningCard : null);

    if (transientCard) {
      const historyIndex = history.indexOf(transientCard);

      if (historyIndex !== -1) {
        // It's already in the pile (Tie/Correct)! Tag the existing DOM element so it can be animated.
        const existingEls = container.querySelectorAll(".strewn-card:not(.transient-card-temp)");
        if (existingEls[historyIndex]) {
          existingEls[historyIndex].id = "transient-card";
        }
      } else {
        // It's NOT in the pile (Incorrect). Create a temporary one that floats above.
        if (!transientCard._strewn) {
          const prevCard = history.length > 0 ? history[history.length - 1] : null;
          transientCard._strewn = this.generateStrewnMeta(prevCard);
        }

        const transientEl = this.createStrewnCardElement(transientCard, history.length);
        transientEl.id = "transient-card";
        transientEl.classList.add("transient-card-temp"); // Mark as temp so it cleans up safely

        if (game.state.gameOver && game.state.bountyWinningCard === transientCard) {
          transientEl.classList.add("bounty-match");
        }

        container.appendChild(transientEl);
      }
    }
  },

  createStrewnCardElement(card: Card, index: number): HTMLDivElement {
    const el = document.createElement("div");
    el.className = "card-slot filled strewn-card";

    // Z-Index ensures chronological layering
    el.style.zIndex = String(index);

    const meta = card._strewn || { rot: 3, offset: "A" };
    const deg = STREWN_LOOKUP.rotation[meta.rot] || 0;
    const pos = STREWN_LOOKUP.offset[meta.offset] || { x: 0, y: 0 };

    // GPU-Accelerated Transform String
    el.style.transform = `translate(${pos.x}px, ${pos.y}px) rotate(${deg}deg)`;

    // Card Image
    const imgPath = this.getCardImagePath(card);
    el.innerHTML = `<img src="${imgPath}" class="card-img" draggable="false" />`;

    return el;
  },

  generateStrewnMeta(prevCard: Card | null | undefined): StrewnMetadata {
    const rotKeys = Object.keys(STREWN_LOOKUP.rotation);
    const offKeys = Object.keys(STREWN_LOOKUP.offset);

    if (!prevCard || !prevCard._strewn) {
      return { rot: 1, offset: 'A' };          // number literal, not string
    }

    let rot: string | undefined;
    let offset: string | undefined;

    const prevRot = String(prevCard._strewn.rot);   // compare as strings
    do {
      rot = rotKeys[Math.floor(Math.random() * rotKeys.length)];
    } while (rotKeys.length > 1 && rot === prevRot);

    do {
      offset = offKeys[Math.floor(Math.random() * offKeys.length)];
    } while (offKeys.length > 1 && offset === prevCard._strewn.offset);

    return { rot: Number(rot ?? '1'), offset: offset ?? 'A' };
  },

  renderDrawPile(game: ViewGame): void {
    const container = document.getElementById("draw-pile-slot");
    if (!container) return;

    const count = game.deck ? game.deck.length : 0;

    // 1. Handle Empty State
    if (count === 0) {
      if (!container.classList.contains("empty")) {
        container.classList.add("empty");
        container.innerHTML = `<span class="draw-pile-empty-label" style="position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); font-size:10px; opacity:0.5; color:white;">EMPTY</span>`;
      }
      return;
    }

    // 2. If it was previously empty, clear the text so we can build the pile
    if (container.classList.contains("empty")) {
      container.classList.remove("empty");
      container.innerHTML = "";
    }

    let img = container.querySelector<HTMLImageElement>(".draw-pile-img");
    if (!img) {
      const newImg = document.createElement("img");
      newImg.className = "draw-pile-img";
      newImg.draggable = false;
      container.appendChild(newImg);
      img = newImg;
    }
    if (!img.src.endsWith("Deck.png")) {
img.src = deckImage;
    }

    // 4. SMART RENDER: Update the Badge only if the exact count changed
    let badge = container.querySelector(".draw-pile-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "draw-pile-badge";
      container.appendChild(badge);
    }

    if (badge.textContent !== String(count)) {
      badge.textContent = String(count);
    }
  },

  updateModeStyles(mode: GameMode | string): void {
    // THE DEADBOLT: If the game is over, do not touch classes or CSS variables.
    if (
      document.body.classList.contains("mode-endgame") ||
      mode === "GAME_OVER"
    ) {
      return;
    }

    // 1. PURGE ALL PREVIOUS MODE CLASSES
    const modeClasses = [
      "mode-normal",
      "mode-discard",
      "mode-queen_social",
      "mode-sabotage",
      "mode-shield",
      "mode-lucky_7",
      "mode-triple",
      "mode-ceremony",
      "mode-king_bounty",
    ];
    document.body.classList.remove(...modeClasses);

    // 2. APPLY NEW CLASS
    let cssMode = mode.toLowerCase().replace(" ", "_");
    if (mode === MODES.SABOTAGE) cssMode = "sabotage";
    if (mode === "JACK SHIELD" || mode === MODES.SHIELD) cssMode = "shield";

    document.body.classList.add(`mode-${cssMode}`);

    // 3. EXPLICIT COLOR MAPPING
    // We overwrite these variables every time to prevent property inheritance.
    switch (mode) {
      case MODES.NORMAL:
        document.documentElement.style.setProperty("--mode-color", "#00ff41"); // Neon Green
        document.documentElement.style.setProperty(
          "--mode-bg",
          "rgba(0, 255, 65, 0.15)",
        );
        break;

      case MODES.QUEEN_SOCIAL:
        document.documentElement.style.setProperty("--mode-color", "#00fbff"); // Cyan
        document.documentElement.style.setProperty(
          "--mode-bg",
          "rgba(0, 251, 255, 0.15)",
        );
        break;

      case MODES.DISCARD:
        document.documentElement.style.setProperty("--mode-color", "#ff9100"); // Orange
        document.documentElement.style.setProperty(
          "--mode-bg",
          "rgba(255, 145, 0, 0.15)",
        );
        break;

      case MODES.SABOTAGE:
        // TRIGGERS RED NEON THEME
        document.documentElement.style.setProperty("--mode-color", "#ff4d4d"); // Red
        document.documentElement.style.setProperty(
          "--mode-bg",
          "rgba(255, 77, 77, 0.15)",
        );
        break;

      case MODES.LUCKY_7:
        document.documentElement.style.setProperty("--mode-color", "#ff00ff"); // Magenta
        document.documentElement.style.setProperty(
          "--mode-bg",
          "rgba(255, 0, 255, 0.15)",
        );
        break;

      case MODES.TRIPLE:
        document.documentElement.style.setProperty("--mode-color", "#f0f0f0");
        document.documentElement.style.setProperty(
          "--mode-bg",
          "rgba(240, 240, 240, 0.2)",
        );
        break;

      case MODES.KING_BOUNTY:
        document.documentElement.style.setProperty("--mode-color", "#ffd700"); // Gold
        document.documentElement.style.setProperty(
          "--mode-bg",
          "rgba(255, 215, 0, 0.15)",
        );
        break;

      case MODES.CEREMONY:
        document.documentElement.style.setProperty("--mode-color", "#bbbbbb"); // Grey/Silver
        document.documentElement.style.setProperty(
          "--mode-bg",
          "rgba(187, 187, 187, 0.15)",
        );
        break;

      default:
        // Fallback for any undefined modes to Neon Green
        document.documentElement.style.setProperty("--mode-color", "#00ff41");
        document.documentElement.style.setProperty(
          "--mode-bg",
          "rgba(0, 255, 65, 0.15)",
        );
        break;
    }
  },

  renderPlayers(players: Player[], activeIndex: number, game: ViewGame): void {
    const mode = game.state.mode;
    const isDiscarding = game.state.mustDiscard.length > 0;
    const isStandardGuessingMode = (["NORMAL", "LUCKY_7", "TRIPLE", "ACE_STREAK"] as string[]).includes(mode as string);

    players.forEach((player, pIdx) => {
      const box = document.getElementById(`player-${pIdx}`);
      if (!box) return;

      box.classList.toggle("active", pIdx === activeIndex);
      box.classList.toggle("eliminated", !!player.isEliminated);

      const nameEl = box.querySelector(".player-name");
      if (nameEl) nameEl.textContent = player.name;

      const CPU_AVATARS: Record<string, string> = {
        charlie: "images/Avatars/Charlie.png",
        david: "images/Avatars/David.png",
        emma: "images/Avatars/Emma.png",
      };
      if (pIdx !== 0) {
        const avatarImg = box.querySelector<HTMLImageElement>(".avatar-img");
        const key = player.name.trim().toLowerCase();
        if (avatarImg && CPU_AVATARS[key]) avatarImg.src = CPU_AVATARS[key];
      }

      const slots = box.querySelectorAll<HTMLElement>(".card-slot");
      slots.forEach((slot, sIdx) => {
        const card = player.hand[sIdx];
        const isPlayerActive = pIdx === activeIndex;

        // --- DISCARD LOGIC ---
        const isSpecificComboTarget = game.state.mustDiscard.includes(sIdx);
        const isWildcardReward = game.state.mustDiscard.includes(-1);

        const isDiscardable =
          isPlayerActive &&
          (isSpecificComboTarget || (isWildcardReward && card !== null));

        // --- PLAYABLE LOGIC (Sabotage & Shield) ---
        let isPlayable = false;

        // This forces the playable styling to drop the instant a guess is logged
        if (isPlayerActive && !isDiscarding && card && !window.isProcessingAction) {

          // SURGICAL FIX: Block BOTH 4s and Jacks if the player is mid-streak
          const inActiveStreak = (mode === MODES.TRIPLE || (mode as string) === "TRIPLE") && game.state.streakCount > 0;

          if (!inActiveStreak) {
            if (card.rank === 4 || card.rank === 11) {
              isPlayable = true;
            }
          }
        }

        // Pass BOTH isDiscardable and isPlayable
        this.updateSlot(slot, card, isDiscardable, isPlayable, game);
      });
    });
  },

  renderMessageCenter(
    game: ViewGame,
    overrideMode: GameMode | null = null,
    overrideBanner: string | null = null,
    overrideMessage: string | null = null,
    overrideDeckCount: number | null = null,
  ): void {
    const bannerContainer = document.getElementById("mode-banner-container");
    const bannerText = document.getElementById("special-label");
    const messageBox = document.getElementById("action-message");

    if (!bannerText || !bannerContainer) return;

    // --- Static Counter Box with Draw Pile Count ---
    const counterContainer = document.getElementById("counter-container");
    const existingCounter = counterContainer
      ? counterContainer.querySelector(".counter-box")
      : bannerContainer.querySelector(".counter-box");
    if (existingCounter) existingCounter.remove();

    const deckCount =
      overrideDeckCount !== null
        ? overrideDeckCount
        : game.deck
          ? game.deck.length
          : 0;

    const counterDiv = document.createElement("div");
    counterDiv.className = "counter-box";
    counterDiv.innerHTML = `
      <span class="counter-item counter-left">Round: ${game.state.roundCount}</span>
      <span class="counter-item counter-center">Turn: ${game.state.turnCount}</span>
    `;
    if (counterContainer) {
      counterContainer.appendChild(counterDiv);
    } else {
      bannerContainer.insertBefore(counterDiv, bannerText);
    }
    // <span class="counter-item counter-right">Draw: ${deckCount}</span> 
    // If i want to add that back in above 

    // 1. Resolve Active Mode for styles and text
    const activeMode = overrideMode || game.state.mode || MODES.NORMAL;
    if (overrideMode) this.updateModeStyles(overrideMode);

    let text = "";

    // 2. Priority: Game Over / Victory
    if (game.state.gameOver || overrideBanner) {
      const humanPlayer = game.players[0]; // Reference human player object
      const isVictory =
        overrideBanner === UI_STRINGS.VICTORY_BANNER ||
        game.state.winner === humanPlayer; // Dynamic object comparison

      // If the player lost, force the Red theme styles
      if (!isVictory && game.state.gameOver) {
        this.updateModeStyles(MODES.SABOTAGE);
      }

      text =
        overrideBanner ||
        (isVictory ? UI_STRINGS.VICTORY_BANNER : UI_STRINGS.GAME_OVER_BANNER);
      bannerText.textContent = text;
      if (messageBox)
        messageBox.textContent = overrideMessage || game.state.lastResult || "";
      return;
    }

    // 3. Determine Banner Text based on Mode
    if (activeMode === MODES.SABOTAGE) {
      text = UI_STRINGS.SABOTAGE_BANNER;
    } else if (
      activeMode === MODES.DISCARD ||
      (game.state.mustDiscard.length > 0 && !overrideMode)
    ) {
      const isCombo = [
        UI_STRINGS.COMBO_STRAIGHT,
        UI_STRINGS.COMBO_FLUSH,
        UI_STRINGS.COMBO_PAIR,
      ].includes(game.state.lastResult);
      text = isCombo ? UI_STRINGS.COMBO_BANNER : UI_STRINGS.DISCARD_BANNER;
    } else if (activeMode === MODES.QUEEN_SOCIAL) {
      text = UI_STRINGS.QUEEN_SOCIAL_BANNER;
    } else if (activeMode === MODES.NORMAL) {
      text = "NORMAL GUESS";
    } else if (activeMode === MODES.TRIPLE) {
      // streakCount is incremented by Triple.js on each correct guess.
      // 0 = no guesses yet (turn just started) → show (1/3)
      // 1 = first correct done → show (2/3) for next guess
      // 2 = second correct done → show (3/3) for next guess
      const guessNum = (game.state.streakCount || 0) + 1;
      text = `TRIPLE (${Math.min(guessNum, 3)}/3)`;
    } else {
      text = UI_STRINGS[`${activeMode}_BANNER`] || activeMode.replace("_", " ");
    }

    bannerText.textContent = text;

    // 4. Message Box Update
    if (messageBox) {
      messageBox.textContent =
        overrideMessage !== null
          ? overrideMessage
          : game.state.lastResult || "";
    }
  },

  renderControls(mode: GameMode | string, player: Player, state: ViewGameState, game: ViewGame): void {
    const standardRow = document.getElementById("standard-controls");
    const socialRow = document.getElementById("social-controls");

    if (!standardRow || !socialRow) return;

    // --- 1. RESET UI STATE ---
    standardRow.style.display = "none";
    socialRow.style.display = "none";
    socialRow.innerHTML = "";

    Array.from(standardRow.children).forEach((btn) => (btn as HTMLElement).blur());

    const human = game.players[0];

    // --- 2. ELIMINATED SPECTATOR CONTROLS ---
    if (human?.isEliminated && !state.gameOver && !window.isSimulating) {
      socialRow.style.display = "flex";

      const label = document.createElement("div");
      label.className = "btn-hl btn-half btn-red";
      label.style.cursor = "default";
      label.style.pointerEvents = "none";
      label.style.display = "flex";
      label.style.alignItems = "center";
      label.style.justifyContent = "center";
      label.innerText = "Game Over";
      socialRow.appendChild(label);

      const simBtn = document.createElement("button");
      simBtn.className = "btn-hl btn-half btn-gold";
      simBtn.innerText = "Simulate";
      simBtn.onclick = (e) => {
        e.stopPropagation();
        window.isSimulating = true;
        Director.setSimulationMode(true);
        this.render(game);
        Director.kickstartCPU(game);
      };
      socialRow.appendChild(simBtn);
      return;
    }

    // --- 3. INPUT GATEKEEPER ---
    // Prevent interaction if it's not the human turn, game is over, or an animation is running
    if (
      !player ||
      game.currentPlayerIndex !== 0 ||
      state.gameOver ||
      state.mustDiscard.length > 0 ||
      window.isSimulating ||
      window.isProcessingAction === true
    ) {
      return;
    }

    // --- 4. MODE-SPECIFIC BUTTON ROUTING ---

    // SABOTAGE & SOCIAL: Both require a color guess
    if (mode === MODES.SABOTAGE || mode === MODES.QUEEN_SOCIAL) {
      socialRow.style.display = "flex";
      // SURGICAL FIX: Passed "Y", "R", "B", "G" instead of ""
      this.createBtn(socialRow, "Y", "YELLOW", "btn-quarter btn-yellow", "guess");
      this.createBtn(socialRow, "R", "RED", "btn-quarter btn-red", "guess");
      this.createBtn(socialRow, "B", "BLUE", "btn-quarter btn-blue", "guess");
      this.createBtn(socialRow, "G", "GREEN", "btn-quarter btn-green", "guess");
    }

    // Bounty Challenge: Accept or Decline
    else if (mode === MODES.KING_BOUNTY) {
      socialRow.style.display = "flex";
      this.createBtn(
        socialRow,
        UI_STRINGS.KING_BOUNTY_ACCEPT,
        "ACCEPT",
        "btn-half btn-gold",
        "guess",
      );
      this.createBtn(
        socialRow,
        UI_STRINGS.KING_BOUNTY_DECLINE,
        "DECLINE",
        "btn-half btn-red",
        "guess",
      );
    }
    // Standard Higher/Lower Modes
    else if (([MODES.NORMAL, MODES.LUCKY_7, MODES.TRIPLE] as string[]).includes(mode as string)) {
      standardRow.style.display = "flex";
    }
  },

  /**
   * Enhanced createBtn to support dynamic data attributes and symbols.
   * @param type - 'theme' (Phase 1) or 'guess' (Phase 2)
   */
  createBtn(parent: HTMLElement, text: string, value: string, className: string, type: string = "guess"): void {
    const btn = document.createElement("button");

    // We only use the base btn-hl and the specific class passed in.
    // This prevents "guess-btn" or other defaults from interfering.
    btn.className = `btn-hl ${className}`;
    btn.innerHTML = text;

    if (type === "theme") {
      btn.dataset.theme = value;
    } else {
      btn.dataset.guess = value;
    }

    parent.appendChild(btn);
  },

  updateSlot(el: HTMLElement, card: Card | null | undefined, isDiscardable: boolean = false, isPlayable: boolean = false, game: ViewGame | null = null): void {
    if (card && game && game.state.lastFlippedCard === card) {
      card = null;
    }

    el.classList.remove(
      "filled", "discardable", "playable", "sabotage-card", "shield-card",
      "lucky-7-card", "triple-card", "queen-card", "king-card", "bounty-match"
    );
    el.style.transform = "";

    if (card) {
      el.classList.add("filled");
      el.dataset.rank = String(card.rank);
      el.dataset.color = card.color;

      const mapping: Record<number, string> = { 3: "triple-card", 4: "sabotage-card", 7: "lucky-7-card", 11: "shield-card", 12: "queen-card", 13: "king-card" };
      const mappedClass = mapping[card.rank];
      if (mappedClass) el.classList.add(mappedClass);
      const newImgPath = this.getCardImagePath(card);
      const existingImg = el.querySelector<HTMLImageElement>(".card-img");


      if (existingImg) {
        if (existingImg.getAttribute("src") !== newImgPath) {
          existingImg.src = newImgPath;
        }
      } else {
        el.innerHTML = `<img src="${newImgPath}" class="card-img" draggable="false" />`;
      }

      if (isDiscardable) el.classList.add("discardable");

      // --- THE SURGICAL FIX ---
      if (isPlayable) el.classList.add("playable");

      if (game?.state.gameOver && game.state.bountyWinningCard && card.rank === game.state.bountyWinningCard.rank) {
        const playerBox = el.closest(".player-box");
        if (playerBox && game.players[parseInt(playerBox.id.replace("player-", ""))] === game.state.winner) {
          el.classList.add("bounty-match");
        }
      }
    } else {
      delete el.dataset.rank;
      delete el.dataset.color;
      if (el.innerHTML !== "") {
        el.innerHTML = "";
      }
    }
  },

  getCardImagePath(card: Card | null | undefined): string {
  if (!card) return "";
  return getCardImage(card.color, card.rank);
},

  getRankLabel(rank: number): string | number {
    return RANK_LABELS[rank] || rank;
  },

  highlightComboCards(cards: Card[]): void {
    // Determine combo type: a flush is 3 cards sharing the same color.
    // Pairs and straights are identified by rank.
    const isFlush =
      cards.length >= 2 &&
      cards.every((c) => c.color === cards[0]!.color);

    const applyGlow = (el: HTMLElement): void => {
      el.style.transition = "all 0.3s ease-in-out";
      el.style.transform = "scale(1.15)";
      el.style.zIndex = "100";
      el.style.boxShadow = "0 0 30px #39ff14, inset 0 0 15px #39ff14";
      el.style.borderColor = "#39ff14";
      el.classList.add("neon-glow");
    };

    if (isFlush) {
      // Highlight all card-slots whose data-color matches the shared color
      const color = cards[0]!.color;
      document
        .querySelectorAll<HTMLElement>(`.card-slot[data-color="${color}"]`)
        .forEach(applyGlow);
    } else {
      // Highlight by rank for pairs and straights
      cards.forEach((card) => {
        document
          .querySelectorAll<HTMLElement>(`.card-slot[data-rank="${card.rank}"]`)
          .forEach(applyGlow);
      });
    }
  },

  showGameOver(message: string, onRestart: () => void): void {
    // Create overlay element
    const overlay = document.createElement("div");
    overlay.id = "game-over-overlay";
    overlay.innerHTML = `
    <div class="overlay-content">
      <h1>${message}</h1>
      <button id="restart-btn">PLAY AGAIN</button>
    </div>
  `;
    document.body.appendChild(overlay);

    // Add event listener to the new button
    document.getElementById("restart-btn")?.addEventListener("click", () => {
      overlay.remove();
      onRestart(); // This will call your start/initiate function
    });
  },

  renderStatsOverlay(game: ViewGame): void {
    const stats = game.gameStats;
    const s = stats.specialists;
    const q = s.queen;
    const humanName = game.players[0]?.name ?? "PLAYER";

    const getPct = (success: number, total: number): number =>
      total > 0 ? Math.round((success / total) * 100) : 0;

    const overlay = document.createElement("div");
    overlay.id = "stats-overlay";

    const sortedPlayers = [...game.players].sort((a, b) => {
      const winner = game.state.winner;
      if (a.name === winner?.name) return -1;
      if (b.name === winner?.name) return 1;
      if (a.isEliminated && b.isEliminated) {
        return (
          (b.eliminationData?.outOrder || 0) -
          (a.eliminationData?.outOrder || 0)
        );
      }
      if (a.isEliminated && !b.isEliminated) return 1;
      if (!a.isEliminated && b.isEliminated) return -1;
      return (
        a.hand.filter((c) => c !== null).length -
        b.hand.filter((c) => c !== null).length
      );
    });

    const playerRows = sortedPlayers
      .map((p, index) => {
        const isWinner = p.name === game.state.winner?.name;
        let cause = p.eliminationData?.cause || "Survivor";
        if (isWinner) cause = p.eliminationData ? "BOUNTY" : "LAST STANDING";
        return this._createPlayerRow(
          p,
          index,
          isWinner,
          stats.totalRounds,
          cause,
        );
      })
      .join("");

    const F = `font-family: 'Inter', sans-serif;`;
    const S_CARD = `background: rgba(26,39,68,0.06); border: 1.5px solid rgba(26,39,68,0.12); padding: 13px 5px; border-radius: 12px; text-align: center;`;
    const S_SEC_HDR = (color: string): string =>
      `${F} color: ${color}; margin: 0 0 10px 0; font-size: 1.15rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${color}; padding-bottom: 6px;`;

    overlay.innerHTML = `
<div class="stats-container" style="max-width: 520px; width: 96%; padding: 0; max-height: 95vh; overflow-y: auto; border: none; background: #f5f4f0; border-radius: 18px; box-shadow: 0 12px 40px rgba(0,0,0,0.3);">

  <div style="background: linear-gradient(180deg, #4a9fe8 0%, #1e6fc4 100%); border-radius: 18px 18px 0 0; padding: 16px 20px; text-align: center;">
    <h2 style="${F} color:#fff; margin:0; letter-spacing: 1px; font-size: 1.15rem; font-weight: 800; text-transform: uppercase; text-shadow: 0 1px 3px rgba(0,0,0,0.3);">GAME STATS</h2>
  </div>

  <div style="padding: 16px 14px;">

  <section style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 16px;">
    <div style="${S_CARD} border-color: rgba(23,107,46,0.25);">
      <div style="${F} font-size: 0.8rem; font-weight: 700; color: #1a2744; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">ROUNDS</div>
      <div style="${F} font-size: 1.7rem; font-weight: 900; color: #176b2e;">${stats.totalRounds}</div>
    </div>
    <div style="${S_CARD}">
      <div style="${F} font-size: 0.8rem; font-weight: 700; color: #1a2744; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">TURNS</div>
      <div style="${F} font-size: 1.7rem; font-weight: 900; color: #1a5cb0;">${stats.totalTurns}</div>
    </div>
    <div style="${S_CARD} border-color: rgba(160,26,26,0.25);">
      <div style="${F} font-size: 0.8rem; font-weight: 700; color: #1a2744; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">RESHUFFLES</div>
      <div style="${F} font-size: 1.7rem; font-weight: 900; color: #a01818;">${stats.reshuffles}</div>
    </div>
  </section>

  <section style="margin-bottom: 20px; width: 100%;">
    <div style="display: grid; grid-template-columns: 40px 1.3fr 60px 1.1fr 1.3fr; padding: 10px 8px; border-bottom: 2px solid rgba(26,39,68,0.15); color: #1a2744; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; background: rgba(26,39,68,0.07); border-radius: 8px 8px 0 0;">
      <span style="${F} padding-left: 4px;">RANK</span>
      <span style="${F}">PLAYER</span>
      <span style="${F}">RD</span>
      <span style="${F}">CAUSE</span>
      <span style="${F} text-align: center;">CARDS</span>
    </div>
    <div style="background: rgba(26,39,68,0.03); border-radius: 0 0 8px 8px; border: 1.5px solid rgba(26,39,68,0.1); border-top: none;">${playerRows}</div>
  </section>

  <section style="margin-bottom: 20px;">
    <h3 style="${S_SEC_HDR("#1a5cb0")}">SPECIAL CARDS</h3>
    <div style="display: flex; flex-direction: column; gap: 6px;">
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: rgba(26,39,68,0.06); border-radius: 8px; border-left: 4px solid #555;">
        <span style="${F} color: #333; font-size: 1rem; font-weight: 700; text-transform: uppercase;">TRIPLE</span>
        <span style="${F} color: #1a2744; font-size: 1rem; font-weight: 900;">${s.ace.success || 0}/${s.ace.total || 0} (${getPct(s.ace.success || 0, s.ace.total || 0)}%)</span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: rgba(130,0,200,0.07); border-radius: 8px; border-left: 4px solid #7a1faa;">
        <span style="${F} color: #7a1faa; font-size: 1rem; font-weight: 700; text-transform: uppercase;">LUCKY 7 GUESSES</span>
        <span style="${F} color: #1a2744; font-size: 1rem; font-weight: 900;">${s.lucky7.success || 0}/${s.lucky7.total || 0} (${getPct(s.lucky7.success || 0, s.lucky7.total || 0)}%)</span>
      </div>
      <div style="display: grid; grid-template-columns: 1.4fr 1fr 1.3fr; align-items: center; padding: 10px 12px; background: rgba(100,0,200,0.06); border-radius: 8px; border-left: 4px solid #9930d9;">
        <span style="${F} color: #7a1faa; font-size: 1rem; font-weight: 700; text-transform: uppercase;">RAINBOW ROUNDS</span>
        <span style="${F} color: #1a2744; font-size: 1rem; font-weight: 900; text-align: center;">${q.total || 0}</span>
        <span style="${F} color: #1a2744; font-size: 1rem; font-weight: 900; text-align: right;">${q.colorSuccess || 0}/${q.colorTotal || 0} (${getPct(q.colorSuccess || 0, q.colorTotal || 0)}%)</span>
      </div>
      <div style="display: grid; grid-template-columns: 1.4fr 1fr 1.3fr; align-items: center; padding: 10px 12px; background: rgba(180,130,0,0.07); border-radius: 8px; border-left: 4px solid #9a6800;">
        <span style="${F} color: #9a6800; font-size: 1rem; font-weight: 700; text-transform: uppercase;">BOUNTY ACCEPTED</span>
        <span style="${F} color: #1a2744; font-size: 1rem; font-weight: 900; text-align: center;">${s.bounty.accepted || 0}</span>
        <span style="${F} color: #1a2744; font-size: 1rem; font-weight: 900; text-align: right;">${getPct(s.bounty.instantWins, s.bounty.accepted)}%</span>
      </div>
      <div style="display: grid; grid-template-columns: 1.4fr 1fr 1.3fr; align-items: center; padding: 10px 12px; background: rgba(26,39,68,0.04); border-radius: 8px; border-left: 4px solid #aaa;">
        <span style="${F} color: #888; font-size: 1rem; font-weight: 700; text-transform: uppercase;">↳ BOUNTY DECLINED</span>
        <span style="${F} color: #1a2744; font-size: 1rem; font-weight: 900; text-align: center;">${(s.bounty.total || 0) - (s.bounty.accepted || 0)}</span>
        <span style="flex:1;"></span>
      </div>
      <div style="display: grid; grid-template-columns: 1.4fr 1fr 1.3fr; align-items: center; padding: 10px 12px; background: rgba(160,26,26,0.07); border-radius: 8px; border-left: 4px solid #a01818;">
        <span style="${F} color: #a01818; font-size: 1rem; font-weight: 700; text-transform: uppercase;">4 SABOTAGE</span>
        <span style="${F} color: #1a2744; font-size: 1rem; font-weight: 900; text-align: center;">${s.sabotage.total || 0}</span>
        <span style="${F} color: #1a2744; font-size: 1rem; font-weight: 900; text-align: right;">${s.sabotage.success || 0}/${s.sabotage.total || 0} (${getPct(s.sabotage.success || 0, s.sabotage.total || 0)}%)</span>
      </div>
      <div style="display: grid; grid-template-columns: 1.4fr 1fr 1.3fr; align-items: center; padding: 10px 12px; background: rgba(26,92,176,0.07); border-radius: 8px; border-left: 4px solid #1a5cb0;">
        <span style="${F} color: #1a5cb0; font-size: 1rem; font-weight: 700; text-transform: uppercase;">J SHIELD</span>
        <span style="${F} color: #1a2744; font-size: 1rem; font-weight: 900; text-align: center;">${s.shield.total || 0}</span>
        <span style="flex:1;"></span>
      </div>
    </div>
  </section>

  <section style="margin-bottom: 20px;">
    <h3 style="${S_SEC_HDR("#c87000")}">DISCARDS</h3>
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); background: rgba(200,135,0,0.07); padding: 14px; border-radius: 12px; border: 1.5px solid rgba(200,135,0,0.3); gap: 8px;">
      <div style="text-align: center;">
        <div style="${F} font-size: 0.8rem; font-weight: 700; color: #1a2744; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 4px;">PAIRS</div>
        <div style="${F} font-size: 1.4rem; color: #c87000; font-weight: 900;">${stats.combos.pair}</div>
      </div>
      <div style="text-align: center;">
        <div style="${F} font-size: 0.8rem; font-weight: 700; color: #1a2744; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 4px;">STRAIGHTS</div>
        <div style="${F} font-size: 1.4rem; color: #c87000; font-weight: 900;">${stats.combos.straight}</div>
      </div>
      <div style="text-align: center;">
        <div style="${F} font-size: 0.8rem; font-weight: 700; color: #1a2744; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 4px;">FLUSHES</div>
        <div style="${F} font-size: 1.4rem; color: #c87000; font-weight: 900;">${stats.combos.flush}</div>
      </div>
    </div>
  </section>

  ${this._renderSessionRankTable(game.gameStats.rankAccuracy)}

  <div style="text-align:center; ${F} font-size:0.8rem; font-weight:700; color:rgba(26,39,68,0.4); letter-spacing:1px; text-transform:uppercase; margin-bottom:14px; margin-top:4px;">TAP ANYWHERE TO CLOSE</div>

  </div>
</div>`;

    Object.assign(overlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      background: "rgba(0, 0, 0, 0.75)",
      zIndex: "20000",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: "16px",
      boxSizing: "border-box",
      overflowY: "auto",
    });

    overlay.onclick = () => {
      SoundManager.play("menu");
      overlay.remove();
    };

    document.body.appendChild(overlay);
  },

  _createPlayerRow(p: Player, index: number, isWinner: boolean, totalRounds: number, finalCause: string): string {
    const data = p.eliminationData;
    const handToRender = data
      ? data.finalHand
      : p.hand.filter((c) => c !== null);
    const matchRank = data?.matchRank;

    const F = `font-family: 'Inter', sans-serif;`;

    // Card color constants — engine stores capitalized color names
    const CARD_COLORS: Record<string, string> = {
      Red: "#D94545",
      Yellow: "#E6B84A",
      Green: "#3DA36E",
      Blue: "#4587D9",
      red: "#D94545",
      yellow: "#E6B84A",
      green: "#3DA36E",
      blue: "#4587D9",
    };

    const handHtml =
      handToRender.length > 0
        ? handToRender
          .map((c) => {
            const isMatch = matchRank && c.rank === matchRank;
            const rank =
              c.rank === 1
                ? "A"
                : c.rank === 11
                  ? "J"
                  : c.rank === 12
                    ? "Q"
                    : c.rank === 13
                      ? "K"
                      : String(c.rank);
            // Defensive: fall back through all possible key casings, then a visible grey
            const cardColor =
              CARD_COLORS[c.color] ||
              CARD_COLORS[(c.color || "").toLowerCase()] ||
              "#888";
            if (isMatch) {
              return `<span style="${F} color: ${cardColor}; font-size: 0.9rem; font-weight: 900; background: rgba(200,134,10,0.22); border: 1.5px solid #c8860a; border-radius: 4px; padding: 1px 4px; line-height: 1.3;">${rank}</span>`;
            }
            return `<span style="${F} color: ${cardColor}; font-size: 0.9rem; font-weight: 900;">${rank}</span>`;
          })
          .join(" ")
        : "-";

    const rankLabels = ["1ST", "2ND", "3RD", "4TH"];
    const rankLabel = rankLabels[index] || `${index + 1}TH`;

    // Winner row: all green. Losers: dark navy.
    const winnerGreen = "#176b2e";
    const primaryColor = isWinner ? winnerGreen : "#1a2744";
    const subColor = isWinner ? winnerGreen : "#444";
    const rankColor = isWinner ? winnerGreen : "#666";
    const rowBg = isWinner ? "rgba(23,107,46,0.07)" : "transparent";

    const elimRound = isWinner
      ? `<span style="${F} font-weight: bold; color: #aaa;">-</span>`
      : data
        ? `${data.round}`
        : `<span style="${F} font-weight: bold; color: #aaa;">-</span>`;

    return `
      <div style="display: grid; grid-template-columns: 40px 1.3fr 60px 1.1fr 1.3fr; padding: 12px 8px; align-items: center; border-bottom: 1px solid rgba(26,39,68,0.1); font-size: 0.9rem; background: ${rowBg};">
        <span style="${F} color:${rankColor}; font-weight: 900; text-align: left; padding-left: 4px; text-transform: uppercase;">${rankLabel}</span>
        <span style="${F} color:${primaryColor}; font-weight: 700; text-transform: uppercase;">${p.name.toUpperCase()}</span>
        <span style="${F} color: #888; font-weight: 600;">${elimRound}</span>
        <span style="${F} color: ${subColor}; font-weight: ${isWinner ? "700" : "500"}; font-size: 0.82rem; text-transform: uppercase;">${finalCause}</span>
        <div style="display: flex; flex-wrap: wrap; gap: 3px 4px; justify-content: flex-end; font-weight: bold;">
          ${handHtml}
        </div>
      </div>`;
  },

  renderHomeRecords(): void {
    const records = RecordManager.getRecords();
    const container = document.getElementById("home-records");
    if (!container) return;

    container.innerHTML = `
      <div class="record-title">SESSION RECORDS</div>
      <div class="record-entry">
        <span>Longest Game</span>
        <span class="record-val">${records.longestGameTurns} Turns</span>
      </div>
      <div class="record-entry">
        <span>Most Rounds</span>
        <span class="record-val">${records.mostRounds} Rounds</span>
      </div>
      <div class="record-entry">
        <span>Games Played</span>
        <span class="record-val">${records.totalGamesPlayed}</span>
      </div>
      <div class="record-entry" style="margin-top: 8px; border-top: 1px solid #333; padding-top: 5px; font-size: 0.65rem; color: #888;">
        <span>Most Sabotages (Single Game)</span>
        <span class="record-val">${records.mostSpecialistsInOneGame.sabotage}</span>
      </div>
    `;
  },

  renderAllTimeRecordsOverlay(): void {
    const records = RecordManager.getRecords() as unknown as GameRecords;
    const s = records.mostSpecialistsInOneGame;
    const l = records.lowSpecialists;
    const t = records.totalSpecialistCounts;
    const sub = records.subStats;
    const games = records.totalGamesPlayed || 1;

    // COMBO DATA
    const comboHigh = records.mostCombosInOneGame;
    const comboLow = records.lowCombosInOneGame;
    const comboTotal = records.totalComboCounts;

    const getAvg = (val: number): string => (val / games).toFixed(1);
    const formatPct = (val: number | null | "--"): string =>
      val === null || val === "--" ? "--" : val + "%";

    const getGlobalPct = (subKey: string): string => {
      const stat = sub[subKey] as { attempts: number; success: number } | undefined;
      if (!stat || !stat.attempts || stat.attempts === 0) return "0.0%";
      return ((stat.success / stat.attempts) * 100).toFixed(1) + "%";
    };

    const getBountyAvgSuccess = (): string => {
      const b = sub.bountyInstant;
      if (!b || b.totalAccepted === 0) return "0.0%";
      return ((b.success / b.totalAccepted) * 100).toFixed(1) + "%";
    };

    const overlay = document.createElement("div");
    overlay.id = "records-overlay";

    const REC_FONT = `font-family: 'Inter', sans-serif;`;
    const REC_LABEL = `${REC_FONT} font-size: 0.8rem; font-weight: 700; color: #1a2744; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;`;
    const REC_VAL_BLUE = `${REC_FONT} font-size: 1.7rem; font-weight: 900; color: #1a5cb0;`;
    const REC_VAL_RED = `${REC_FONT} font-size: 1.7rem; font-weight: 900; color: #b01a1a;`;
    const REC_VAL_GOLD = `${REC_FONT} font-size: 1.7rem; font-weight: 900; color: #a07000;`;
    const REC_VAL_GREY = `${REC_FONT} font-size: 1.7rem; font-weight: 900; color: #444;`;
    const REC_CARD = `background: rgba(26,39,68,0.06); border: 1.5px solid rgba(26,39,68,0.12); padding: 13px 5px; border-radius: 12px; text-align: center;`;
    const REC_SEC_HDR = (color: string): string =>
      `${REC_FONT} color: ${color}; margin: 0 0 10px 0; font-size: 1.15rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid ${color}; padding-bottom: 6px;`;
    const REC_COL_HDR = `${REC_FONT} font-size: 0.8rem; font-weight: 700; color: #1a2744; text-transform: uppercase; letter-spacing: 0.3px;`;

    // Social round length sub-row: properly split into Low / (blank) / High / Avg columns
    const rl = sub.queenRoundLength;
    const rlAvg =
      rl && rl.totalRounds > 0
        ? (rl.totalGuesses / rl.totalRounds).toFixed(1)
        : "--";
    const rlLow = rl && rl.low !== null ? rl.low : "--";
    const rlHigh = rl && rl.high > 0 ? rl.high : "--";

    overlay.innerHTML = `
<div class="stats-container" style="max-width: 520px; width: 96%; padding: 0; max-height: 95vh; overflow-y: auto; border: none; background: #f5f4f0; border-radius: 18px; box-shadow: 0 12px 40px rgba(0,0,0,0.3);">

  <div style="background: linear-gradient(180deg, #4a9fe8 0%, #1e6fc4 100%); border-radius: 18px 18px 0 0; padding: 16px 20px; text-align: center;">
    <h2 style="${REC_FONT} color:#fff; margin:0; letter-spacing: 1px; font-size: 1.15rem; font-weight: 800; text-transform: uppercase; text-shadow: 0 1px 3px rgba(0,0,0,0.3);">ALL-TIME RECORDS</h2>
  </div>

  <div style="padding: 16px 14px;">

  <section style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 8px;">
    <div style="${REC_CARD}">
      <div style="${REC_LABEL}">GAMES PLAYED</div>
      <div style="${REC_VAL_BLUE}">${records.totalGamesPlayed || 0}</div>
    </div>
    <div style="${REC_CARD}">
      <div style="${REC_LABEL}">LONGEST (TURNS)</div>
      <div style="${REC_VAL_BLUE}">${records.longestGameTurns || 0}</div>
    </div>
    <div style="${REC_CARD}">
      <div style="${REC_LABEL}">LONGEST (ROUNDS)</div>
      <div style="${REC_VAL_BLUE}">${records.mostRounds || 0}</div>
    </div>
  </section>
  <section style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 8px;">
    <div style="${REC_CARD} border-color: rgba(26,100,60,0.25);">
      <div style="${REC_LABEL}">WINS</div>
      <div style="${REC_FONT} font-size:1.7rem; font-weight:900; color:#176b2e;">${records.gamesWon || 0}</div>
    </div>
    <div style="${REC_CARD} border-color: rgba(160,30,30,0.25);">
      <div style="${REC_LABEL}">SHORTEST (TURNS)</div>
      <div style="${REC_VAL_RED}">${records.shortestGameTurns || 0}</div>
    </div>
    <div style="${REC_CARD} border-color: rgba(160,30,30,0.25);">
      <div style="${REC_LABEL}">SHORTEST (ROUNDS)</div>
      <div style="${REC_VAL_RED}">${records.shortestGameRounds || 0}</div>
    </div>
  </section>
  <section style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 20px;">
    <div></div>
    <div style="${REC_CARD}">
      <div style="${REC_LABEL}">AVG (TURNS)</div>
      <div style="${REC_VAL_GREY}">${getAvg(records.totalTurnsAllTime || 0)}</div>
    </div>
    <div style="${REC_CARD}">
      <div style="${REC_LABEL}">AVG (ROUNDS)</div>
      <div style="${REC_VAL_GREY}">${getAvg(records.totalRoundsAllTime || 0)}</div>
    </div>
  </section>

  <section style="margin-bottom: 20px;">
    <h3 style="${REC_SEC_HDR("#1a5cb0")}">SPECIAL CARDS</h3>
    <div style="display: grid; grid-template-columns: 1.6fr 1fr 1fr 1fr; padding: 6px 10px; margin-bottom: 4px;">
      <span style="${REC_COL_HDR}">TYPE</span>
      <span style="${REC_COL_HDR} text-align:center;">HIGH</span>
      <span style="${REC_COL_HDR} text-align:center;">AVG</span>
      <span style="${REC_COL_HDR} text-align:center;">SUCC %</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: 3px;">
      ${this._createSpecialistRow("TRIPLE", "#555", "rgba(26,39,68,0.06)", s.ace, getAvg(t.ace), getGlobalPct("aceSuccess"), true)}

      ${this._createSpecialistRow("LUCKY 7", "#7a1faa", "rgba(130,0,200,0.06)", s.lucky7, getAvg(t.lucky7), getGlobalPct("lucky7Success"), true)}

      ${this._createSpecialistRow("RAINBOW", "#7a1faa", "rgba(100,0,200,0.06)", s.queen, getAvg(t.queen), getGlobalPct("queenGuessAccuracy"), true)}
      ${this._createSpecialistRow("↳ ROUND LENGTH", "#9930d9", "rgba(26,39,68,0.04)", rlHigh, rlAvg, null, false)}

      ${this._createSpecialistRow("BOUNTY ACCEPTED", "#9a6800", "rgba(180,130,0,0.06)", s.bounty, getAvg(t.bounty), getBountyAvgSuccess(), true)}
      ${this._createSpecialistRow("↳ BOUNTY DECLINED", "#888", "rgba(26,39,68,0.04)", sub.bountyDeclined.high, getAvg(sub.bountyDeclined.total), null, false)}

      ${this._createSpecialistRow("SABOTAGES", "#a01818", "rgba(160,30,30,0.06)", s.sabotage, getAvg(t.sabotage), getGlobalPct("sabotageCleared"), true)}

      ${this._createSpecialistRow("SHIELDS", "#1a5cb0", "rgba(26,92,176,0.06)", s.shield, getAvg(t.shield), null, false)}
    </div>
  </section>

  <section style="margin-bottom: 20px;">
    <h3 style="${REC_SEC_HDR("#c87000")}">DISCARDS</h3>
    <div style="display: grid; grid-template-columns: 1.6fr 1fr 1fr; padding: 6px 10px; margin-bottom: 4px;">
      <span style="${REC_COL_HDR}">TYPE</span>
      <span style="${REC_COL_HDR} text-align:center;">HIGH</span>
      <span style="${REC_COL_HDR} text-align:center;">AVG</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: 3px;">
      ${this._createComboRow("PAIRS", "#c87000", "rgba(200,135,0,0.08)", comboHigh.pair, getAvg(comboTotal.pair))}
      ${this._createComboRow("STRAIGHTS", "#c87000", "rgba(200,135,0,0.08)", comboHigh.straight, getAvg(comboTotal.straight))}
      ${this._createComboRow("FLUSHES", "#c87000", "rgba(200,135,0,0.08)", comboHigh.flush, getAvg(comboTotal.flush))}
    </div>

    ${this.renderRankAccuracyTable(records)}
    ${this.renderEliminationSummary(records)}
  </section>

  <div style="text-align:center; ${REC_FONT} font-size:0.8rem; font-weight:700; color:rgba(26,39,68,0.4); letter-spacing:1px; text-transform:uppercase; margin-bottom:14px;">TAP ANYWHERE TO CLOSE</div>

  <div style="display: flex; justify-content: center; margin-bottom: 16px;">
    <button id="btn-reset-records" style="${REC_FONT} padding: 0 28px; height:38px; border-radius:8px; border:1.5px solid #b01a1a; color:#b01a1a; background:rgba(176,26,26,0.07); font-size:0.85rem; font-weight:700; letter-spacing:1px; text-transform:uppercase; cursor:pointer;">RESET ALL STATS</button>
  </div>

  </div>
</div>`;

    Object.assign(overlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      background: "rgba(0, 0, 0, 0.75)",
      zIndex: "20000",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: "16px",
      boxSizing: "border-box",
      overflowY: "auto",
    });

    overlay.onclick = (e) => {
      const resetBtn = (e.target as Element | null)?.closest<HTMLElement>("#btn-reset-records");

      if (resetBtn) {
        e.stopPropagation();

        if (resetBtn.textContent.trim() === "RESET ALL STATS") {
          SoundManager.play("menuEnd");
          resetBtn.textContent = "CONFIRM RESET?";
          resetBtn.style.background = "#e02020";
          resetBtn.style.color = "#fff";
          resetBtn.style.borderColor = "#e02020";

          setTimeout(() => {
            if (resetBtn && resetBtn.textContent.trim() === "CONFIRM RESET?") {
              resetBtn.textContent = "RESET ALL STATS";
              resetBtn.style.background = "rgba(255,107,107,0.08)";
              resetBtn.style.color = "#ff6b6b";
              resetBtn.style.borderColor = "#ff6b6b";
            }
          }, 3000);
        } else {
          SoundManager.play("menu");
          localStorage.removeItem("BOUNTY_RECORDS");
          overlay.remove();
          setTimeout(() => {
            location.reload();
          }, 150);
        }
        return;
      }

      // Tap anywhere to close
      SoundManager.play("menu");
      overlay.remove();
    };

    document.body.appendChild(overlay);
  },

  _createSpecialistRow(
    label: string,
    color: string,
    bgColor: string,
    high: number | string | null | undefined,
    avg: string,
    succPct: string | null,
    showSucc: boolean,
  ): string {
    const displayHigh = high === null || high === undefined ? 0 : high;
    const F = `font-family: 'Inter', sans-serif;`;

    return `
    <div style="display: grid; grid-template-columns: 1.6fr 1fr 1fr 1fr; align-items: center; padding: 10px 10px; background: ${bgColor}; border-radius: 8px; border-left: 4px solid ${color}; margin-bottom: 2px;">
      <span style="${F} color: ${color}; font-size: 0.85rem; font-weight: 700; text-align: left; text-transform: uppercase; letter-spacing: 0.3px;">${label}</span>
      <span style="${F} color: #1a2744; font-size: 1rem; font-weight: 900; text-align: center;">${displayHigh}</span>
      <span style="${F} color: #444; font-size: 1rem; font-weight: 900; text-align: center;">${avg}</span>
      ${showSucc && succPct !== null ? `<span style="${F} color: #1a5cb0; font-size: 1rem; font-weight: 900; text-align: center;">${succPct}</span>` : "<span></span>"}
    </div>`;
  },

  _createComboRow(
    label: string,
    color: string,
    bgColor: string,
    high: number | null | undefined,
    avg: string,
  ): string {
    const displayHigh = high === null || high === undefined ? 0 : high;
    const F = `font-family: 'Inter', sans-serif;`;

    return `
    <div style="display: grid; grid-template-columns: 1.6fr 1fr 1fr; align-items: center; padding: 10px 10px; background: ${bgColor}; border-radius: 8px; border-left: 4px solid ${color}; margin-bottom: 2px;">
      <span style="${F} color: ${color}; font-size: 0.85rem; font-weight: 700; text-align: left; text-transform: uppercase; letter-spacing: 0.3px;">${label}</span>
      <span style="${F} color: #1a2744; font-size: 1rem; font-weight: 900; text-align: center;">${displayHigh}</span>
      <span style="${F} color: #444; font-size: 1rem; font-weight: 900; text-align: center;">${avg}</span>
    </div>`;
  },

  _createSubRow(
    label: string,
    middleValue: string | number | null,
    endValue: string | number,
    unused: unknown,
    bgColor: string = "rgba(26,39,68,0.04)",
    borderColor: string = "transparent",
  ): string {
    const isSingleStat = middleValue === null || middleValue === "";
    const F = `font-family: 'Inter', sans-serif;`;

    const wrapperStyle = `display: ${isSingleStat ? "flex" : "grid"}; 
                        ${isSingleStat ? "justify-content: flex-start;" : "grid-template-columns: 1.6fr 1fr 1.3fr;"} 
                        align-items: center; padding: 8px 10px; background: ${bgColor}; 
                        margin-bottom: 2px; border-radius: 4px; border-left: 3px solid ${borderColor}; 
                        margin-left: 18px;`;

    return `
    <div style="${wrapperStyle}">
      <span style="${F} color: ${borderColor}; font-size: 0.82rem; font-weight: 600; text-align: left; flex: 1; text-transform: uppercase; letter-spacing: 0.3px;">${label}</span>
      ${isSingleStat
        ? `<span style="${F} color: ${borderColor}; font-size: 1rem; font-weight: 900; text-align: right; padding-right: 10px;">${endValue}</span>`
        : `<span style="${F} color: #1a2744; font-size: 1rem; font-weight: 900; text-align: center;">${middleValue}</span>
         <span style="${F} color: #444; font-size: 1rem; font-weight: 900; text-align: right;">${endValue}</span>`
      }
    </div>`;
  },

  renderRankAccuracyTable(records: GameRecords): string {
    if (!records.rankAccuracyAllTime) return "";

    const ranks = [
      "",
      "A",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "J",
      "Q",
      "K",
    ];
    const F = `font-family: 'Inter', sans-serif;`;

    let html = `
<div style="margin-top: 20px; margin-bottom: 20px;">
<h3 style="${F} color: #1a5cb0; font-size: 1.15rem; margin-bottom: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #1a5cb0; padding-bottom: 6px;">RANK PERFORMANCE</h3>
<div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; padding: 6px 10px; color: #1a2744; font-size: 0.8rem; font-weight: 700; text-align: center; text-transform: uppercase; letter-spacing: 0.3px;">
  <span style="text-align:left;">RANK</span>
  <span>CORRECT</span>
  <span>INCORRECT</span>
  <span>SUCC %</span>
</div>
<div style="display: flex; flex-direction: column; gap: 2px; margin-top: 4px;">`;

    for (let i = 1; i <= 13; i++) {
      const d = records.rankAccuracyAllTime[i];
      const correct = d?.correct ?? 0;
      const incorrect = d?.incorrect ?? 0;
      const guesses = correct + incorrect;

      const successPct =
        guesses > 0 ? Math.round((correct / guesses) * 100) : 0;

      let pctColor = "#176b2e";
      if (successPct <= 62) pctColor = "#a01818";
      else if (successPct <= 85) pctColor = "#9a6800";

      const bg = i % 2 === 0 ? "rgba(26,39,68,0.05)" : "transparent";

      html += `
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); align-items: center; padding: 10px; background: ${bg}; border-radius: 4px; text-align: center;">
        <span style="${F} color: #1a2744; font-weight: 900; font-size: 1.1rem; text-align:left; padding-left:4px;">${ranks[i]}</span>
        <span style="${F} color: #176b2e; font-size: 0.95rem; font-weight: 900;">${correct}</span>
        <span style="${F} color: #a01818; font-size: 0.95rem; font-weight: 900;">${incorrect}</span>
        <span style="${F} color: ${pctColor}; font-size: 1rem; font-weight: 900;">${successPct}%</span>
      </div>`;
    }
    return html + `</div></div>`;
  },

  _renderSessionRankTable(rankAccuracy: RankAccuracyStat[] | null | undefined): string {
    if (!rankAccuracy) return "";

    const ranks = [
      "",
      "A",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "J",
      "Q",
      "K",
    ];
    const F = `font-family: 'Inter', sans-serif;`;

    const hasData = rankAccuracy.some(
      (d, i) => i > 0 && d && (d.total || 0) > 0,
    );
    if (!hasData) return "";

    let html = `
    <section style="margin-bottom: 30px; padding: 0 10px;">
      <h3 style="${F} color: #1a5cb0; margin: 0 0 10px 0; font-size: 1.15rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #1a5cb0; padding-bottom: 6px;">RANK PERFORMANCE</h3>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; padding: 6px 10px; color: #1a2744; font-size: 0.8rem; font-weight: 700; text-align: center; text-transform: uppercase; letter-spacing: 0.3px;">
        <span style="text-align:left;">RANK</span>
        <span>CORRECT</span>
        <span>INCORRECT</span>
        <span>SUCC %</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 2px; margin-top: 4px;">`;

    for (let i = 1; i <= 13; i++) {
      const d = rankAccuracy[i];
      const correct = d?.correct ?? 0;
      const incorrect = d?.incorrect ?? 0;
      const guesses = correct + incorrect;

      if (guesses === 0) continue;

      const successPct =
        guesses > 0 ? Math.round((correct / guesses) * 100) : 0;

      let pctColor = "#176b2e";
      if (successPct <= 60) pctColor = "#a01818";
      else if (successPct <= 75) pctColor = "#9a6800";

      const bg = i % 2 === 0 ? "rgba(26,39,68,0.05)" : "transparent";

      html += `
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); align-items: center; padding: 10px; background: ${bg}; border-radius: 4px; text-align: center;">
        <span style="${F} color: #1a2744; font-weight: 900; font-size: 1.1rem; text-align:left; padding-left:4px;">${ranks[i]}</span>
        <span style="${F} color: #176b2e; font-size: 0.95rem; font-weight: 900;">${correct}</span>
        <span style="${F} color: #a01818; font-size: 0.95rem; font-weight: 900;">${incorrect}</span>
        <span style="${F} color: ${pctColor}; font-size: 1rem; font-weight: 900;">${successPct}%</span>
      </div>`;
    }

    return html + `</div></section>`;
  },

  renderEliminationSummary(records: GameRecords): string {
    const allCauses = [
      { id: "NORMAL", label: "Normal Guess" },
      { id: "TRIPLE", label: "Triple" },
      { id: "SABOTAGE", label: "Sabotage" },
      { id: "LUCKY_7", label: "Lucky 7" },
      { id: "QUEEN_SOCIAL", label: "Rainbow Round" },
      { id: "KING_BOUNTY", label: "Bounty Challenge" },
    ];

    const causesData = records.eliminationCauses || {};
    const winMethods = records.winMethods || {
      LAST_MAN_STANDING: 0,
      BOUNTY_INSTANT: 0,
    };

    const totalElims = Object.values(causesData).reduce(
      (a, b) => a + Number(b),
      0,
    );
    const totalWins =
      (Number(winMethods.LAST_MAN_STANDING) || 0) +
      (Number(winMethods.BOUNTY_INSTANT) || 0);

    const sortedCauses = [...allCauses].sort(
      (a, b) =>
        (Number(causesData[b.id]) || 0) - (Number(causesData[a.id]) || 0),
    );

    const F = `font-family: 'Inter', sans-serif;`;

    let html = `
<div style="margin-top: 20px; margin-bottom: 20px;">
  <h3 style="${F} color: #a01818; font-size: 1.15rem; margin-bottom: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #a01818; padding-bottom: 6px;">ELIMINATION CAUSES</h3>
  <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; padding: 6px 10px; color: #1a2744; font-size: 0.8rem; font-weight: 700; text-align: center; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.3px;">
    <span style="text-align: left;">CAUSE</span>
    <span>COUNT</span>
    <span>SHARE</span>
  </div>
  <div style="display: flex; flex-direction: column; gap: 3px; margin-bottom: 20px;">`;

    sortedCauses.forEach((cause, idx) => {
      const count = Number(causesData[cause.id]) || 0;
      const pct = totalElims > 0 ? Math.round((count / totalElims) * 100) : 0;
      const bg = idx % 2 === 0 ? "rgba(160,26,26,0.06)" : "transparent";

      html += `
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; align-items: center; padding: 10px; background: ${bg}; border-radius: 6px; border-left: 4px solid #a01818; text-align: center;">
          <span style="${F} color: #1a2744; text-align: left; font-size: 0.88rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;">${cause.label}</span>
          <span style="${F} color: #a01818; font-size: 1rem; font-weight: 900;">${count}</span>
          <span style="${F} color: #555; font-size: 0.9rem; font-weight: 700;">${pct}%</span>
        </div>`;
    });

    html += `</div>
  <h3 style="${F} color: #176b2e; font-size: 1.15rem; margin-bottom: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #176b2e; padding-bottom: 6px;">WIN METHODS</h3>
  <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; padding: 6px 10px; color: #1a2744; font-size: 0.8rem; font-weight: 700; text-align: center; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.3px;">
    <span style="text-align: left;">METHOD</span>
    <span>COUNT</span>
    <span>SHARE</span>
  </div>
  <div style="display: flex; flex-direction: column; gap: 3px;">`;

    const methods = [
      { id: "LAST_MAN_STANDING", label: "Survivor" },
      { id: "BOUNTY_INSTANT", label: "Bounty Challenge" },
    ];

    methods.forEach((m, idx) => {
      const count = Number((winMethods as Record<string, number>)[m.id]) || 0;
      const pct = totalWins > 0 ? Math.round((count / totalWins) * 100) : 0;
      const bg = idx % 2 === 0 ? "rgba(23,107,46,0.06)" : "transparent";

      html += `
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; align-items: center; padding: 10px; background: ${bg}; border-radius: 6px; border-left: 4px solid #176b2e; text-align: center;">
          <span style="${F} color: #1a2744; text-align: left; font-size: 0.88rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px;">${m.label}</span>
          <span style="${F} color: #176b2e; font-size: 1rem; font-weight: 900;">${count}</span>
          <span style="${F} color: #555; font-size: 0.9rem; font-weight: 700;">${pct}%</span>
        </div>`;
    });

    return html + `</div></div>`;
  },

  // ─────────────────────────────────────────────────────────
  // SPEECH BUBBLE API
  // ─────────────────────────────────────────────────────────

  /**
   * Show a speech bubble above a player's avatar.
   * @param playerIndex  - 0 = human, 1-3 = CPU
   * @param text         - Message to display (UPPERCASE)
   * @param pinned       - If true, bubble stays until explicitly cleared.
   * If false, auto-dismisses after ~1.8s.
   */
  showBubble(playerIndex: number, text: string, pinned: boolean = false): void {
    const bubble = document.getElementById(`bubble-${playerIndex}`);
    if (!bubble) return;

    // Cancel any pending auto-clear timer
    if (bubble._clearTimer) {
      clearTimeout(bubble._clearTimer);
      bubble._clearTimer = null;
    }

    bubble.textContent = text.toUpperCase();
    bubble.className = `speech-bubble${playerIndex === 0 ? " speech-bubble-human" : ""} visible${pinned ? " pinned" : ""}`;

    if (!pinned) {
      bubble._clearTimer = setTimeout(() => {
        bubble.classList.add("fading");
        setTimeout(() => {
          bubble.className = `speech-bubble${playerIndex === 0 ? " speech-bubble-human" : ""}`;
          bubble.textContent = "";
        }, 350);
        bubble._clearTimer = null;
      }, 1800);
    }
  },

  /**
   * Immediately clear the speech bubble for a specific player.
   */
  clearBubble(playerIndex: number): void {
    const bubble = document.getElementById(`bubble-${playerIndex}`);
    if (!bubble) return;
    if (bubble._clearTimer) {
      clearTimeout(bubble._clearTimer);
      bubble._clearTimer = null;
    }
    bubble.className = `speech-bubble${playerIndex === 0 ? " speech-bubble-human" : ""}`;
    bubble.textContent = "";
  },

  /**
   * Clear all speech bubbles at once (e.g. on new turn start).
   */
  clearAllBubbles(): void {
    for (let i = 0; i <= 3; i++) {
      this.clearBubble(i);
    }
  },

  // ─────────────────────────────────────────────────────────
  // CARD RESULT ANIMATIONS
  // ─────────────────────────────────────────────────────────

  animateFlipCardCorrect(): void {
    const slot = document.getElementById("transient-card");
    if (!slot) return;

    // Target the image directly, just like the wobble does!
    const img = slot.querySelector<HTMLElement>('.card-img');
    if (!img) return;

    img.style.animation = 'none';
    void img.offsetWidth; // Trigger reflow
    img.style.animation = 'transient-flash-white 1.2s ease forwards';
  },

  animateFlipCardIncorrect(): void {
    const slot = document.getElementById("transient-card");
    if (!slot) return;

    const img = slot.querySelector<HTMLElement>('.card-img');
    if (!img) return;

    img.style.animation = 'none';
    void img.offsetWidth;
    img.style.animation = 'transient-wobble 0.45s ease-in-out forwards';
  },

  animateFlipCardTie(): void {
    const slot = document.getElementById("transient-card");
    if (!slot) return;

    const img = slot.querySelector<HTMLElement>('.card-img');
    if (!img) return;

    img.style.animation = 'none';
    void img.offsetWidth;
    img.style.animation = 'transient-wobble 0.45s ease-in-out forwards';
  },

  updateDangerMeter(game: ViewGame): void {
    const container = document.getElementById("danger-meter");
    const fill = document.getElementById("danger-meter-fill");
    if (!container || !fill) return;

    const mode = game.state.mode;
    const currentPlayer = game.players[game.currentPlayerIndex];
    const handCount = currentPlayer
      ? currentPlayer.hand.filter((c) => c !== null).length
      : 0;

    let dangerLevel = 1;

    // ── KING BOUNTY ────────────────────────────────────────────
    // Hand size IS the danger — no up card or hand modifier needed
    if (mode === "KING_BOUNTY") {
      if (handCount === 1) dangerLevel = 6;
      else if (handCount === 2) dangerLevel = 8;
      else if (handCount === 3) dangerLevel = 10;
    }

    // ── COLOR GUESSES (Sabotage & Rainbow) ─────────────────────
    else if (mode === "SABOTAGE" || mode === "QUEEN_SOCIAL") {
      dangerLevel = 8;

      // Hand modifier
      if (handCount === 3) dangerLevel += 2;
      else if (handCount === 2) dangerLevel += 1;
    }

    // ── NORMAL HIGH/LOW GUESS ───────────────────────────────────
    // Covers NORMAL, TRIPLE, LUCKY_7
    else if (mode === "NORMAL" || mode === "TRIPLE" || mode === "LUCKY_7") {
      if (!game.upCard) return;
      const rank = game.upCard.rank;

      if (rank === 1 || rank === 13)
        dangerLevel = 1; // Ace / King
      else if (rank === 2 || rank === 12)
        dangerLevel = 2; // 2 / Queen
      else if (rank === 3 || rank === 11)
        dangerLevel = 3; // 3 / Jack
      else if (rank === 4 || rank === 10)
        dangerLevel = 4; // 4 / 10
      else if (rank === 5 || rank === 9)
        dangerLevel = 5; // 5 / 9
      else if (rank === 6 || rank === 8)
        dangerLevel = 6; // 6 / 8
      else if (rank === 7) dangerLevel = 7; // 7

      // Hand modifier
      if (handCount === 3) dangerLevel += 3;
      else if (handCount === 2) dangerLevel += 1;
    }

    // ── CLAMP & APPLY FILL ─────────────────────────────────────
    dangerLevel = Math.min(dangerLevel, 10);
    fill.style.width = `${dangerLevel * 10}%`;

    // ── DANGER-HIGH PLAYER BOX (danger ≥ 8, 3 cards only) ──────
    document.querySelectorAll(".player-box").forEach((box) => {
      box.classList.remove("danger-high");
    });
    if (dangerLevel >= 8 && handCount === 3) {
      const activeBox = document.getElementById(
        `player-${game.currentPlayerIndex}`,
      );
      if (activeBox) activeBox.classList.add("danger-high");
    }
    // ── MAX DANGER PULSE ────────────────────────────────────────
    container.classList.toggle("danger-max", dangerLevel === 10);
  },
};