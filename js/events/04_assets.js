  // Assets: add empty asset
  function initAssetEvents(cardRoot){
    const root = resolveCardRoot(cardRoot);
    const run = (fn) => (typeof window.withCardRegistry === "function") ? window.withCardRegistry(root, fn) : fn();
    const btnAdd = root ? $role(root, "btn-add-asset") : null;
    const fileAsset = root ? $role(root, "file-asset") : null;
    if (btnAdd){
      btnAdd.onclick = () => run(() => {
        const a = { type:"Asset", name:"asset.png", src:"" };
        const aid = makeNewId("asset");
        setNode(aid, a);
        registry.roots.assets = Array.isArray(registry.roots.assets) ? registry.roots.assets : [];
        registry.roots.assets.push(aid);
        selectedAssetId = aid;
        const state = getRendererState(root);
        if (state) state.images.delete(aid);
        clearCaches();
        refreshAllUI(root);
        renderOnce(root);
      });
    }

    // Assets: load image files
    if (fileAsset){
      fileAsset.onchange = (e) => run(async () => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        for (const f of files){
          const dataUrl = await fileToDataUrl(f);
          const a = { type:"Asset", name:f.name, src:dataUrl };
          const aid = makeNewId("asset");
          setNode(aid, a);
          registry.roots.assets = Array.isArray(registry.roots.assets) ? registry.roots.assets : [];
          registry.roots.assets.push(aid);
          selectedAssetId = aid;
          const state = getRendererState(root);
          if (state) state.images.delete(aid);
          // Log asset loading using simple string concatenation to avoid template literal syntax errors
          log('Loaded asset image: ' + f.name, "info", root);
        }
        clearCaches();
        refreshAllUI(root);
        renderOnce(root);
        e.target.value = "";
      });
    }
  }

  async function fileToDataUrl(file){
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error("File read failed"));
      fr.readAsDataURL(file);
    });
  }
