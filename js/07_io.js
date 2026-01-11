  // ---------------------------
  // IO: Load / Save
  // ---------------------------
  function applyPackageToRegistry(manifest, cardRoot){
    const root = resolveCardRoot(cardRoot);
    if (!manifest || typeof manifest !== "object"){
      log("Package manifest missing or invalid.", "warn", root);
      return false;
    }
    if (typeof window.withCardRegistry === "function"){
      return window.withCardRegistry(root, () => __applyPackageToRegistryInner(manifest, root));
    }
    return __applyPackageToRegistryInner(manifest, root);
  }

  function __applyPackageToRegistryInner(manifest, root){
    resetRegistry(root);
    mergeManifest(manifest, root);
    if (manifest.roots?.template) registry.roots.template = manifest.roots.template;
    if (manifest.roots?.recipe) registry.roots.recipe = manifest.roots.recipe;
    if (Array.isArray(manifest.roots?.assets)) registry.roots.assets = manifest.roots.assets.slice();
    if (Array.isArray(manifest.roots?.tasks)) registry.roots.tasks = manifest.roots.tasks.slice();
    clearCaches();
    updateStatus(root);
    if (typeof window.touchStorage === "function") window.touchStorage(root, true);
    return true;
  }

  async function readFileText(file){
    return await file.text();
  }

  async function handleLoadTemplateFile(file, cardRoot){
    const root = resolveCardRoot(cardRoot);
    const txt = await readFileText(file);
    const j = safeJsonParse(txt);
    if (j.__error){ log(`template.json parse error: ${j.__error}`, "bad", root); return; }
    mergeManifest(j);
    if (j.roots?.template) registry.roots.template = j.roots.template;
    clearCaches();
    refreshAllUI(root);
    renderOnce(root);
    log(`Loaded template manifest: ${file.name}`, "info", root);
  }

  async function handleLoadRecipeFile(file, cardRoot){
    const root = resolveCardRoot(cardRoot);
    const txt = await readFileText(file);
    const j = safeJsonParse(txt);
    if (j.__error){ log(`animation.json parse error: ${j.__error}`, "bad", root); return; }
    mergeManifest(j);
    if (j.roots?.recipe) registry.roots.recipe = j.roots.recipe;
    clearCaches();
    refreshAllUI(root);
    renderOnce(root);
    log(`Loaded recipe manifest: ${file.name}`, "info", root);
  }

  async function handleLoadTaskerFile(file, cardRoot){
    const root = resolveCardRoot(cardRoot);
    const txt = await readFileText(file);
    const j = safeJsonParse(txt);
    if (j.__error){ log(`tasks.json parse error: ${j.__error}`, "bad", root); return; }
    mergeManifest(j);
    if (Array.isArray(j.roots?.tasks)) registry.roots.tasks = Array.from(new Set([...registry.roots.tasks, ...j.roots.tasks]));
    clearCaches();
    refreshAllUI(root);
    renderOnce(root);
    log(`Loaded tasks manifest: ${file.name}`, "info", root);
  }

  function saveTemplateJson(cardRoot){
    const root = resolveCardRoot(cardRoot);
    const tplId = registry.roots.template;
    const tpl = tplId ? getNode(tplId) : null;
    if (!tpl || tpl.type !== "Template"){
      log("No Template root to save.", "bad", root);
      return;
    }
    // Include Template + its referenced rects and frames; plus any assets those rects reference.
    const nodes = {};
    const assets = new Set();

    nodes[tplId] = deepClone(tpl);
    for (const rid of (tpl.rects || [])){
      const r = getNode(rid);
      if (r && r.type === "Rect"){
        nodes[rid] = deepClone(r);
        if (r.asset) assets.add(r.asset);
      }
    }
    for (const fid of (tpl.frames || [])){
      const f = getNode(fid);
      if (f && f.type === "FrameSlot") nodes[fid] = deepClone(f);
    }
    for (const aid of assets){
      const a = getNode(aid);
      if (a && a.type === "Asset") nodes[aid] = deepClone(a);
    }

    const manifest = { manifestVersion: 1, nodes, roots: { template: tplId, assets: Array.from(assets) } };
    downloadText("template.json", JSON.stringify(manifest, null, 2));
    log("Saved template.json", "info", root);
  }

  function saveRecipeJson(cardRoot){
    const root = resolveCardRoot(cardRoot);
    const recId = registry.roots.recipe;
    const rec = recId ? getNode(recId) : null;
    if (!rec || rec.type !== "Recipe"){
      log("No Recipe root to save.", "bad", root);
      return;
    }
    const nodes = {};
    const assets = new Set();

    nodes[recId] = deepClone(rec);

    // Include layers + assets they reference; include template root only as an ID
    for (const lid of (rec.layers || [])){
      const L = getNode(lid);
      if (L && L.type === "Layer"){
        nodes[lid] = deepClone(L);
        if (L.asset) assets.add(L.asset);
      }
    }
    for (const aid of assets){
      const a = getNode(aid);
      if (a && a.type === "Asset") nodes[aid] = deepClone(a);
    }

    const manifest = { manifestVersion: 1, nodes, roots: { recipe: recId, assets: Array.from(assets) } };
    downloadText("animation.json", JSON.stringify(manifest, null, 2));
    log("Saved animation.json", "info", root);
  }

  function saveTasksJson(cardRoot){
    const root = resolveCardRoot(cardRoot);
    const taskIds = listNodesOfType("Task").map(x => x.id);
    if (taskIds.length === 0){
      log("No tasks to save.", "warn", root);
      return;
    }
    const nodes = {};
    for (const tid of taskIds){
      const t = getNode(tid);
      if (t && t.type === "Task") nodes[tid] = deepClone(t);
    }
    const manifest = { manifestVersion: 1, nodes, roots: { tasks: taskIds.slice() } };
    downloadText("tasks.json", JSON.stringify(manifest, null, 2));
    log("Saved tasks.json", "info", root);
  }
