import { CardColor, Rank, StrewnMeta } from './constants';

export interface Card {
  color: CardColor;
  rank: Rank;
  _strewn?: StrewnMeta;
}

export interface EliminationData {
  outOrder: number;
  cause: string;
  finalHand: Card[];
  round: number;
  matchRank?: Rank; 
}

export interface Player {
  id: number;
  name: string;
  hand: (Card | null)[]; 
  isEliminated: boolean;
  eliminationData: EliminationData | null;
  ceremonyCard?: Card;   
}