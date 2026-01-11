  function refreshTemplateUI(cardRoot){
    const root = resolveCardRoot(cardRoot);
    const run = (fn) => (typeof window.withCardRegistry === "function") ? window.withCardRegistry(root, fn) : fn();
    if (!root) return;
    const tplId = registry.roots.template;
    const tpl = tplId ? getNode(tplId) : null;
    if (!tpl || tpl.type !== "Template") return;

    const tileW = $role(root, "tpl-tile-w");
    const tileH = $role(root, "tpl-tile-h");
    const gridW = $role(root, "tpl-grid-w");
    const gridH = $role(root, "tpl-grid-h");
    if (tileW) tileW.value = +tpl.tileW || 32;
    if (tileH) tileH.value = +tpl.tileH || 32;
    if (gridW) gridW.value = +tpl.gridW || 4;
    if (gridH) gridH.value = +tpl.gridH || 4;

    // Rect list
    const rectList = $role(root, "rect-list");
    if (!rectList) return;
    rectList.innerHTML = "";
    const head = document.createElement("div");
    head.className = "head";
    head.style.gridTemplateColumns = "140px 1fr 1fr 1fr 70px";
    head.innerHTML = `<div>ID</div><div>Name</div><div>Source (sx,sy,sw,sh)</div><div>Dest (dx,dy,dw,dh)</div><div>Asset</div>`;
    rectList.appendChild(head);

    const rectIds = Array.isArray(tpl.rects) ? tpl.rects : [];
    for (const rid of rectIds){
      const r = getNode(rid);
      if (!r || r.type !== "Rect") continue;
      const item = document.createElement("div");
      item.className = "item";
      item.style.gridTemplateColumns = "140px 1fr 1fr 1fr 70px";
      item.style.cursor = "pointer";
      if (rid === selectedRectId) item.style.background = "rgba(93,214,193,0.10)";

      const assetShort = (r.asset || "").split(":0x")[0] || "";
      item.innerHTML = `
        <div class="mono">${rid}</div>
        <div><input data-k="name" data-id="${rid}" type="text" value="${escapeHtml(r.name||"")}" /></div>
        <div class="row" style="gap:6px; flex-wrap:nowrap">
          ${numBox(rid,"sx",r.sx)} ${numBox(rid,"sy",r.sy)} ${numBox(rid,"sw",r.sw)} ${numBox(rid,"sh",r.sh)}
        </div>
        <div class="row" style="gap:6px; flex-wrap:nowrap">
          ${numBox(rid,"dx",r.dx)} ${numBox(rid,"dy",r.dy)} ${numBox(rid,"dw",r.dw)} ${numBox(rid,"dh",r.dh)}
        </div>
        <div class="mono">${assetShort}</div>
      `;
      item.onclick = (ev) => run(() => {
        if (ev.target && (ev.target.tagName === "INPUT" || ev.target.tagName === "SELECT")) return;
        selectedRectId = rid;
        refreshAllUI(root);
      });
      rectList.appendChild(item);
    }

    // Frame list
    const frameList = $role(root, "frame-list");
    if (!frameList) return;
    frameList.innerHTML = "";
    const head2 = document.createElement("div");
    head2.className = "head";
    head2.style.gridTemplateColumns = "140px 1fr 120px";
    head2.innerHTML = `<div>ID</div><div>Name</div><div>Duration (ms)</div>`;
    frameList.appendChild(head2);

    const frameIds = Array.isArray(tpl.frames) ? tpl.frames : [];
    for (const fid of frameIds){
      const f = getNode(fid);
      if (!f || f.type !== "FrameSlot") continue;
      const item = document.createElement("div");
      item.className = "item";
      item.style.gridTemplateColumns = "140px 1fr 120px";
      item.style.cursor = "pointer";
      if (fid === selectedFrameId) item.style.background = "rgba(93,214,193,0.10)";
      item.innerHTML = `
        <div class="mono">${fid}</div>
        <div><input data-k="name" data-id="${fid}" type="text" value="${escapeHtml(f.name||"")}" /></div>
        <div><input data-k="duration" data-id="${fid}" type="number" min="1" step="1" value="${Math.max(1,+f.duration||100)}" /></div>
      `;
      item.onclick = (ev) => run(() => {
        if (ev.target && ev.target.tagName === "INPUT") return;
        selectedFrameId = fid;
        refreshAllUI(root);
      });
      frameList.appendChild(item);
    }
  }

  function refreshRecipeUI(cardRoot){
    const root = resolveCardRoot(cardRoot);
    if (!root) return;
    // Template selector
    const tplSel = $role(root, "recipe-template-select");
    if (!tplSel) return;
    tplSel.innerHTML = "";
    const templates = listNodesOfType("Template").map(x => x.id).sort();
    for (const id of templates){
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = id;
      tplSel.appendChild(opt);
    }

    const recId = registry.roots.recipe;
    const rec = recId ? getNode(recId) : null;
    if (!rec || rec.type !== "Recipe") return;

    // Ensure selection matches recipe.template
    if (rec.template && templates.includes(rec.template)) tplSel.value = rec.template;

    // Asset list
    const assetList = $role(root, "asset-list");
    if (!assetList) return;
    assetList.innerHTML = "";
    const head = document.createElement("div");
    head.className = "head";
    head.style.gridTemplateColumns = "140px 1fr 1fr 70px";
    head.innerHTML = `<div>ID</div><div>Name</div><div>Src</div><div>Pick</div>`;
    assetList.appendChild(head);

    const assets = listNodesOfType("Asset").map(x => x.id).sort();
    for (const aid of assets){
      const a = getNode(aid);
      const item = document.createElement("div");
      item.className = "item";
      item.style.gridTemplateColumns = "140px 1fr 1fr 70px";
      item.style.cursor = "pointer";
      if (aid === selectedAssetId) item.style.background = "rgba(93,214,193,0.10)";
      const srcShort = (a.src && a.src.startsWith("data:image/")) ? "data:image/…" : (a.src||"");
      item.innerHTML = `
        <div class="mono">${aid}</div>
        <div><input data-k="name" data-id="${aid}" type="text" value="${escapeHtml(a.name||"")}" /></div>
        <div class="mono" title="${escapeHtml(a.src||"")}">${escapeHtml(srcShort)}</div>
        <div><button data-pick-asset="${aid}">Select</button></div>
      `;
      item.onclick = (ev) => run(() => {
        if (ev.target && (ev.target.tagName === "INPUT" || ev.target.tagName === "BUTTON")) return;
        selectedAssetId = aid;
        refreshAllUI(root);
      });
      assetList.appendChild(item);
    }

    // Layer list
    const layerList = $role(root, "layer-list");
    if (!layerList) return;
    layerList.innerHTML = "";
    const head2 = document.createElement("div");
    head2.className = "head";
    head2.style.gridTemplateColumns = "140px 1fr 110px 110px 80px";
    head2.innerHTML = `<div>ID</div><div>Name</div><div>Asset</div><div>Default Rect</div><div>Visible</div>`;
    layerList.appendChild(head2);

    const tpl = getNode(rec.template);
    const rectIds = tpl && tpl.type === "Template" ? (tpl.rects||[]) : [];

    for (const lid of (rec.layers || [])){
      const L = getNode(lid);
      if (!L || L.type !== "Layer") continue;
      const item = document.createElement("div");
      item.className = "item";
      item.style.gridTemplateColumns = "140px 1fr 110px 110px 80px";
      item.style.cursor = "pointer";
      if (lid === selectedLayerId) item.style.background = "rgba(93,214,193,0.10)";

      const assetOpts = listNodesOfType("Asset").map(x => x.id).sort();
      const rectOpts = rectIds.slice();

      item.innerHTML = `
        <div class="mono">${lid}</div>
        <div><input data-k="name" data-id="${lid}" type="text" value="${escapeHtml(L.name||"")}" /></div>
        <div>${selectBox(lid,"asset",assetOpts, L.asset || "")}</div>
        <div>${selectBox(lid,"defaultRect",rectOpts, L.defaultRect || "")}</div>
        <div class="row" style="justify-content:space-between">
          <input data-k="visible" data-id="${lid}" type="checkbox" ${L.visible ? "checked":""} />
          <span class="badge mono">${(L.opacity!==undefined)? clamp01(+L.opacity).toFixed(2) : "1.00"}</span>
        </div>
      `;

      item.onclick = (ev) => run(() => {
        if (ev.target && (ev.target.tagName === "INPUT" || ev.target.tagName === "SELECT")) return;
        selectedLayerId = lid;
        refreshAllUI(root);
      });
      layerList.appendChild(item);
    }

    refreshOverridesUI(root);
  }
