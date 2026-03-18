import { Application } from 'pixi.js';
import { BountyEngine } from './core/Engine';
import { Director } from './ui/Director';

// Simple CSS injection to ensure the canvas isn't 0px tall
const style = document.createElement('style');
style.textContent = `
  body { margin: 0; background: #1a1a2e; overflow: hidden; }
  canvas { display: block; width: 100vw; height: 100vh; object-fit: contain; }
`;
document.head.appendChild(style);

async function bootstrap() {
  const app = new Application();
  
  // PixiJS v8 Init
  await app.init({ 
    width: 1920, 
    height: 1080, 
    backgroundColor: 0x1a1a2e,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  document.body.appendChild(app.canvas);

  // Initialize your headless engine and the visual director
  const engine = new BountyEngine();
  const director = new Director(app, engine);
  
  director.start();
}

bootstrap();