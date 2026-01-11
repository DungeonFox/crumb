// ---------------------------
// Minimal Graph Helpers
// ---------------------------
function listNodesOfType(type){
  const out = [];
  for (const [id, node] of registry.nodes.entries()){
    if (node.type === type) out.push({id, node});
  }
  return out;
}

function ensureDefaults(cardRoot){
  const root = resolveCardRoot(cardRoot);
  if (!root) return;
  if (typeof window.withCardRegistry === "function"){
    return window.withCardRegistry(root, () => __ensureDefaultsInner(root));
  }
  return __ensureDefaultsInner(root);
}

function __ensureDefaultsInner(root){
  // Create a tiny starter graph if empty (no template/recipe yet).
  if (registry.nodes.size > 0 && registry.roots.template && registry.roots.recipe) return;

  // Assets
  const asset = { type:"Asset", name:"(drop image here)", src:"" };
  const assetId = makeId("asset", asset.type, {name:asset.name, src:asset.src});
  setNode(assetId, asset);

  // Rect
  const rect = { type:"Rect", name:"rect0", asset:assetId, sx:0, sy:0, sw:32, sh:32, dx:0, dy:0, dw:32, dh:32 };
  const rectId = makeId("tpl", rect.type, rect);

  // FrameSlot
  const fs0 = { type:"FrameSlot", name:"f000", duration:100 };
  const fs1 = { type:"FrameSlot", name:"f001", duration:100 };
  const fs0Id = makeId("tpl", fs0.type, fs0);
  const fs1Id = makeId("tpl", fs1.type, fs1);

  // Template
  const tpl = { type:"Template", tileW:32, tileH:32, gridW:4, gridH:4, rects:[rectId], frames:[fs0Id, fs1Id] };
  const tplId = makeId("tpl", tpl.type, tpl);

  // Layer
  const layer = { type:"Layer", name:"Layer 1", visible:true, asset:assetId, defaultRect:rectId, opacity:1.0, overrides:{} };
  const layerId = makeId("anim", layer.type, layer);

  // Recipe
  const rec = { type:"Recipe", template:tplId, layers:[layerId] };
  const recId = makeId("anim", rec.type, rec);

  setNode(rectId, rect);
  setNode(fs0Id, fs0);
  setNode(fs1Id, fs1);
  setNode(tplId, tpl);
  setNode(layerId, layer);
  setNode(recId, rec);

  registry.roots.template = tplId;
  registry.roots.recipe = recId;
  registry.roots.assets = [assetId];
  registry.roots.tasks = [];

  clearCaches();
  updateStatus(root);
  log("Initialized starter graph.", "info", root);
}
