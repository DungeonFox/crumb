  // ---------------------------
  // Renderer (flipbook compositing)
  // ---------------------------
  const rendererStates = new WeakMap();
  const sharedImages = new Map(); // assetId -> HTMLImageElement

  function getRendererState(cardRoot){
    const root = resolveCardRoot(cardRoot);
    if (!root) return null;
    let state = rendererStates.get(root);
    if (state) return state;
    const previewCanvas = $role(root, "preview-canvas");
    const pctx = previewCanvas ? previewCanvas.getContext("2d", { willReadFrequently: true }) : null;
    state = {
      previewCanvas,
      pctx,
      images: new Map(),
      playing: false,
      curFrame: 0,
      nextAt: 0
    };
    rendererStates.set(root, state);
    return state;
  }

  async function ensureAssetImage(assetId, imageCache){
    const asset = getNode(assetId);
    if (!asset || asset.type !== "Asset") return null;
    const cache = imageCache || sharedImages;
    if (cache.has(assetId)) return cache.get(assetId);

    const rawSrc = asset.src || "";
    const src = (typeof window.resolveAssetSrc === "function") ? (window.resolveAssetSrc(rawSrc) || "") : rawSrc;

    if (!src || typeof src !== "string" || !src.startsWith("data:image/")){
      // Can\'t load; keep placeholder
      return null;
    }

    const img = new Image();
    img.decoding = "async";
    const prom = new Promise((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image load failed"));
    });
    img.src = src;
    try{
      await prom;
      cache.set(assetId, img);
      return img;
    } catch {
      return null;
    }
  }

  function computeOutputSize(template){
    const w = Math.max(1, (+template.tileW||1) * (+template.gridW||1));
    const h = Math.max(1, (+template.tileH||1) * (+template.gridH||1));
    return {w, h};
  }

  function buildRenderPlan(recipeId){
    if (registry.caches.plan.has(recipeId)) return registry.caches.plan.get(recipeId);

    const recipe = getNode(recipeId);
    if (!recipe || recipe.type !== "Recipe") return null;
    const tpl = getNode(recipe.template);
    if (!tpl || tpl.type !== "Template") return null;

    const frames = (tpl.frames || []).map(fid => ({ id: fid, node: getNode(fid) })).filter(x => x.node && x.node.type === "FrameSlot");
    const rectById = new Map();
    for (const rid of (tpl.rects || [])){
      const r = getNode(rid);
      if (r && r.type === "Rect") rectById.set(rid, r);
    }

    const layers = (recipe.layers || []).map(lid => ({ id: lid, node: getNode(lid) })).filter(x => x.node && x.node.type === "Layer");

    const outSize = computeOutputSize(tpl);

    const plan = { recipeId, tplId: recipe.template, outSize, frames, layers, rectById };
    registry.caches.plan.set(recipeId, plan);
    return plan;
  }

  async function composeFrameToCanvas(plan, frameIndex, targetCtx, imageCache){
    const tpl = getNode(plan.tplId);
    const outW = plan.outSize.w, outH = plan.outSize.h;
    targetCtx.clearRect(0,0,outW,outH);

    // Debug background checker
    const cs = 8;
    for (let y=0;y<outH;y+=cs){
      for (let x=0;x<outW;x+=cs){
        targetCtx.fillStyle = ((x/cs + y/cs) % 2 === 0) ? "#0c1118" : "#0a0e14";
        targetCtx.fillRect(x,y,cs,cs);
      }
    }

    const f = plan.frames[frameIndex];
    if (!f) return;

    for (const L of plan.layers){
      const layer = L.node;
      if (!layer.visible) continue;

      const ovr = (layer.overrides && typeof layer.overrides === "object") ? layer.overrides : {};
      const ov = ovr[f.id] || {};
      const rectId = (ov.rect || layer.defaultRect || "");
      const rect = plan.rectById.get(rectId);
      if (!rect) continue;

      const assetId = layer.asset || rect.asset;
      const img = await ensureAssetImage(assetId, imageCache);
      if (!img) {
        // draw placeholder
        targetCtx.save();
        targetCtx.globalAlpha = 0.8;
        targetCtx.fillStyle = "rgba(255,204,102,0.20)";
        targetCtx.strokeStyle = "rgba(255,204,102,0.55)";
        targetCtx.lineWidth = 2;
        const dx = (+rect.dx||0) + (+ov.dx||0);
        const dy = (+rect.dy||0) + (+ov.dy||0);
        const dw = (+rect.dw||+rect.sw||0);
        const dh = (+rect.dh||+rect.sh||0);
        targetCtx.fillRect(dx,dy,dw,dh);
        targetCtx.strokeRect(dx+1,dy+1,Math.max(0,dw-2),Math.max(0,dh-2));
        targetCtx.fillStyle = "rgba(255,204,102,0.85)";
        targetCtx.font = "12px ui-monospace";
        targetCtx.fillText("missing asset", dx+4, dy+14);
        targetCtx.restore();
        continue;
      }

      const layerOpacity = (layer.opacity !== undefined) ? clamp01(+layer.opacity) : 1.0;
      const ovOpacity = (ov.opacity !== undefined) ? clamp01(+ov.opacity) : 1.0;

      const sx = +rect.sx||0, sy = +rect.sy||0, sw = +rect.sw||0, sh = +rect.sh||0;
      const dx = (+rect.dx||0) + (+ov.dx||0);
      const dy = (+rect.dy||0) + (+ov.dy||0);
      const dw = (+rect.dw||sw||0);
      const dh = (+rect.dh||sh||0);

      targetCtx.save();
      targetCtx.globalAlpha = clamp01(layerOpacity * ovOpacity);
      targetCtx.imageSmoothingEnabled = false;
      targetCtx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
      targetCtx.restore();
    }
  }

  function setPlayButtonState(cardRoot, isPlaying){
    const root = resolveCardRoot(cardRoot);
    const btn = root ? $role(root, "btn-play") : null;
    if (!btn) return;
    btn.textContent = isPlaying ? "⏸" : "▶";
    btn.setAttribute("aria-pressed", isPlaying ? "true" : "false");
    btn.title = isPlaying ? "Pause preview" : "Play preview";
    btn.setAttribute("aria-label", isPlaying ? "Pause preview" : "Play preview");
  }

  function getFrameDurationMs(plan, idx){
    const f = plan.frames[idx]?.node;
    const d = f ? (+f.duration||100) : 100;
    return Math.max(1, d);
  }

  async function renderOnce(cardRoot){
  const root = resolveCardRoot(cardRoot);
  if (!root) return;
  if (typeof window.withCardRegistry === "function"){
    return window.withCardRegistry(root, () => __renderOnceInner(root));
  }
  return __renderOnceInner(root);
}

async function __renderOnceInner(root){
    const state = getRendererState(root);
    if (!state || !state.previewCanvas || !state.pctx) return;
    const plan = registry.roots.recipe ? buildRenderPlan(registry.roots.recipe) : null;
    if (!plan){
      state.pctx.clearRect(0,0,state.previewCanvas.width, state.previewCanvas.height);
      const frameInfo = $role(root, "frame-info");
      const sizeInfo = $role(root, "size-info");
      if (frameInfo) frameInfo.textContent = "(no plan)";
      if (sizeInfo) sizeInfo.textContent = "-";
      return;
    }
    const outW = plan.outSize.w, outH = plan.outSize.h;
    if (state.previewCanvas.width !== outW || state.previewCanvas.height !== outH){
      state.previewCanvas.width = outW; state.previewCanvas.height = outH;
    }
    await composeFrameToCanvas(plan, state.curFrame, state.pctx, state.images);

    const f = plan.frames[state.curFrame];
    const fname = f?.node?.name || `#${state.curFrame}`;
    const frameInfo = $role(root, "frame-info");
    const sizeInfo = $role(root, "size-info");
    const playMini = $role(root, "play-mini");
    if (frameInfo){
      frameInfo.textContent = `${state.curFrame}/${Math.max(0,plan.frames.length-1)}  ${fname}  (${getFrameDurationMs(plan,state.curFrame)}ms)`;
    }
    if (sizeInfo) sizeInfo.textContent = `${outW}×${outH}`;
    if (playMini) playMini.textContent = state.playing ? "playing" : "stopped";
  
}

  async function tick(cardRoot){
  const root = resolveCardRoot(cardRoot);
  if (!root) return;
  if (typeof window.withCardRegistry === "function"){
    return window.withCardRegistry(root, () => __tickInner(root));
  }
  return __tickInner(root);
}

async function __tickInner(root){
    const state = getRendererState(root);
    if (!state || !state.playing){ return; }
    const plan = registry.roots.recipe ? buildRenderPlan(registry.roots.recipe) : null;
    if (!plan || plan.frames.length === 0){
      state.playing = false;
      setPlayButtonState(root, false);
      const playMini = root ? $role(root, "play-mini") : null;
      if (playMini) playMini.textContent = "stopped";
      return;
    }
    const now = performance.now();
    if (now >= state.nextAt){
      await renderOnce(root);
      const dur = getFrameDurationMs(plan, state.curFrame);
      state.nextAt = now + dur;
      state.curFrame = (state.curFrame + 1) % plan.frames.length;
      // notify popout
      pushStateToPopout(false, root);
    }
    requestAnimationFrame(() => tick(root));
  
}
