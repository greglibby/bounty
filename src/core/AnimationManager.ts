import { View } from "../ui/View.js";
import type { Card } from "../types/index.js";

interface FlyOptions {
  startRotation?: number;
  endRotation?: number;
  targetWidth?: number;
  duration?: number;
}

export const AnimationManager = {
  async flyRectToRect(
    startRect: DOMRect,
    endRect: DOMRect,
    imgPath: string,
    options: FlyOptions = {},
  ): Promise<void> {
    return new Promise((resolve) => {
      const ghost = document.createElement("img");
      ghost.src = imgPath;
      ghost.className = "ghost-card";

      ghost.style.left = `${startRect.left}px`;
      ghost.style.top = `${startRect.top}px`;
      ghost.style.width = `${startRect.width}px`;
      ghost.style.height = `${startRect.height}px`;

      const startRot = options.startRotation || 0;
      ghost.style.transform = `rotate(${startRot}deg)`;

      // Force hardware acceleration
      ghost.style.willChange = "transform";

      document.body.appendChild(ghost);
      void ghost.offsetWidth; // Force reflow

      const startCenterX = startRect.left + startRect.width / 2;
      const startCenterY = startRect.top + startRect.height / 2;
      const endCenterX = endRect.left + endRect.width / 2;
      const endCenterY = endRect.top + endRect.height / 2;

      const deltaX = endCenterX - startCenterX;
      const deltaY = endCenterY - startCenterY;

      const scale = options.targetWidth
        ? options.targetWidth / startRect.width
        : endRect.width / startRect.width;

      const endRot = options.endRotation || 0;
      const duration = options.duration || 200;

      ghost.style.transition = `transform ${duration}ms cubic-bezier(0.25, 1, 0.35, 1)`;
      // Use translate3d to guarantee GPU rendering
      ghost.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scale}) rotate(${endRot}deg)`;

      ghost.addEventListener(
        "transitionend",
        () => {
          ghost.remove();
          resolve();
        },
        { once: true },
      );
    });
  },

  async flyAndFlip(
    startRect: DOMRect,
    endRect: DOMRect,
    faceImgPath: string,
    backImgPath: string,
    options: FlyOptions = {},
  ): Promise<void> {
    return new Promise((resolve) => {
      const container = document.createElement("div");
      container.className = "ghost-card-container";

      const cardHeight = startRect.width * (1065 / 750);

      container.style.left = `${startRect.left}px`;
      container.style.top = `${startRect.top}px`;
      container.style.width = `${startRect.width}px`;
      container.style.height = `${cardHeight}px`;

      // Prep for GPU handoff
      container.style.willChange = "transform";

      container.innerHTML = `
        <div class="ghost-card-flip-inner" style="will-change: transform;">
          <img src="${faceImgPath}" class="ghost-card-front">
          <img src="${backImgPath}" class="ghost-card-back">
        </div>
      `;

      document.body.appendChild(container);
      void container.offsetWidth;

      const innerCard = container.querySelector(
        ".ghost-card-flip-inner",
      ) as HTMLElement;
      const flipDuration = options.duration ? options.duration * 0.4 : 200;

      innerCard.style.transition = `transform ${flipDuration}ms ease-in-out`;

      requestAnimationFrame(() => {
        innerCard.style.transform = "rotateY(-180deg)";
      });

      innerCard.addEventListener(
        "transitionend",
        () => {
          container.style.transition = "none";
          container.style.left = `${startRect.left - startRect.width}px`;

          innerCard.style.transition = "none";
          innerCard.style.transform = "rotateY(0deg)";
          innerCard.innerHTML = `<img src="${faceImgPath}" style="width: 100%; height: 100%; border-radius: inherit; box-shadow: 0 8px 20px rgba(0,0,0,0.4);">`;

          void container.offsetWidth;

          const flyDuration = options.duration ? options.duration * 0.6 : 300;
          const newStartRect = container.getBoundingClientRect();

          const startCenterX = newStartRect.left + newStartRect.width / 2;
          const startCenterY = newStartRect.top + newStartRect.height / 2;
          const endCenterX = endRect.left + endRect.width / 2;
          const endCenterY = endRect.top + endRect.height / 2;

          const deltaX = endCenterX - startCenterX;
          const deltaY = endCenterY - startCenterY;

          const scale = options.targetWidth
            ? options.targetWidth / newStartRect.width
            : endRect.width / newStartRect.width;
          const endRot = options.endRotation || 0;

          container.style.transition = `transform ${flyDuration}ms cubic-bezier(0.25, 1, 0.35, 1)`;
          // Use translate3d to guarantee GPU rendering
          container.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scale}) rotate(${endRot}deg)`;

          container.addEventListener(
            "transitionend",
            () => {
              container.remove();
              resolve();
            },
            { once: true },
          );
        },
        { once: true },
      );
    });
  },

  async flyDrawToCenter(card: Card | null): Promise<void> {
    const drawSlot = document.getElementById("draw-pile-slot");
    const discardSlot = document.getElementById("discard-pile-slot");
    if (!drawSlot || !discardSlot || !card) return Promise.resolve();

    const startRect = drawSlot.getBoundingClientRect();
    const strewnCards = discardSlot.querySelectorAll(".strewn-card");
    const targetCard = strewnCards[strewnCards.length - 1] as HTMLElement | undefined;

    let endRect: DOMRect,
      endRot = 0,
      targetWidth: number;

    if (targetCard) {
      endRect = targetCard.getBoundingClientRect();
      targetWidth = (targetCard as HTMLElement).offsetWidth;

      const transformStr = (targetCard as HTMLElement).style.transform;
      const rotateMatch = transformStr.match(/rotate\(([-0-9.]+)deg\)/);
      if (rotateMatch) endRot = parseFloat(rotateMatch[1]);
    } else {
      endRect = discardSlot.getBoundingClientRect();
      targetWidth = discardSlot.offsetWidth;
    }

    const faceImg = View.getCardImagePath(card);
    const backImg = "images/cards/Back.png";

    await this.flyAndFlip(startRect, endRect!, faceImg, backImg, {
      duration: 200,
      endRotation: endRot,
      targetWidth: targetWidth!,
    });
  },

  /**
   * Sequence 2: Center (Transient Slot) -> Player Hand
   */
  async flyTransientToHand(
    playerIdx: number,
    card: Card | null,
    startRect: DOMRect | null,
  ): Promise<void> {
    if (!startRect || !card) return Promise.resolve();

    const imgPath = View.getCardImagePath(card);
    const playerBox = document.getElementById(`player-${playerIdx}`);
    if (!playerBox) return Promise.resolve();

    const targetImg = Array.from(
      playerBox.querySelectorAll<HTMLImageElement>(".card-img"),
    ).find((img) => img.src.includes(imgPath.replace("images/", "")));

    if (!targetImg) return Promise.resolve();

    const endRect = targetImg.getBoundingClientRect();

    targetImg.style.opacity = "0";
    await this.flyRectToRect(startRect, endRect, imgPath, {
      duration: 200,
      targetWidth: targetImg.offsetWidth, // Exact match to destination size
    });
    targetImg.style.opacity = "1";
  },

  async flyToDiscard(startRect: DOMRect, card: Card | null): Promise<void> {
    const discardSlot = document.getElementById("discard-pile-slot");
    if (!discardSlot || !card) return Promise.resolve();

    const imgPath = View.getCardImagePath(card);
    const targetWidth = discardSlot.offsetWidth;

    const allImgs = discardSlot.querySelectorAll(".card-img");
    const targetImg = allImgs[allImgs.length - 1] as HTMLElement | undefined;

    let endRot = 0;
    let targetParent: HTMLElement | null = null;

    if (targetImg) {
      targetParent =
        (targetImg as HTMLElement).closest(".strewn-card") ||
        (targetImg as HTMLElement);
      const transformStr = targetParent ? targetParent.style.transform : "";
      const rotateMatch = transformStr.match(/rotate\(([-0-9.]+)deg\)/);
      if (rotateMatch) endRot = parseFloat(rotateMatch[1]);

      // Hide physical target
      targetParent.style.opacity = "0";
    }

    const endRect = discardSlot.getBoundingClientRect();

    await this.flyRectToRect(startRect, endRect, imgPath, {
      duration: 200,
      endRotation: endRot,
      targetWidth: targetWidth,
    });

    // Reveal physical target when flight completes
    if (targetParent) targetParent.style.opacity = "1";
  },

  async flyHandToDiscard(startRect: DOMRect, card: Card | null): Promise<void> {
    const discardSlot = document.getElementById("discard-pile-slot");
    if (!discardSlot || !card) return Promise.resolve();

    const strewnCards = discardSlot.querySelectorAll(".strewn-card");
    const targetCard = strewnCards[strewnCards.length - 1] as HTMLElement | undefined;

    if (!targetCard) return Promise.resolve();

    const endRect = targetCard.getBoundingClientRect();
    const targetWidth = targetCard.offsetWidth;
    const imgPath = View.getCardImagePath(card);

    let endRot = 0;
    const transformStr = targetCard.style.transform;
    const rotateMatch = transformStr.match(/rotate\(([-0-9.]+)deg\)/);
    if (rotateMatch) endRot = parseFloat(rotateMatch[1]);

    // Hide physical target
    targetCard.style.opacity = "0";

    await this.flyRectToRect(startRect, endRect, imgPath, {
      duration: 200,
      endRotation: endRot,
      targetWidth: targetWidth,
    });

    // Reveal physical target when flight completes
    targetCard.style.opacity = "1";
  },

  /**
   * Sequence: Draw Pile -> Player Hand (Opening Ceremony)
   */
  async flyDrawToHand(playerIdx: number, card: Card | null): Promise<void> {
    const drawSlot = document.getElementById("draw-pile-slot");
    if (!drawSlot || !card) return Promise.resolve();

    const imgPath = View.getCardImagePath(card);
    const playerBox = document.getElementById(`player-${playerIdx}`);
    if (!playerBox) return Promise.resolve();

    const targetImg = Array.from(
      playerBox.querySelectorAll<HTMLImageElement>(".card-img"),
    ).find((img) => img.src.includes(imgPath.replace("images/", "")));

    if (!targetImg) return Promise.resolve();

    const startRect = drawSlot.getBoundingClientRect();
    const endRect = targetImg.getBoundingClientRect();

    targetImg.style.opacity = "0";
    await this.flyRectToRect(startRect, endRect, imgPath, {
      duration: 200,
      targetWidth: targetImg.offsetWidth, // Exact match to destination size
    });
    targetImg.style.opacity = "1";
  },
};