
(function(){
  // Offscreen rendering & ping-pong buffering tasker for smooth animation

  const canvas = document.querySelector("canvas");
  const ctx = canvas.getContext("2d");

  // Buffer System
  const offscreenCanvas1 = new OffscreenCanvas(canvas.width, canvas.height);
  const offscreenCanvas2 = new OffscreenCanvas(canvas.width, canvas.height);
  let activeBuffer = offscreenCanvas1; // buffer to be rendered
  let idleBuffer = offscreenCanvas2;  // buffer for tasking

  function swapBuffers() {
    // Swap active buffers between visible rendering and tasking
    [activeBuffer, idleBuffer] = [idleBuffer, activeBuffer];
  }

  // Create global cache for spritesheets stored in LocalStorage
  const spriteCache = new Map(); // Store spritesheet image data URLs

  // Load or store a spritesheet when the card's package is loaded/changed
  function storeSpritesheet(cardId, spritesheetDataUrl) {
    try {
      localStorage.setItem(`spritesheet_${cardId}`, spritesheetDataUrl);
      spriteCache.set(cardId, spritesheetDataUrl);
    } catch (e) {
      console.warn("Failed to store spritesheet in LocalStorage:", e);
    }
  }

  // Retrieve the spritesheet from cache or LocalStorage
  function loadSpritesheet(cardId) {
    if (spriteCache.has(cardId)) {
      return spriteCache.get(cardId);
    }
    try {
      const storedDataUrl = localStorage.getItem(`spritesheet_${cardId}`);
      if (storedDataUrl) {
        spriteCache.set(cardId, storedDataUrl);
        return storedDataUrl;
      }
    } catch (e) {
      console.warn("Failed to retrieve spritesheet from LocalStorage:", e);
    }
    return null;
  }

  // Tasker function to render frames in the background buffer
  function renderFrameInBackground(cardId, frameIndex, width, height) {
    const spritesheetDataUrl = loadSpritesheet(cardId);
    if (!spritesheetDataUrl) {
      console.warn(`No spritesheet found for card ${cardId}`);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const imgWidth = img.width;
      const imgHeight = img.height;
      const framesPerRow = Math.floor(imgWidth / width);
      const row = Math.floor(frameIndex / framesPerRow);
      const col = frameIndex % framesPerRow;

      const frameX = col * width;
      const frameY = row * height;

      // Draw the frame in the idle buffer
      const idleCtx = idleBuffer.getContext("2d");
      idleCtx.clearRect(0, 0, canvas.width, canvas.height);
      idleCtx.drawImage(img, frameX, frameY, width, height, 0, 0, width, height);

      // After the frame is rendered, swap buffers for the visible rendering
      swapBuffers();
    };
    img.src = spritesheetDataUrl;
  }

  // The environment tasker calls renderFrameInBackground on each sprite in the environment
  function updateEnvironmentWithCards(cardData) {
    cardData.forEach(({ cardId, frameIndex, width, height }) => {
      renderFrameInBackground(cardId, frameIndex, width, height);
    });
  }

  // Hooking the environment tasker to call updateEnvironmentWithCards
  window.runTask("updateEnvironment", updateEnvironmentWithCards);
})();
