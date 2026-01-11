  // Layers: add/delete
  function initLayerEvents(cardRoot){
    const root = resolveCardRoot(cardRoot);
    const run = (fn) => (typeof window.withCardRegistry === "function") ? window.withCardRegistry(root, fn) : fn();
    const btnAdd = root ? $role(root, "btn-add-layer") : null;
    const btnDel = root ? $role(root, "btn-del-layer") : null;
    if (btnAdd){
      btnAdd.onclick = () => run(() => {
        const rec = getNode(registry.roots.recipe);
        if (!rec || rec.type !== "Recipe") return;

        const tpl = rec.template ? getNode(rec.template) : null;
        const rectId = (tpl && tpl.type === "Template" && (tpl.rects||[]).length) ? tpl.rects[0] : "";
        const assetId = (registry.roots.assets||[])[0] || "";

        // Build layer name via concatenation to prevent template literal parsing errors
        const L = { type:"Layer", name:'Layer ' + ((rec.layers||[]).length + 1), visible:true, asset:assetId, defaultRect:rectId, opacity:1.0, overrides:{} };
        const lid = makeNewId("anim");
        setNode(lid, L);

        rec.layers = Array.isArray(rec.layers) ? rec.layers : [];
        rec.layers.push(lid);
        setNode(registry.roots.recipe, rec);

        selectedLayerId = lid;
        clearCaches();
        refreshAllUI(root);
        renderOnce(root);
      });
    }

    if (btnDel){
      btnDel.onclick = () => run(() => {
        const rec = getNode(registry.roots.recipe);
        if (!rec || rec.type !== "Recipe" || !selectedLayerId) return;
        rec.layers = (rec.layers||[]).filter(x => x !== selectedLayerId);
        setNode(registry.roots.recipe, rec);
        deleteNode(selectedLayerId, root);
        selectedLayerId = null;
        clearCaches();
        refreshAllUI(root);
        renderOnce(root);
      });
    }
  }
