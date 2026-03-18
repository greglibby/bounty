import { Container, Graphics, Text, TextStyle, Application } from 'pixi.js';

export class TableContainer extends Container {
    private app: Application;
    private startButton!: Container;
    private rulesButton!: Container;

    constructor(app: Application) {
        super();
        this.app = app;
        this.createUI();
    }

    private createUI() {
        const buttonStyle = new TextStyle({
            fontFamily: 'Arial',
            fontSize: 36,
            fill: '#ffffff',
            fontWeight: 'bold'
        });

        // 1. START GAME Button (Centered)
        this.startButton = this.createButton("START GAME", 300, 80, 0x27ae60, buttonStyle);
        this.startButton.x = this.app.screen.width / 2;
        this.startButton.y = this.app.screen.height / 2;
        this.addChild(this.startButton);

        // 2. RULES Button (Bottom Row, Right Side, 50% Width)
        const rulesWidth = this.app.screen.width / 2;
        const rulesHeight = 100;
        this.rulesButton = this.createButton("RULES", rulesWidth, rulesHeight, 0x2980b9, buttonStyle);
        
        // Position at bottom right
        this.rulesButton.x = this.app.screen.width - (rulesWidth / 2);
        this.rulesButton.y = this.app.screen.height - (rulesHeight / 2);
        this.addChild(this.rulesButton);

        // Interaction listeners
        this.startButton.on('pointertap', () => this.emit('START_CLICKED'));
        this.rulesButton.on('pointertap', () => console.log("Show Rules Overlay"));
    }

    private createButton(label: string, w: number, h: number, color: number, style: TextStyle): Container {
        const container = new Container();
        
        const bg = new Graphics()
            .roundRect(-w / 2, -h / 2, w, h, 10)
            .fill(color);
        
        const text = new Text({ text: label, style });
        text.anchor.set(0.5);

        container.addChild(bg, text);
        container.eventMode = 'static';
        container.cursor = 'pointer';

        return container;
    }
}