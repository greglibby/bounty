// src/assets/index.ts
import type { CardColor } from "../types/index.js";

// ── Cards ──────────────────────────────────────────────────────────────────

const cardModules = import.meta.glob<{ default: string }>(
  "./cards/*.png",
  { eager: true }
);

const RANK_TO_LABEL: Record<number, string> = {
  1:  "A",
  11: "J",
  12: "Q",
  13: "K",
};

function cardKey(color: CardColor, rank: number): string {
  const label = RANK_TO_LABEL[rank] ?? String(rank);
  return `./cards/${color}_${label}.png`;
}

export function getCardImage(color: CardColor, rank: number): string {
  const key = cardKey(color, rank);
  return cardModules[key]?.default ?? "";
}

export const cardBackImage: string =
  (cardModules["./cards/Back.png"] as { default: string })?.default ?? "";

export const deckImage: string =
  (cardModules["./cards/Deck.png"] as { default: string })?.default ?? "";

// ── Avatars ────────────────────────────────────────────────────────────────

const avatarModules = import.meta.glob<{ default: string }>(
  "./avatars/*.png",
  { eager: true }
);

export function getAvatarImage(filename: string): string {
  const key = `./avatars/${filename}`;
  return avatarModules[key]?.default ?? "";
}

// All avatar filenames available at runtime (useful for a picker UI)
export const allAvatars: string[] = Object.keys(avatarModules).map(
  (k) => k.replace("./avatars/", "")
);

// ── Background ─────────────────────────────────────────────────────────────

import bgGame from "./bg/bg-game.png";
export { bgGame };