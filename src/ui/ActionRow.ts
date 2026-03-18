import { Container, Graphics, Text, TextStyle } from 'pixi.js';

export class ActionRow extends Container {
  private buttons: Map<string, Container> = new Map();

  constructor() {
    super();
    this.createActions();
    this.visible = false; // Hidden by default until the game starts
  }

  private createActions() {
    const buttonStyle = new TextStyle({
      fontFamily: 'Arial',
      fontSize: 24,
      fill: '#ffffff',
      fontWeight: 'bold'
    });

    // We define the button groups based on your game mechanics
    const actions = [
      { id: 'HIGHER', label: 'HIGHER', color: 0x27ae60 },
      { id: 'LOWER', label: 'LOWER', color: 0xc0392b },
      { id: 'ACCEPT', label: 'ACCEPT', color: 0x2980b9 },
      { id: 'DECLINE', label: 'DECLINE', color: 0x7f8c8d },
      { id: 'SUIT', label: 'SUIT', color: 0x8e44ad },
      { id: 'COLOR', label: 'COLOR', color: 0xd35400 }
    ];

    let currentX = 0;
    const spacing = 140;

    actions.forEach((action) => {
      const btn = this.createButton(action.label, 120, 60, action.color, buttonStyle);
      btn.x = currentX;
      
      btn.on('pointertap', () => {
        console.log(`🎬 [ACTION] ${action.id} clicked`);
        this.emit('ACTION_CLICKED', action.id);
      });

      this.addChild(btn);
      this.buttons.set(action.id, btn);
      currentX += spacing;
    });

    // Center the entire row based on its width
    this.pivot.x = this.width / 2;
  }

  private createButton(label: string, w: number, h: number, color: number, style: TextStyle): Container {
    const container = new Container();
    
    const bg = new Graphics()
      .roundRect(-w / 2, -h / 2, w, h, 8)
      .fill(color);
    
    const text = new Text({ text: label, style });
    text.anchor.set(0.5);

    container.addChild(bg, text);
    container.eventMode = 'static';
    container.cursor = 'pointer';

    return container;
  }

  /**
   * Toggle which buttons are visible based on the current game state 
   * (e.g., only show Higher/Lower during a standard turn)
   */
  public updateAvailableActions(allowedIds: string[]) {
    this.buttons.forEach((btn, id) => {
      btn.visible = allowedIds.includes(id);
    });
  }
}