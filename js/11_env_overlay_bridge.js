(function(){
  // Environment Overlay Bridge (main window)
  // - Responds to envOverlayRequest from an environment viewer window.
  // - Uses the card list hydrated from LocalStorage via cardStore.readCardIndexIds().
  // - Mirrors animation via last received frameIndex per card.
  // - Mirrors window-driven motion via last received windowGeometry per card.
  // - Mirrors viewer-side layer changes (setLayerVisibility/Opacity) via viewerLayerState messages.

  const FRAME_BY_CARD = new Map();
  const LAYERS_BY_CARD = new Map(); // cardId -> [{id, visible?, opacity?}, ...]

  function geomMap(){
    return (window.currentViewerGeometryByCard instanceof Map) ? window.currentViewerGeometryByCard : null;
  }

  function hash32(s){
    let h = 0x811c9dc5;
    for (let i=0;i<s.length;i++){
      h ^= s.charCodeAt(i);
      h = (h + ((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24))) >>> 0;
    }
    return h >>> 0;
  }

  if (!window.__envOverlayTelemetryListener){
    window.__envOverlayTelemetryListener = true;
    window.addEventListener("message", (ev) => {
      const m = ev.data;
      if (!m || typeof m !== "object") return;

      if (m.type === "frame" && typeof m.frameIndex === "number"){
        const cardId = m.cardId || "default";
        FRAME_BY_CARD.set(cardId, m.frameIndex|0);
        return;
      }

      if (m.type === "viewerLayerState" && Array.isArray(m.layers)){
        const cardId = m.cardId || "default";
        // Store the whole array (small + simple).
        LAYERS_BY_CARD.set(cardId, m.layers);
      }
    });
  }

  // Patch snapshotForViewer to include meta.kind if available.
  if (!window.__envOverlaySnapshotPatch && typeof window.snapshotForViewer === "function"){
    window.__envOverlaySnapshotPatch = true;
    const orig = window.snapshotForViewer;
    window.snapshotForViewer = function(cardRoot){
      const snap = orig(cardRoot);
      try{
        if (!snap) return snap;
        snap.meta = snap.meta || {};
        const reg = window.registry;
        const tplId = reg?.roots?.template || "";
        const recId = reg?.roots?.recipe || "";
        const getNode = window.getNode;
        const tpl = (tplId && typeof getNode === "function") ? getNode(tplId) : null;
        const rec = (recId && typeof getNode === "function") ? getNode(recId) : null;
        const kind = tpl?.meta?.kind || rec?.meta?.kind || "";
        if (kind) snap.meta.kind = kind;
      } catch (e){
        /* ignore */
      }
      return snap;
    };
  }

  function listCardIdsFromStore(){
    if (window.cardStore && typeof window.cardStore.readCardIndexIds === "function"){
      const ids = window.cardStore.readCardIndexIds();
      if (Array.isArray(ids)) return ids.filter(Boolean);
    }
    return Array.from(document.querySelectorAll(".card-shell")).map(el => el.dataset.cardId || "").filter(Boolean);
  }

  function getRootForCardId(cardId){
    if (typeof window.getCardRoot === "function"){
      return window.getCardRoot(cardId);
    }
    return document.querySelector(`.card-shell[data-card-id="${CSS.escape(cardId)}"]`);
  }

  function withRegistry(root, fn){
    if (typeof window.withCardRegistry === "function") return window.withCardRegistry(root, fn);
    return fn();
  }

  function buildEntityPayload(root, cardId){
    return withRegistry(root, () => {
      if (typeof window.snapshotForViewer !== "function") return null;
      const snap = window.snapshotForViewer(root);
      if (!snap) return null;

      if (snap.meta && snap.meta.kind === "environment") return null;

      const gmap = geomMap();
      const geom = gmap ? (gmap.get(cardId) || null) : null;
      const frameIndex = FRAME_BY_CARD.has(cardId) ? FRAME_BY_CARD.get(cardId) : 0;
      const runtimeLayers = LAYERS_BY_CARD.get(cardId) || null;

      return { cardId, frameIndex, geom, runtimeLayers, snapshot: snap };
    });
  }

  function assignFallbackPositions(envGeom, entities){
    if (!envGeom || !Number.isFinite(envGeom.left) || !Number.isFinite(envGeom.top)) return;
    const padX = 24, padY = 24;
    const cellW = 72, cellH = 72;

    for (const ent of entities){
      if (ent.geom && Number.isFinite(ent.geom.left) && Number.isFinite(ent.geom.top)) continue;

      const h = hash32(ent.cardId || "");
      const col = (h % 8);
      const row = ((h >>> 3) % 4);

      ent.geom = ent.geom || {};
      ent.geom.left = envGeom.left + padX + col * cellW;
      ent.geom.top  = envGeom.top  + padY + row * cellH;
      ent.geom.width = ent.snapshot?.outW || 64;
      ent.geom.height = ent.snapshot?.outH || 64;
    }
  }

  function handleOverlayRequest(ev, m){
    const envCardId = m.cardId || "default";
    const ids = listCardIdsFromStore();

    const entities = [];
    for (const cid of ids){
      if (!cid || cid === envCardId) continue;
      const root = getRootForCardId(cid);
      if (!root) continue;
      const ent = buildEntityPayload(root, cid);
      if (ent) entities.push(ent);
    }

    const gmap = geomMap();
    const envGeom = gmap ? (gmap.get(envCardId) || null) : null;
    assignFallbackPositions(envGeom, entities);

    try{
      if (ev.source && typeof ev.source.postMessage === "function"){
        ev.source.postMessage({ type:"envOverlayStates", cardId: envCardId, entities }, "*");
      }
    } catch (e){
      /* ignore */
    }
  }

  if (!window.__envOverlayRequestListener){
    window.__envOverlayRequestListener = true;
    window.addEventListener("message", (ev) => {
      const m = ev.data;
      if (!m || typeof m !== "object") return;
      if (m.type === "envOverlayRequest"){
        handleOverlayRequest(ev, m);
      }
    });
  }

  window.envOverlayBridge = {
    getLastFrameIndex: (cardId) => FRAME_BY_CARD.get(cardId || "default") || 0,
    getLastLayerState: (cardId) => LAYERS_BY_CARD.get(cardId || "default") || null
  };
})();