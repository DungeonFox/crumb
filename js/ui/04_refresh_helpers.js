  function refreshAllUI(cardRoot){
    const root = resolveCardRoot(cardRoot);
    if (!root) return;
    if (typeof window.withCardRegistry === "function"){
      return window.withCardRegistry(root, () => __refreshAllUIInner(root));
    }
    return __refreshAllUIInner(root);
  }

  function __refreshAllUIInner(root){
    updateStatus(root);
    refreshTemplateUI(root);
    refreshRecipeUI(root);
    refreshTaskerUI(root);
    wireDynamicInputs(root); // re-bind dynamic inputs
    pushStateToPopout(false, root);
  }

  function escapeHtml(s){
    s = String(s ?? "");
    return s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"','&quot;');
  }

  function numBox(id, key, value){
    const v = (value !== undefined && value !== null) ? value : 0;
    return `<input data-k="${key}" data-id="${id}" type="number" step="1" value="${escapeHtml(v)}" style="width:70px" />`;
  }

  function selectBox(id, key, options, current){
    const opts = options.map(o => {
      const label = o === "" ? "(none)" : o;
      const sel = (o === current) ? "selected" : "";
      return `<option value="${escapeHtml(o)}" ${sel}>${escapeHtml(label)}</option>`;
    }).join("");
    return `<select data-k="${key}" data-id="${escapeHtml(id)}">${opts}</select>`;
  }

  function wireDynamicInputs(cardRoot){
    const root = resolveCardRoot(cardRoot);
    if (!root) return;
    const run = (fn) => (typeof window.withCardRegistry === "function") ? window.withCardRegistry(root, fn) : fn();
    // Node field changes: data-k + data-id
    $$in(root, "[data-k][data-id]").forEach(el => {
      el.onchange = () => run(() => {
        const key = el.getAttribute("data-k");
        const id = el.getAttribute("data-id");
        const node = getNode(id);
        if (!node) return;

        if (el.type === "checkbox"){
          node[key] = el.checked;
        } else if (el.tagName === "SELECT"){
          node[key] = el.value;
        } else {
          // number vs text
          if (el.type === "number"){
            node[key] = (el.value === "") ? 0 : +el.value;
          } else {
            node[key] = el.value;
          }
        }
        setNode(id, node);
        clearCaches();
        refreshAllUI(root);
        renderOnce(root);
      });
    });

    // Override edit inputs
    $$in(root, "[data-ov][data-l][data-f]").forEach(el => {
      el.onchange = () => run(() => {
        // doesn't apply until "Set" clicked
      });
    });

    // Override actions
    $$in(root, "[data-ov-set]").forEach(btn => {
      btn.onclick = () => run(() => {
        const fid = btn.getAttribute("data-ov-set");
        const layer = getNode(selectedLayerId);
        if (!layer || layer.type !== "Layer") return;

        const getVal = (k) => {
          const el = $in(root, `[data-ov="${k}"][data-l="${selectedLayerId}"][data-f="${fid}"]`);
          return el ? el.value : "";
        };

        const rectSel = $in(root, `select[data-id="ov:${selectedLayerId}:${fid}"][data-k="rect"]`);
        const rect = rectSel ? rectSel.value : "";

        layer.overrides = (layer.overrides && typeof layer.overrides === "object") ? layer.overrides : {};
        layer.overrides[fid] = layer.overrides[fid] || {};
        const ov = layer.overrides[fid];

        if (rect) ov.rect = rect; else delete ov.rect;

        const dx = getVal("dx"); const dy = getVal("dy"); const op = getVal("opacity");
        if (dx !== "") ov.dx = +dx; else delete ov.dx;
        if (dy !== "") ov.dy = +dy; else delete ov.dy;
        if (op !== "") ov.opacity = clamp01(+op); else delete ov.opacity;

        // remove empty override
        if (Object.keys(ov).length === 0) delete layer.overrides[fid];

        setNode(selectedLayerId, layer);
        clearCaches();
        refreshAllUI(root);
        renderOnce(root);
      });
    });

    $$in(root, "[data-ov-clear]").forEach(btn => {
      btn.onclick = () => run(() => {
        const fid = btn.getAttribute("data-ov-clear");
        const layer = getNode(selectedLayerId);
        if (!layer || layer.type !== "Layer") return;
        layer.overrides = (layer.overrides && typeof layer.overrides === "object") ? layer.overrides : {};
        delete layer.overrides[fid];
        setNode(selectedLayerId, layer);
        clearCaches();
        refreshAllUI(root);
        renderOnce(root);
      });
    });

    // Asset selection button
    $$in(root, "[data-pick-asset]").forEach(btn => {
      btn.onclick = () => run(() => {
        selectedAssetId = btn.getAttribute("data-pick-asset");
        refreshAllUI(root);
      });
    });
  }
