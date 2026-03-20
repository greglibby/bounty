// =============================================================================
// BOUNTY — Constants
// src/constants.ts
// =============================================================================

import type { Card, CardColor, Difficulty } from "./types/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// MODES
//
// `as const` preserves the string literal types (e.g. "NORMAL" not string)
// so that state.mode === MODES.NORMAL works with strict equality checks.
// ─────────────────────────────────────────────────────────────────────────────

export const MODES = {
  CEREMONY:     "CEREMONY",
  NORMAL:       "NORMAL",
  DISCARD:      "DISCARD",
  QUEEN_SOCIAL: "QUEEN_SOCIAL",
  KING_BOUNTY:  "KING_BOUNTY",
  LUCKY_7:      "LUCKY_7",
  TRIPLE:       "TRIPLE",
  SABOTAGE:     "SABOTAGE",
  SHIELD:       "SHIELD",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TIMING
//
// No explicit Record<string, number> annotation — TypeScript infers the
// literal property shape so dot-accesses return `number`, not `number | undefined`.
// ─────────────────────────────────────────────────────────────────────────────

export const TIMING = {
  THINKING:      500,  // pause before CPU makes a guess
  REVEAL:        800,  // card flips after THINKING pause; pause before result is shown
  RESULT:        1000, // result shown after the REVEAL pause
  DISCARD_PAUSE: 300,  // pause after result, before discard banner (when applicable)
  POST_TURN:     400,  // short pause so the player sees turn result before play moves on
  SPECIAL_CARD:  1500, // pause after player plays a jack or 4 sabotage from their hand
  SHUFFLE:       1500, // cinematic pause so player sees shuffle is happening
  CEREMONY_STEP: 500,  // determining first player, dealing and result
  VICTORY_PAUSE: 3000, // short pause before victory or elimination banner
};

// ─────────────────────────────────────────────────────────────────────────────
// RANKS
// ─────────────────────────────────────────────────────────────────────────────

export const RANKS: Record<string, number> = {
  ACE:   1,
  THREE: 3,
  FOUR:  4,
  SEVEN: 7,
  JACK:  11,
  QUEEN: 12,
  KING:  13,
};

// ─────────────────────────────────────────────────────────────────────────────
// CARD COLORS
// ─────────────────────────────────────────────────────────────────────────────

export const CARD_COLORS: CardColor[] = ["Yellow", "Red", "Blue", "Green"];

export const CARD_COLOR_HEX: Record<CardColor, string> = {
  Red:    "#D94545",
  Yellow: "#E6B84A",
  Green:  "#3DA36E",
  Blue:   "#4587D9",
};

// ─────────────────────────────────────────────────────────────────────────────
// RANK LABELS
//
// Only 4 ranks have display labels; all others render as their numeric value.
// Typed as Partial so that RANK_LABELS[card.rank] correctly returns
// string | undefined, keeping the || fallback in FormatCard honest.
// ─────────────────────────────────────────────────────────────────────────────

export const RANK_LABELS: Partial<Record<number, string>> = {
  1:  "A",
  11: "J",
  12: "Q",
  13: "K",
};

// ─────────────────────────────────────────────────────────────────────────────
// DECK CONFIG
// ─────────────────────────────────────────────────────────────────────────────

export const DECK_CONFIG: {
  MIN_RANK: number;
  MAX_RANK: number;
  COLORS: CardColor[];
} = {
  MIN_RANK: 1,
  MAX_RANK: 13,
  COLORS: CARD_COLORS,
};

// ─────────────────────────────────────────────────────────────────────────────
// COMBO RULES
// ─────────────────────────────────────────────────────────────────────────────

export const COMBO_RULES = {
  MIN_STRAIGHT_LENGTH: 3,
  MIN_FLUSH_LENGTH:    3,
  MAX_HAND_SIZE:       4,
};

// ─────────────────────────────────────────────────────────────────────────────
// UI STRINGS
//
// No explicit Record<string, string> annotation — TypeScript infers the
// literal property shape so dot-accesses return `string`, not `string | undefined`.
// ─────────────────────────────────────────────────────────────────────────────

export const UI_STRINGS = {
  CEREMONY_BANNER: "Lowest goes first.",
  CEREMONY_MSG:    "Lowest card goes first",
  SHUFFLING:       "Shuffling deck...",

  // Normal Guess
  MODE_SUFFIX:       "'s Guess",
  RESULT_CORRECT:    "Correct!",
  RESULT_INCORRECT:  "Incorrect! Take card.",
  RESULT_TIE:        "Tie! Guess again.",

  // 3 — Triple
  TRIPLE_BANNER:  "Triple!",
  TRIPLE_SUCCESS: "Success!",
  STREAK_NEEDS_3: "Needs 3 correct guesses",
  STREAK_NEEDS_2: "Needs 2 more",
  STREAK_NEEDS_1: "Needs 1 more",

  // 4 — Sabotage
  SABOTAGE_BANNER:      "Sabotage!",
  SABOTAGE_INSTRUCTION: "Guess the colour to clear!",
  SABOTAGE_VICTIM_MSG:  "Next player must guess colour!",
  SABOTAGE_FAILED:      "Sabotaged! Take a card.",

  // Lucky 7
  LUCKY_7_BANNER:  "Lucky 7!",
  LUCKY_7_SUCCESS: "Correct! Discard 1 card.",

  // Shield
  SHIELD_BANNER:  "Shield played!",
  SHIELD_MESSAGE: "Skip turn",

  // Queen Social
  QUEEN_SOCIAL_BANNER: "Rainbow Round!",
  QUEEN_SOCIAL_SUCCESS: "Correct!",
  SOCIAL_THEME_MSG: "Theme: ",   // prefix
  SOCIAL_PICKED:    " picked ",  // "PLAYER picked COLOR"

  // King Bounty
  KING_BOUNTY_BANNER:      "Bounty Challenge!",
  KING_BOUNTY_INSTRUCTION: "Match a hand card to win",
  KING_BOUNTY_SUCCESS:     "Match! Instant win!",
  KING_BOUNTY_FAIL:        "No match. Take a card.",
  KING_BOUNTY_ACCEPT:      "Accept",
  KING_BOUNTY_DECLINE:     "Decline",
  BOUNTY_ACCEPTED:         "Challenge accepted!",
  BOUNTY_DECLINED:         "Challenge declined.",

  // Combo Banners
  COMBO_PAIR:     "Discard the pair!",
  COMBO_STRAIGHT: "Discard the straight!",
  COMBO_FLUSH:    "Discard the flush!",

  // Discard
  COMBO_BANNER:   "Discard combo!",
  DISCARD_BANNER: "Discard!",
  SELECT_DISCARD: "Select ",
  SELECT_SUFFIX:  " card(s) to discard.",

  // Endgame
  ELIMINATED:      " is eliminated!",
  WINNER:          " wins the game!",
  VICTORY_BANNER:  "Victory!",
  GAME_OVER_BANNER:"Game Over!",
  VICTORY_MSG:     "You win the game!",
  GAME_OVER_MSG:   "Better luck next time.",

  // Settings
  SETTINGS_BANNER:  "Settings",
  LABEL_SPEED:      "Game Speed",
  LABEL_DIFFICULTY: "Difficulty",
  LABEL_SOUND:      "Sound Effects",
  SPEED_SLOW:       "Slow",
  SPEED_NORMAL:     "Normal",
  SPEED_FAST:       "Fast",
  SOUND_ON:         "On",
  SOUND_OFF:        "Off",
};

// ─────────────────────────────────────────────────────────────────────────────
// ELIMINATION CAUSES
//
// Computed keys use the MODES values (string literals after `as const`).
// Typed as Record<string, string> to accommodate the non-MODES keys
// (SURVIVOR, LAST_STANDING) alongside the mode-keyed entries.
// ─────────────────────────────────────────────────────────────────────────────

export const ELIMINATION_CAUSES: Record<string, string> = {
  [MODES.NORMAL]:       "Normal Guess",
  [MODES.QUEEN_SOCIAL]: "Social Round",
  [MODES.SABOTAGE]:     "Sabotage",
  [MODES.LUCKY_7]:      "Lucky 7",
  [MODES.TRIPLE]:       "Triple",
  [MODES.KING_BOUNTY]:  "Bounty Challenge",
  SURVIVOR:             "Survivor",
  LAST_STANDING:        "Last Standing",
};

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────

export const SETTINGS_DEFAULTS: {
  SPEED: number;
  DIFFICULTY: Difficulty;
  IS_MUTED: boolean;
} = {
  SPEED:      1.0,
  DIFFICULTY: "NORMAL",
  IS_MUTED:   false,
};

// ─────────────────────────────────────────────────────────────────────────────
// DIFFICULTY MODES
// ─────────────────────────────────────────────────────────────────────────────

export const DIFFICULTY_MODES = {
  EASY:   "EASY",
  NORMAL: "NORMAL",
  HARD:   "HARD",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// COLORS (miscellaneous UI colours not tied to cards)
// ─────────────────────────────────────────────────────────────────────────────

export const COLORS: Record<string, string> = {
  PURPLE: "#A020F0",
};

// ─────────────────────────────────────────────────────────────────────────────
// FormatCard
// ─────────────────────────────────────────────────────────────────────────────

export const FormatCard = (card: Card | null | undefined): string => {
  if (!card) return "";
  const rank: string = RANK_LABELS[card.rank] ?? String(card.rank);
  const colorInitial = card.color ? card.color[0] : "";
  return `${rank}${colorInitial}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// REACTIONS
// ─────────────────────────────────────────────────────────────────────────────

export const REACTIONS = {
  CORRECT: [
    "YES!", "GOT IT!", "NICE!", "BOOM!", "EASY!", "LET'S GO!", "CRUSHED IT",
    "ON FIRE!", "PURE SKILL", "BULLSEYE!", "CLUTCH!", "BIG BRAIN!", "TOO GOOD!",
    "TOO EASY", "CALL ME PRO!", "EASY PEEZY!", "WINNING!", "NAILED IT", "PRO MOVES!",
  ],

  INCORRECT: [
    "OH NO!", "DANG!", "TOUGH!", "OOF!", "I'M SO BAD!", "ROUGH...", "OUCH!",
    "NOT TODAY!", "HEARTBREAK!", "SO CLOSE!", "RIGGED!", "I'M BROKE", "SAD TIMES!",
    "TRAGIC", "WHOOPS!", "MY EYES!", "HELP!", "I QUIT!", "EXCUSE ME?", "NOOOOOO!",
  ],

  TIE: [
    "AGAIN!", "ONE MORE!", "ANOTHER!", "RE-FLIP!", "STALEMATE!", "DEJA VU!",
    "DO-OVER!", "TWINS!", "COPY CAT", "GLITCH?", "REDO!", "WHAT??",
    "DOUBLE UP", "SNAP!", "BORING!", "AWKWARD...",
  ],

  BOUNTY_HIGH_RISK: [
    "SO RISKY!", "I'M SCARED!", "I SHOULDN'T.", "BIG GAMBLE",
    "PRAYER!", "DANGEROUS", "COWBOY UP!", "SCARY...",
  ],

  BOUNTY_TACTICAL: [
    "MAYBE...", "ODDS GOOD!", "SMART PLAY",
    "COIN FLIP", "I'LL RISK", "WHY NOT?", "CALCULATED",
  ],

  BOUNTY_LOW_RISK: [
    "FREE WIN!", "SURE THING", "EASY!", "BANK IT!",
    "NO BRAINER", "LOCKED IN", "GUARANTEED", "SAFE BET",
  ],
} as const;

// Derive the union type from the object keys so pickReaction stays exhaustive.
export type ReactionType = keyof typeof REACTIONS;

export const pickReaction = (type: ReactionType): string => {
  const pool = REACTIONS[type];
  if (!pool) return "";
  // pool.length is a known literal (never 0) so the length===0 guard is omitted;
  // the non-null assertion on the index is required by noUncheckedIndexedAccess.
  return pool[Math.floor(Math.random() * pool.length)]!;
};

export const pickBountyReaction = (handCount: number): string => {
  if (handCount >= 3) return pickReaction("BOUNTY_HIGH_RISK");
  if (handCount === 2) return pickReaction("BOUNTY_TACTICAL");
  return pickReaction("BOUNTY_LOW_RISK");
};

// ─────────────────────────────────────────────────────────────────────────────
// STREWN CONFIG
// ─────────────────────────────────────────────────────────────────────────────

export const STREWN_CONFIG: {
  ROTATIONS: number[];
  OFFSETS: string[];
} = {
  ROTATIONS: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  OFFSETS:   ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
};