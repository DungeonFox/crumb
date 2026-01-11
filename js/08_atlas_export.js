  // ---------------------------
  // Atlas Export (Aseprite-style JSON + PNG)
  // ---------------------------
  async function exportAtlas(cardRoot){
    const root = resolveCardRoot(cardRoot);
    const plan = registry.roots.recipe ? buildRenderPlan(registry.roots.recipe) : null;
    if (!plan || plan.frames.length === 0){
      log("Nothing to export (missing recipe/frames).", "bad", root);
      return;
    }
    const outW = plan.outSize.w, outH = plan.outSize.h;

    // Choose packing: fixed max width.
    const MAX_W = 2048;
    const cols = Math.max(1, Math.floor(MAX_W / outW));
    const rows = Math.ceil(plan.frames.length / cols);
    const atlasW = cols * outW;
    const atlasH = rows * outH;

    const atlas = document.createElement("canvas");
    atlas.width = atlasW;
    atlas.height = atlasH;
    const actx = atlas.getContext("2d", { willReadFrequently: true });
    actx.imageSmoothingEnabled = false;

    const framesJson = {};

    // draw each composed frame into atlas
    for (let i=0;i<plan.frames.length;i++){
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * outW;
      const y = row * outH;

      // compose into a scratch canvas
      const scratch = document.createElement("canvas");
      scratch.width = outW; scratch.height = outH;
      const sctx = scratch.getContext("2d", { willReadFrequently: true });
      sctx.imageSmoothingEnabled = false;

      await composeFrameToCanvas(plan, i, sctx);
      actx.drawImage(scratch, x, y);

      const f = plan.frames[i];
      const nameBase = (f.node?.name && String(f.node.name).trim()) ? String(f.node.name).trim() : `frame_${String(i).padStart(3,"0")}`;
      const frameName = nameBase;

      framesJson[frameName] = {
        frame: { x, y, w: outW, h: outH },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: outW, h: outH },
        sourceSize: { w: outW, h: outH },
        duration: Math.max(1, +f.node?.duration || 100)
      };
    }

    const meta = {
      app: "Hex‑Graph Sprite Flipbook Tool",
      version: "1.0",
      image: "atlas.png",
      format: "RGBA8888",
      size: { w: atlasW, h: atlasH },
      scale: "1",
      frameTags: []
    };

    const jsonOut = { frames: framesJson, meta };

    // Export
    atlas.toBlob((blob) => {
      if (!blob){
        log("PNG export failed.", "bad", root);
        return;
      }
      downloadBlob("atlas.png", blob);
      downloadText("atlas.json", JSON.stringify(jsonOut, null, 2));
      log(`Exported atlas.png (${atlasW}x${atlasH}) and atlas.json (${plan.frames.length} frames).`, "info", root);
    }, "image/png");
  }
