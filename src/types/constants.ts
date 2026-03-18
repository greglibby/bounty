// ─────────────────────────────────────────────────────────
// CORE TYPES & ENUMS
// ─────────────────────────────────────────────────────────

export enum GameMode {
  Ceremony = "CEREMONY",
  Normal = "NORMAL",
  Discard = "DISCARD",
  QueenSocial = "QUEEN_SOCIAL",
  KingBounty = "KING_BOUNTY",
  Lucky7 = "LUCKY_7",
  Triple = "TRIPLE",
  Sabotage = "SABOTAGE",
  Shield = "SHIELD",
  GameOver = "GAME_OVER", // Added based on your previous Engine logic
}

export enum Rank {
  Ace = 1,
  Two = 2,
  Three = 3,
  Four = 4,
  Five = 5,
  Six = 6,
  Seven = 7,
  Eight = 8,
  Nine = 9,
  Ten = 10,
  Jack = 11,
  Queen = 12,
  King = 13,
}

export type CardColor = "Yellow" | "Red" | "Blue" | "Green";
export type ReactionType = "CORRECT" | "INCORRECT" | "TIE" | "BOUNTY_HIGH_RISK" | "BOUNTY_TACTICAL" | "BOUNTY_LOW_RISK";

export interface StrewnMeta {
  rot: number;
  offset: string;
}

export interface Card {
  color: CardColor;
  rank: number;
  _strewn?: StrewnMeta;
}

// ─────────────────────────────────────────────────────────
// CONFIGURATIONS
// ─────────────────────────────────────────────────────────

export const CARD_COLORS: readonly CardColor[] = ["Yellow", "Red", "Blue", "Green"];

export const CARD_COLOR_HEX: Record<CardColor, string> = {
  Red: "#D94545",
  Yellow: "#E6B84A",
  Green: "#3DA36E",
  Blue: "#4587D9",
} as const;

export const RANK_LABELS: Record<number, string> = {
  1: "A",
  11: "J",
  12: "Q",
  13: "K",
} as const;

export const DECK_CONFIG = {
  MIN_RANK: 1,
  MAX_RANK: 13,
  COLORS: CARD_COLORS,
} as const;

export const COMBO_RULES = {
  MIN_STRAIGHT_LENGTH: 3,
  MIN_FLUSH_LENGTH: 3,
  MAX_HAND_SIZE: 4,
} as const;

export const TIMING = {
  THINKING: 500,
  REVEAL: 800,
  RESULT: 1000,
  DISCARD_PAUSE: 300,
  POST_TURN: 400,
  SPECIAL_CARD: 1500,
  SHUFFLE: 1500,
  CEREMONY_STEP: 500,
  VICTORY_PAUSE: 3000,
} as const;

export const STREWN_CONFIG = {
  ROTATIONS: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  OFFSETS: ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
} as const;

export const SETTINGS_DEFAULTS = {
  SPEED: 1.0,
  DIFFICULTY: "NORMAL",
  IS_MUTED: false,
} as const;

export enum Difficulty {
  Easy = "EASY",
  Normal = "NORMAL",
  Hard = "HARD",
}

export const COLORS = {
  PURPLE: "#A020F0",
} as const;

// ─────────────────────────────────────────────────────────
// UI STRINGS & TEXT
// ─────────────────────────────────────────────────────────

export const UI_STRINGS: Record<string, string> = {
  CEREMONY_BANNER: "Lowest goes first.",
  CEREMONY_MSG: "Lowest card goes first",
  SHUFFLING: "Shuffling deck...",
  MODE_SUFFIX: "'s Guess",
  RESULT_CORRECT: "Correct!",
  RESULT_INCORRECT: "Incorrect! Take card.",
  RESULT_TIE: "Tie! Guess again.",
  TRIPLE_BANNER: "Triple!",
  TRIPLE_SUCCESS: "Success!",
  STREAK_NEEDS_3: "Needs 3 correct guesses",
  STREAK_NEEDS_2: "Needs 2 more",
  STREAK_NEEDS_1: "Needs 1 more",
  SABOTAGE_BANNER: "Sabotage!",
  SABOTAGE_INSTRUCTION: "Guess the colour to clear!",
  SABOTAGE_VICTIM_MSG: "Next player must guess colour!",
  SABOTAGE_FAILED: "Sabotaged! Take a card.",
  LUCKY_7_BANNER: "Lucky 7!",
  LUCKY_7_SUCCESS: "Correct! Discard 1 card.",
  SHIELD_BANNER: "Shield played!",
  SHIELD_MESSAGE: "Skip turn",
  QUEEN_SOCIAL_BANNER: "Rainbow Round!",
  QUEEN_SOCIAL_SUCCESS: "Correct!",
  SOCIAL_THEME_MSG: "Theme: ",
  SOCIAL_PICKED: " picked ",
  KING_BOUNTY_BANNER: "Bounty Challenge!",
  KING_BOUNTY_INSTRUCTION: "Match a hand card to win",
  KING_BOUNTY_SUCCESS: "Match! Instant win!",
  KING_BOUNTY_FAIL: "No match. Take a card.",
  KING_BOUNTY_ACCEPT: "Accept",
  KING_BOUNTY_DECLINE: "Decline",
  BOUNTY_ACCEPTED: "Challenge accepted!",
  BOUNTY_DECLINED: "Challenge declined.",
  COMBO_PAIR: "Discard the pair!",
  COMBO_STRAIGHT: "Discard the straight!",
  COMBO_FLUSH: "Discard the flush!",
  COMBO_BANNER: "Discard combo!",
  DISCARD_BANNER: "Discard!",
  SELECT_DISCARD: "Select ",
  SELECT_SUFFIX: " card(s) to discard.",
  ELIMINATED: " is eliminated!",
  WINNER: " wins the game!",
  VICTORY_BANNER: "Victory!",
  GAME_OVER_BANNER: "Game Over!",
  VICTORY_MSG: "You win the game!",
  GAME_OVER_MSG: "Better luck next time.",
  SETTINGS_BANNER: "Settings",
  LABEL_SPEED: "Game Speed",
  LABEL_DIFFICULTY: "Difficulty",
  LABEL_SOUND: "Sound Effects",
  SPEED_SLOW: "Slow",
  SPEED_NORMAL: "Normal",
  SPEED_FAST: "Fast",
  SOUND_ON: "On",
  SOUND_OFF: "Off",
} as const;

export const ELIMINATION_CAUSES: Record<string, string> = {
  [GameMode.Normal]: "Normal Guess",
  [GameMode.QueenSocial]: "Social Round",
  [GameMode.Sabotage]: "Sabotage",
  [GameMode.Lucky7]: "Lucky 7",
  [GameMode.Triple]: "Triple",
  [GameMode.KingBounty]: "Bounty Challenge",
  SURVIVOR: "Survivor",
  LAST_STANDING: "Last Standing",
} as const;

export const REACTIONS: Record<ReactionType, string[]> = {
  CORRECT: [
    "YES!", "GOT IT!", "NICE!", "BOOM!", "EASY!", "LET'S GO!",
    "CRUSHED IT", "ON FIRE!", "PURE SKILL", "BULLSEYE!",
    "CLUTCH!", "BIG BRAIN!", "TOO GOOD!", "TOO EASY",
    "CALL ME PRO!", "EASY PEEZY!", "WINNING!", "NAILED IT", "PRO MOVES!"
  ],
  INCORRECT: [
    "OH NO!", "DANG!", "TOUGH!", "OOF!", "I'M SO BAD!",
    "ROUGH...", "OUCH!", "NOT TODAY!", "HEARTBREAK!", "SO CLOSE!",
    "RIGGED!", "I'M BROKE", "SAD TIMES!", "TRAGIC", "WHOOPS!",
    "MY EYES!", "HELP!", "I QUIT!", "EXCUSE ME?", "NOOOOOO!"
  ],
  TIE: [
    "AGAIN!", "ONE MORE!", "ANOTHER!", "RE-FLIP!", "STALEMATE!",
    "DEJA VU!", "DO-OVER!", "TWINS!", "COPY CAT", "GLITCH?",
    "REDO!", "WHAT??", "DOUBLE UP", "SNAP!", "BORING!", "AWKWARD..."
  ],
  BOUNTY_HIGH_RISK: [
    "SO RISKY!", "I'M SCARED!", "I SHOULDN'T.", "BIG GAMBLE",
    "PRAYER!", "DANGEROUS", "COWBOY UP!", "SCARY..."
  ],
  BOUNTY_TACTICAL: [
    "I'M IN!", "MAYBE...", "ODDS GOOD!", "SMART PLAY",
    "COIN FLIP", "I'LL RISK", "WHY NOT?", "CALCULATED"
  ],
  BOUNTY_LOW_RISK: [
    "FREE WIN!", "SURE THING", "EASY!", "BANK IT!",
    "NO BRAINER", "LOCKED IN", "GUARANTEED", "SAFE BET"
  ]
} as const;

// ─────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────

export const FormatCard = (card: Card | null | undefined): string => {
  if (!card) return "";
  const rankStr = RANK_LABELS[card.rank] || String(card.rank);
  const colorInitial = card.color ? card.color[0] : "";
  return `${rankStr}${colorInitial}`;
};

export const pickReaction = (type: ReactionType): string => {
  const pool = REACTIONS[type];
  if (!pool || pool.length === 0) return "";
  return pool[Math.floor(Math.random() * pool.length)];
};

export const pickBountyReaction = (handCount: number): string => {
  if (handCount >= 3) return pickReaction("BOUNTY_HIGH_RISK");
  if (handCount === 2) return pickReaction("BOUNTY_TACTICAL");
  return pickReaction("BOUNTY_LOW_RISK");
};