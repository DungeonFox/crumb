  // ---------------------------
  // Pop-out Viewer
  // ---------------------------
  const popoutStates = new Map();
  const DEFAULT_CARD_KEY = "default";

  function resolveCardId(cardRoot){
    const root = resolveCardRoot(cardRoot);
    const cardId = getCardIdFromRoot(root);
    return cardId || DEFAULT_CARD_KEY;
  }

  function getPopoutState(cardRoot){
    const cardId = resolveCardId(cardRoot);
    let state = popoutStates.get(cardId);
    if (!state){
      state = { cardId, win: null, ready: false, pending: [] };
      popoutStates.set(cardId, state);
    }
    return state;
  }

  function markPopoutReady(cardId){
    const key = cardId || DEFAULT_CARD_KEY;
    const state = popoutStates.get(key);
    if (!state) return;
    state.ready = true;
    flushPendingViewerCommands(state);
  }

  function flushPendingViewerCommands(state){
    if (!state?.win || state.win.closed) return;
    if (!state.pending.length) return;
    const queue = state.pending.splice(0, state.pending.length);
    for (const cmd of queue){
      try{
        state.win.postMessage({type:"command", command: cmd, cardId: state.cardId}, "*");
      } catch {
        /* ignore failed sends */
      }
    }
  }

  function getPopoutGeometryElements(cardRoot){
    const root = resolveCardRoot(cardRoot);
    if (!root) return {};
    return {
      width: $role(root, "popout-width"),
      height: $role(root, "popout-height"),
      left: $role(root, "popout-left"),
      top: $role(root, "popout-top")
    };
  }

  function readPopoutGeometryFields(cardRoot){
    const {width, height, left, top} = getPopoutGeometryElements(cardRoot);
    return {
      width: width ? width.value : "",
      height: height ? height.value : "",
      left: left ? left.value : "",
      top: top ? top.value : ""
    };
  }

  function updatePopoutGeometryFields(values={}, cardRoot){
    const {width, height, left, top} = getPopoutGeometryElements(cardRoot);
    if (width && values.width !== undefined) width.value = values.width;
    if (height && values.height !== undefined) height.value = values.height;
    if (left && values.left !== undefined) left.value = values.left;
    if (top && values.top !== undefined) top.value = values.top;
    return readPopoutGeometryFields(cardRoot);
  }

  window.popoutGeometry = {
    getElements: getPopoutGeometryElements,
    read: readPopoutGeometryFields,
    update: updatePopoutGeometryFields
  };

  function getPopoutWindow(cardRoot){
    const state = getPopoutState(cardRoot);
    return state.win;
  }

  function openPopout(cardRoot){
    const root = resolveCardRoot(cardRoot);
    const state = getPopoutState(root);
    try{
      // Determine desired geometry from UI inputs or fall back to defaults.
      const wInput = root ? $role(root, "popout-width") : null;
      const hInput = root ? $role(root, "popout-height") : null;
      const xInput = root ? $role(root, "popout-left") : null;
      const yInput = root ? $role(root, "popout-top") : null;

      let w = wInput && wInput.value ? parseInt(wInput.value) : defaultPopWidth;
      let h = hInput && hInput.value ? parseInt(hInput.value) : defaultPopHeight;
      let x = xInput && xInput.value !== "" ? parseInt(xInput.value) : NaN;
      let y = yInput && yInput.value !== "" ? parseInt(yInput.value) : NaN;

      // Clamp minimal values
      w = isNaN(w) ? defaultPopWidth : Math.max(100, w);
      h = isNaN(h) ? defaultPopHeight : Math.max(100, h);

      const feat = [];
      feat.push(`width=${w}`);
      feat.push(`height=${h}`);
      feat.push("popup=yes");
      feat.push("toolbar=no");
      feat.push("location=no");
      feat.push("menubar=no");
      feat.push("status=no");
      if (!isNaN(x)) feat.push(`left=${x}`);
      if (!isNaN(y)) feat.push(`top=${y}`);
      const features = feat.join(",");

      // Open viewer.html in a separate window. (Relative to index.html.)
      const viewerUrl = new URL("viewer.html", window.location.href);
      if (state.cardId && state.cardId !== DEFAULT_CARD_KEY){
        viewerUrl.searchParams.set("cardId", state.cardId);
      }
      state.win = window.open(viewerUrl.toString(), `hexFlipbookViewer-${state.cardId}`, features);

      if (!state.win){
        log("Pop‑out blocked by browser.", "bad", root);
        return;
      }

      state.ready = false;
      state.pending.length = 0;

      try{
        state.win.mainWindow = window;
        state.win.popoutGeometry = window.popoutGeometry;
        state.win.cardId = state.cardId;
      } catch {}

      // Update defaults so subsequent opens reuse last values
      defaultPopWidth = w;
      defaultPopHeight = h;
      if (!isNaN(x)) defaultPopLeft = x;
      if (!isNaN(y)) defaultPopTop = y;

      log("Pop‑out viewer opened.", "info", root);

      // The viewer will ping us with {type:'viewerReady'} when it is ready; we also
      // send a fallback state push after a short delay.
      setTimeout(() => pushStateToPopout(true, root), 250);
    } catch (e){
      log(`Pop‑out failed: ${String(e)}`, "bad", root);
    }
  }

  function snapshotForViewer(cardRoot){
    const root = resolveCardRoot(cardRoot);
    if (!root) return null;
    if (typeof window.withCardRegistry === "function"){
      return window.withCardRegistry(root, () => __snapshotForViewerInner(root));
    }
    return __snapshotForViewerInner(root);
  }

  function __snapshotForViewerInner(root){
    const plan = registry.roots.recipe ? buildRenderPlan(registry.roots.recipe) : null;
    if (!plan) return null;

    const tpl = getNode(plan.tplId);
    const outSize = plan.outSize;

    const rects = {};
    for (const rid of (tpl.rects || [])){
      const r = getNode(rid);
      if (r && r.type === "Rect") rects[rid] = deepClone(r);
    }

    const assets = {};
    for (const {id, node} of listNodesOfType("Asset")){
      const raw = node.src||"";
      const resolved = (typeof window.resolveAssetSrc === "function") ? (window.resolveAssetSrc(raw) || raw) : raw;
      assets[id] = { name: node.name||"", src: resolved };
    }

    const frames = plan.frames.map(f => ({
      id: f.id,
      name: f.node?.name || "",
      duration: Math.max(1, +f.node?.duration || 100)
    }));

    const layers = plan.layers.map(L => {
      const n = L.node;
      return {
        id: L.id,
        name: n.name||"",
        visible: !!n.visible,
        asset: n.asset||"",
        defaultRect: n.defaultRect||"",
        opacity: (n.opacity!==undefined)? clamp01(+n.opacity) : 1.0,
        overrides: deepClone(n.overrides || {})
      };
    });

    return {
      outW: outSize.w,
      outH: outSize.h,
      frames,
      layers,
      rects,
      assets
    };
  }

  function pushStateToPopout(reset=false, cardRoot){
    const popoutState = getPopoutState(cardRoot);
    if (!popoutState.win || popoutState.win.closed) return;
    const snapshot = snapshotForViewer(cardRoot);
    if (!snapshot) return;
    try{
      popoutState.win.postMessage({type:"state", state: snapshot, reset, cardId: popoutState.cardId}, "*");
    } catch {}
  }

  // Send command message to viewer
  function sendCommandToViewer(cmd, cardRoot){
    const state = getPopoutState(cardRoot);
    if (!state.win || state.win.closed) return false;
    try{
      if (!state.ready){
        state.pending.push(cmd);
        return true;
      }
      state.win.postMessage({type:"command", command: cmd, cardId: state.cardId}, "*");
      return true;
    } catch {
      return false;
    }
  }

  window.markPopoutReady = markPopoutReady;
  window.getPopoutWindow = getPopoutWindow;
