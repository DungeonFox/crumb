  // ---------------------------
  // Deterministic Re-ID (topological)
  // ---------------------------
  function recomputeIdsTopologically(cardRoot){
    const root = resolveCardRoot(cardRoot);
    const deterministic = root ? $role(root, "deterministic-ids") : null;
    const enabled = deterministic ? deterministic.checked : false;
    if (!enabled){
      log("Deterministic IDs is off; recompute skipped.", "warn", root);
      return;
    }

    // Gather current graph starting at roots (best-effort, but we also include all nodes of known types).
    const assets = listNodesOfType("Asset").map(x => x.id);
    const rects  = listNodesOfType("Rect").map(x => x.id);
    const frames = listNodesOfType("FrameSlot").map(x => x.id);
    const layers = listNodesOfType("Layer").map(x => x.id);
    const tpls   = listNodesOfType("Template").map(x => x.id);
    const recs   = listNodesOfType("Recipe").map(x => x.id);
    const tasks  = listNodesOfType("Task").map(x => x.id);

    // Stable ordering to keep deterministic mapping.
    assets.sort(); rects.sort(); frames.sort(); layers.sort(); tpls.sort(); recs.sort(); tasks.sort();

    const oldToNew = new Map();

    // 1) Assets
    for (const id of assets){
      const n = deepClone(getNode(id));
      if (!n) continue;
      const payload = {name:n.name || "", src:n.src || ""};
      const newId = makeId("asset", "Asset", payload);
      oldToNew.set(id, newId);
    }
    // 2) Rects (rewrite asset ref first using oldToNew)
    for (const id of rects){
      const n = deepClone(getNode(id));
      if (!n) continue;
      const assetRef = oldToNew.get(n.asset) || n.asset || "";
      const payload = {
        name:n.name||"",
        asset:assetRef,
        sx:+n.sx||0, sy:+n.sy||0, sw:+n.sw||0, sh:+n.sh||0,
        dx:+n.dx||0, dy:+n.dy||0, dw:+n.dw||0, dh:+n.dh||0
      };
      const newId = makeId("tpl", "Rect", payload);
      oldToNew.set(id, newId);
    }
    // 3) FrameSlots
    for (const id of frames){
      const n = deepClone(getNode(id));
      if (!n) continue;
      const payload = { name:n.name||"", duration: Math.max(0, +n.duration||0) };
      const newId = makeId("tpl", "FrameSlot", payload);
      oldToNew.set(id, newId);
    }
    // 4) Layers (rewrite refs; overrides keys are FrameSlot IDs)
    for (const id of layers){
      const n = deepClone(getNode(id));
      if (!n) continue;
      const ovr = {};
      const overrides = n.overrides && typeof n.overrides === "object" ? n.overrides : {};
      for (const [k, v] of Object.entries(overrides)){
        const newK = oldToNew.get(k) || k;
        const vv = v && typeof v === "object" ? v : {};
        ovr[newK] = {
          rect: vv.rect ? (oldToNew.get(vv.rect) || vv.rect) : undefined,
          dx: vv.dx !== undefined ? +vv.dx : undefined,
          dy: vv.dy !== undefined ? +vv.dy : undefined,
          opacity: vv.opacity !== undefined ? clamp01(+vv.opacity) : undefined
        };
      }
      const payload = {
        name:n.name||"",
        visible: !!n.visible,
        asset: n.asset ? (oldToNew.get(n.asset) || n.asset) : "",
        defaultRect: n.defaultRect ? (oldToNew.get(n.defaultRect) || n.defaultRect) : "",
        opacity: n.opacity !== undefined ? clamp01(+n.opacity) : 1.0,
        overrides: canonicalize(ovr)
      };
      const newId = makeId("anim", "Layer", payload);
      oldToNew.set(id, newId);
    }
    // 5) Templates
    for (const id of tpls){
      const n = deepClone(getNode(id));
      if (!n) continue;
      const payload = {
        tileW: Math.max(1, +n.tileW||1),
        tileH: Math.max(1, +n.tileH||1),
        gridW: Math.max(1, +n.gridW||1),
        gridH: Math.max(1, +n.gridH||1),
        rects: Array.isArray(n.rects) ? n.rects.map(r => oldToNew.get(r) || r) : [],
        frames: Array.isArray(n.frames) ? n.frames.map(f => oldToNew.get(f) || f) : []
      };
      const newId = makeId("tpl", "Template", payload);
      oldToNew.set(id, newId);
    }
    // 6) Recipes
    for (const id of recs){
      const n = deepClone(getNode(id));
      if (!n) continue;
      const payload = {
        template: n.template ? (oldToNew.get(n.template) || n.template) : "",
        layers: Array.isArray(n.layers) ? n.layers.map(l => oldToNew.get(l) || l) : []
      };
      const newId = makeId("anim", "Recipe", payload);
      oldToNew.set(id, newId);
    }
    // 7) Tasks
    for (const id of tasks){
      const n = deepClone(getNode(id));
      if (!n) continue;
      const payload = {
        name: n.name || "",
        commands: canonicalize(n.commands || [])
      };
      const newId = makeId("tsk", "Task", payload);
      oldToNew.set(id, newId);
    }

    // Apply: rebuild node map with rewritten IDs and rewritten references.
    const newNodes = new Map();
    for (const [oldId, node] of registry.nodes.entries()){
      const newId = oldToNew.get(oldId) || oldId;
      const n = deepClone(node);

      // rewrite known ref fields
      if (n.type === "Rect"){
        if (n.asset) n.asset = oldToNew.get(n.asset) || n.asset;
      } else if (n.type === "Template"){
        n.rects = Array.isArray(n.rects) ? n.rects.map(x => oldToNew.get(x) || x) : [];
        n.frames = Array.isArray(n.frames) ? n.frames.map(x => oldToNew.get(x) || x) : [];
      } else if (n.type === "Layer"){
        if (n.asset) n.asset = oldToNew.get(n.asset) || n.asset;
        if (n.defaultRect) n.defaultRect = oldToNew.get(n.defaultRect) || n.defaultRect;
        const out = {};
        const overrides = n.overrides && typeof n.overrides === "object" ? n.overrides : {};
        for (const [k, v] of Object.entries(overrides)){
          const nk = oldToNew.get(k) || k;
          const vv = v && typeof v === "object" ? v : {};
          out[nk] = deepClone(vv);
          if (out[nk].rect) out[nk].rect = oldToNew.get(out[nk].rect) || out[nk].rect;
        }
        n.overrides = out;
      } else if (n.type === "Recipe"){
        if (n.template) n.template = oldToNew.get(n.template) || n.template;
        n.layers = Array.isArray(n.layers) ? n.layers.map(x => oldToNew.get(x) || x) : [];
      } else if (n.type === "Task"){
        // nothing to rewrite inside commands
      }

      newNodes.set(newId, n);
    }

    registry.nodes = newNodes;

    // Rewrite roots
    if (registry.roots.template) registry.roots.template = oldToNew.get(registry.roots.template) || registry.roots.template;
    if (registry.roots.recipe) registry.roots.recipe = oldToNew.get(registry.roots.recipe) || registry.roots.recipe;
    registry.roots.assets = (registry.roots.assets || []).map(a => oldToNew.get(a) || a);
    registry.roots.tasks = (registry.roots.tasks || []).map(t => oldToNew.get(t) || t);

    clearCaches();
    updateStatus(root);
    log(`Recomputed IDs. Rewritten: ${oldToNew.size} nodes.`, "info", root);
    refreshAllUI(root);
    renderOnce(root);
  }
