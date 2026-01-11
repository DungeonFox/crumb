  // ---------------------------
  // Package Catalog + Selection
  // ---------------------------
  function buildStarterPackageManifest(){
    const asset = { type:"Asset", name:"(drop image here)", src:"" };
    const assetId = makeId("asset", asset.type, {name:asset.name, src:asset.src});

    const rect = { type:"Rect", name:"rect0", asset:assetId, sx:0, sy:0, sw:32, sh:32, dx:0, dy:0, dw:32, dh:32 };
    const rectId = makeId("tpl", rect.type, rect);

    const fs0 = { type:"FrameSlot", name:"f000", duration:100 };
    const fs1 = { type:"FrameSlot", name:"f001", duration:100 };
    const fs0Id = makeId("tpl", fs0.type, fs0);
    const fs1Id = makeId("tpl", fs1.type, fs1);

    const tpl = { type:"Template", tileW:32, tileH:32, gridW:4, gridH:4, rects:[rectId], frames:[fs0Id, fs1Id] };
    const tplId = makeId("tpl", tpl.type, tpl);

    const layer = { type:"Layer", name:"Layer 1", visible:true, asset:assetId, defaultRect:rectId, opacity:1.0, overrides:{} };
    const layerId = makeId("anim", layer.type, layer);

    const rec = { type:"Recipe", template:tplId, layers:[layerId] };
    const recId = makeId("anim", rec.type, rec);

    return {
      manifestVersion: 1,
      nodes: {
        [assetId]: asset,
        [rectId]: rect,
        [fs0Id]: fs0,
        [fs1Id]: fs1,
        [tplId]: tpl,
        [layerId]: layer,
        [recId]: rec
      },
      roots: {
        template: tplId,
        recipe: recId,
        assets: [assetId],
        tasks: []
      }
    };
  }

  const packageCatalog = [
    {
      id: "starter",
      name: "Starter Graph",
      buildManifest: buildStarterPackageManifest
    }
  ];

  let selectedPackageId = "";

  function getPackageCatalog(){
    return packageCatalog.slice();
  }

  function setSelectedPackageId(id){
    const normalized = id || "";
    selectedPackageId = packageCatalog.some((pkg) => pkg.id === normalized) ? normalized : "";
  }

  function getSelectedPackageId(){
    return selectedPackageId;
  }

  function getSelectedPackageManifest(){
    const pkg = packageCatalog.find((entry) => entry.id === selectedPackageId);
    if (!pkg) return null;
    if (typeof pkg.buildManifest === "function") return pkg.buildManifest();
    if (pkg.manifest) return deepClone(pkg.manifest);
    return null;
  }

  function initPackageSelect(selectEl){
    if (!selectEl) return;
    selectEl.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "(no package)";
    selectEl.appendChild(placeholder);
    packageCatalog.forEach((pkg) => {
      const opt = document.createElement("option");
      opt.value = pkg.id;
      opt.textContent = pkg.name;
      selectEl.appendChild(opt);
    });
    selectEl.value = selectedPackageId;
    selectEl.onchange = () => {
      setSelectedPackageId(selectEl.value);
    };
  }

  // ---------------------------
  // Offline PKG registration
  // ---------------------------
  function mergePackageManifests(manifests){
    const out = {
      manifestVersion: 1,
      nodes: {},
      roots: { template: null, recipe: null, assets: [], tasks: [] }
    };
    const assets = new Set();
    const tasks = new Set();

    (manifests || []).forEach((m) => {
      if (!m || typeof m !== "object") return;

      const nodes = (m.nodes && typeof m.nodes === "object") ? m.nodes : {};
      for (const [id, node] of Object.entries(nodes)){
        if (!node || typeof node !== "object" || !node.type) continue;
        out.nodes[id] = node; // last-writer wins
      }

      const r = (m.roots && typeof m.roots === "object") ? m.roots : {};
      if (r.template) out.roots.template = r.template;
      if (r.recipe) out.roots.recipe = r.recipe;
      if (Array.isArray(r.assets)) r.assets.forEach((a) => assets.add(a));
      if (Array.isArray(r.tasks)) r.tasks.forEach((t) => tasks.add(t));
    });

    out.roots.assets = Array.from(assets);
    out.roots.tasks = Array.from(tasks);
    return out;
  }

  function registerPackage(pkg){
    if (!pkg || typeof pkg !== "object") return false;

    const id = String(pkg.id || "").trim();
    const name = String(pkg.name || id || "").trim();
    if (!id) return false;

    if (packageCatalog.some((p) => p.id === id)) return false;

    const entry = { id, name: name || id };

    if (typeof pkg.buildManifest === "function"){
      entry.buildManifest = pkg.buildManifest;
    } else if (pkg.manifest && typeof pkg.manifest === "object"){
      entry.manifest = deepClone(pkg.manifest);
    } else {
      return false;
    }

    packageCatalog.push(entry);
    return true;
  }

  window.mergePackageManifests = mergePackageManifests;
  window.registerPackage = registerPackage;
