import { Container, Sprite, Assets } from 'pixi.js';
import gsap from 'gsap';
import { Card, Rank, CardColor } from '../types/constants';

export class CardSprite extends Container {
  private sprite: Sprite;
  public cardData: Card | null = null;
  private isFaceUp: boolean = false;

  constructor() {
    super();
    
    this.sprite = new Sprite();
    this.sprite.anchor.set(0.5);
    this.sprite.scale.set(0.5); 

    this.addChild(this.sprite);
    
    // Start by showing the back of the card
    this.showBack();
  }

  private getRankString(rank: Rank): string {
    switch (rank) {
      case Rank.Ace: return 'A';
      case Rank.Jack: return 'J';
      case Rank.Queen: return 'Q';
      case Rank.King: return 'K';
      default: return String(rank);
    }
  }

  private getImagePath(color: CardColor, rank: Rank): string {
    const rankStr = this.getRankString(rank);
    // Added leading slash for Vite root-relative pathing
    return `/images/Cards/${color}_${rankStr}.png`;
  }

  public async showBack() {
    this.isFaceUp = false;
    // Added leading slash to match public folder structure
    const texture = await Assets.load('/images/Cards/Back.png');
    this.sprite.texture = texture;
  }

  public async showFront(card: Card) {
    this.cardData = card;
    this.isFaceUp = true;
    const imgPath = this.getImagePath(card.color, card.rank);
    const texture = await Assets.load(imgPath);
    this.sprite.texture = texture;
  }

  public async animateFlip(card: Card) {
    await gsap.to(this.sprite.scale, { x: 0, duration: 0.15, ease: "power1.in" });
    await this.showFront(card);
    await gsap.to(this.sprite.scale, { x: 0.5, duration: 0.15, ease: "power1.out" });
  }

  public animateWobble() {
    gsap.fromTo(this.sprite, 
      { rotation: -0.2 }, 
      { rotation: 0.2, duration: 0.05, yoyo: true, repeat: 5, ease: "linear", 
        onComplete: () => { this.sprite.rotation = 0; } 
      }
    );
  }
}