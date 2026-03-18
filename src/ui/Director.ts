import { Application, Container, Text, TextStyle } from "pixi.js";
import { BountyEngine } from "../core/Engine";
import { CardSprite } from "./CardSprite";
import { TableContainer } from "./TableContainer";
import { ActionRow } from "./ActionRow"; 

export class Director {
  private app: Application;
  private engine: BountyEngine;
  private stage: Container;
  private title!: Text;
  private table!: TableContainer;
  private actionRow!: ActionRow;

  constructor(app: Application, engine: BountyEngine) {
    this.app = app;
    this.engine = engine;
    this.stage = this.app.stage;

    this.setupEngineListeners();
  }

  private setupEngineListeners() {
    this.engine.on("CARD_FLIPPED", (payload) => {
      console.log(`🎬 [DIRECTOR] ${payload.player.name} flipped a ${payload.card.color} ${payload.card.rank}`);
      console.log(`🎬 [DIRECTOR] Result: ${payload.result.message}`);
    });

    this.engine.on("CARD_DISCARDED", (payload) => {
      console.log(`🎬 [DIRECTOR] ${payload.player.name} discarded a ${payload.card.color} ${payload.card.rank} from slot ${payload.slotIndex}`);
    });

    this.engine.on("TURN_STARTED", (payload) => {
      const activePlayer = this.engine.players[payload.activePlayerId];
      console.log(`\n======================================`);
      console.log(`🎬 [DIRECTOR] Turn Started: ${activePlayer.name}`);
      console.log(`🎬 [DIRECTOR] Current Mode: ${payload.state.mode}`);
      console.log(`======================================\n`);
      
      // Future: Update actionRow.updateAvailableActions based on game state
    });

    this.engine.on("PLAYER_ELIMINATED", (payload) => {
      console.warn(`☠️ [DIRECTOR] ${payload.player.name} was ELIMINATED via ${payload.player.eliminationData?.cause}!`);
    });

    this.engine.on("GAME_OVER", (payload) => {
      console.error(`🏆 [DIRECTOR] GAME OVER! Winner: ${payload.winner?.name || "DRAW"}`);
    });
  }

  public start() {
    console.log("🚀 Booting PixiJS Director...");

    // 1. Setup the BOUNTY Title
    const titleStyle = new TextStyle({
      fontFamily: "Arial",
      fontSize: 120,
      fontWeight: "bold",
      fill: "#ffffff",
      dropShadow: { color: "#000000", blur: 4, angle: Math.PI / 6, distance: 6 },
    });

    this.title = new Text({ text: "BOUNTY", style: titleStyle });
    this.title.anchor.set(0.5);
    this.title.x = this.app.screen.width / 2;
    this.title.y = 150;
    this.stage.addChild(this.title);

    // 2. Initialize Navigation (Rules/Start buttons)
    this.table = new TableContainer(this.app);
    this.stage.addChild(this.table);

    // 3. Initialize Action Buttons (Higher/Lower/etc)
    this.actionRow = new ActionRow();
    // Position it in the row above the navigation row
    this.actionRow.x = this.app.screen.width / 2;
    this.actionRow.y = this.app.screen.height - 200; 
    this.stage.addChild(this.actionRow);

    // 4. Interaction for the START GAME button
    this.table.on("START_CLICKED", () => {
      console.log("🎬 [DIRECTOR] Game Start Triggered!");
      
      // Transition UI: Hide title and show Action Row
      this.title.visible = false;
      this.actionRow.visible = true;
      
      // Set default buttons for a standard turn start
      this.actionRow.updateAvailableActions(['HIGHER', 'LOWER']);
    });

    // 5. Create the test CardSprite
    const testCard = new CardSprite();
    testCard.x = this.app.screen.width / 2;
    testCard.y = this.app.screen.height / 2;
    this.stage.addChild(testCard);

    // Animation tests
    setTimeout(() => testCard.animateFlip({ color: "Red", rank: 1 }), 1000);
    setTimeout(() => testCard.animateWobble(), 3000);
  }
}