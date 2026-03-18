import { CARD_COLORS, STREWN_CONFIG } from '../types/constants';
import { Card, Player } from '../types/entities';

export interface GameContext {
  deck: Card[];
  discardPile: Card[];
  upCard: Card | null;
  players: Player[];
}

export const Actions = {
  shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  },

  draw(game: GameContext): Card | null {
    const deck = game.deck;

    if (!deck || deck.length === 0) {
      return null;
    }

    return deck.pop() || null;
  },

  prepareGameDeck(game: GameContext): void {
    const allCards: Card[] = [];

    for (const c of CARD_COLORS) {
      for (let r = 1; r <= 13; r++) {
        allCards.push({ color: c, rank: r });
      }
    }

    const inHandIDs = new Set<string>();
    
    // 2. Fixed Implicit 'any': Explicitly type 'p' and 'c' in the loops
    game.players.forEach((p: Player) => {
      if (p.hand) {
        p.hand.forEach((c: Card | null) => {
          if (c) inHandIDs.add(`${c.rank}-${c.color}`);
        });
      }
    });

    // 3. Fixed Implicit 'any': Explicitly type 'c' here as well
    const newDeck = allCards.filter(
      (c: Card) => !inHandIDs.has(`${c.rank}-${c.color}`)
    );

    game.deck = this.shuffle(newDeck);
    game.discardPile = [];
  },

  updateUpCard(game: GameContext, card: Card): void {
    this.commitToDiscard(game, card);
  },

  commitToDiscard(game: GameContext, card: Card): void {
    if (!card) return;
    
    if (!game.discardPile) {
      game.discardPile = [];
    }
    const registry = game.discardPile;

    if (registry.length === 0) {
      card._strewn = { rot: 3, offset: "A" };
    } else {
      const prev = registry[registry.length - 1];
      const prevRot = prev?._strewn?.rot;
      const prevOff = prev?._strewn?.offset;
      
      let newRot: number;
      let newOffset: string;
      
      const rots = STREWN_CONFIG.ROTATIONS;
      const offs = STREWN_CONFIG.OFFSETS;
      
      do { 
        newRot = rots[Math.floor(Math.random() * rots.length)]; 
      } while (newRot === prevRot && rots.length > 1);
      
      do { 
        newOffset = offs[Math.floor(Math.random() * offs.length)]; 
      } while (newOffset === prevOff && offs.length > 1);
      
      card._strewn = { rot: newRot, offset: newOffset };
    }
    
    registry.push(card);
    game.upCard = card;
  }
};