import { SoundManager } from "./SoundManager.js";
import { STREWN_CONFIG } from "../constants.js";

export const Actions = {
  shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  },

  draw(game) {
    const deck = game.deck || (game.state && game.state.deck);
    const discard =
      game.discardPile || (game.state && game.state.discardPile) || [];

    if (!deck) return null;

    if (deck.length === 0) {
      if (discard.length === 0) return null;
      return null;
    }

    return deck.pop();
  },

  prepareGameDeck(game) {
    const allCards = [];
    const colors = ["Yellow", "Red", "Blue", "Green"];

    // 1. Rebuild the master 52-card set
    for (let c of colors) {
      for (let r = 1; r <= 13; r++) {
        allCards.push({ color: c, rank: r });
      }
    }

    // 2. Filter out cards currently in hands
    const inHandIDs = new Set();
    game.players.forEach((p) => {
      if (p.hand) {
        p.hand.forEach((c) => {
          if (c) inHandIDs.add(`${c.rank}-${c.color}`);
        });
      }
    });

    const newDeck = allCards.filter(
      (c) => !inHandIDs.has(`${c.rank}-${c.color}`),
    );

    // 3. Reset physical piles
    game.deck = this.shuffle(newDeck);
    game.discardPile = [];
  },

  // ALIAS: Catch legacy specialist calls and force them through the Commit Gate
  updateUpCard(game, card) {
    this.commitToDiscard(game, card);
  },

  commitToDiscard(game, card) {
    if (!card) return;
    
    const registry = game.discardPile || [];
    if (!game.discardPile) game.discardPile = registry;

    if (registry.length === 0) {
      card._strewn = { rot: 3, offset: "A" };
    } else {
      const prev = registry[registry.length - 1];
      const prevRot = prev?._strewn?.rot;
      const prevOff = prev?._strewn?.offset;
      
      let newRot, newOffset;
      const rots = STREWN_CONFIG.ROTATIONS;
      const offs = STREWN_CONFIG.OFFSETS;
      
      // --- THE FIX: DYNAMIC ARRAY LENGTHS ---
      // Constraint 1: Rotation index cannot match the previous card
      do { 
        newRot = rots[Math.floor(Math.random() * rots.length)]; 
      } while (newRot === prevRot);
      
      // Constraint 2: Offset letter cannot match the previous card
      do { 
        newOffset = offs[Math.floor(Math.random() * offs.length)]; 
      } while (newOffset === prevOff);
      
      card._strewn = { rot: newRot, offset: newOffset };
    }
    
    registry.push(card);
    game.upCard = card;
  }
};