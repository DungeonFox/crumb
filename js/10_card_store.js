(() => {
  // ---------------------------
  // Card Store (LocalStorage) + Multi-window sync
  // ---------------------------
  const INDEX_KEY = "spritefuly.cards.index.v1";
  const CARD_KEY_PREFIX = "spritefuly.card.";
  const CARD_KEY_SUFFIX = ".manifest.v1";
  const ASSET_KEY_PREFIX = "spritefuly.asset.";
  const SAVE_DEBOUNCE_MS = 250;

  const saveTimers = new Map();

  function readJson(key){
    try{
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeJson(key, value){
    try{
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function cardKey(cardId){
    const id = String(cardId || "default");
    return `${CARD_KEY_PREFIX}${id}${CARD_KEY_SUFFIX}`;
  }

  function readCardIndexIds(){
    const val = readJson(INDEX_KEY);
    if (!val) return [];
    const ids = Array.isArray(val) ? val : (Array.isArray(val.ids) ? val.ids : []);
    return ids.map(String).filter(Boolean);
  }

  function writeCardIndexIds(ids){
    const uniq = Array.from(new Set((ids || []).map(String).filter(Boolean)));
    writeJson(INDEX_KEY, { version: 1, ids: uniq, updatedAt: Date.now() });
    return uniq;
  }

  function addCardIdToIndex(cardId){
    const id = String(cardId || "").trim();
    if (!id) return readCardIndexIds();
    const ids = readCardIndexIds();
    if (!ids.includes(id)){
      ids.push(id);
      return writeCardIndexIds(ids);
    }
    return ids;
  }

  // --- Asset indirection (dedupe large base64) ---
  function fnv1a32(str){
    let h = 0x811c9dc5;
    for (let i=0; i<str.length; i++){
      h ^= str.charCodeAt(i);
      h = (h + ((h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24))) >>> 0;
    }
    return ("00000000" + h.toString(16)).slice(-8);
  }

  function resolveAssetSrc(src){
    if (!src || typeof src !== "string") return null;
    if (src.startsWith("ls:asset:")){
      const h = src.slice("ls:asset:".length);
      return localStorage.getItem(`${ASSET_KEY_PREFIX}${h}`) || null;
    }
    return src;
  }

  function normalizeManifestForStorage(manifest){
    const out = JSON.parse(JSON.stringify(manifest || {}));
    if (!out.nodes || typeof out.nodes !== "object") return out;

    for (const node of Object.values(out.nodes)){
      if (!node || typeof node !== "object") continue;
      if (node.type !== "Asset") continue;
      const src = node.src;
      if (!src || typeof src !== "string") continue;

      if (src.startsWith("data:image/")){
        const h = fnv1a32(src);
        const key = `${ASSET_KEY_PREFIX}${h}`;
        if (!localStorage.getItem(key)){
          try{ localStorage.setItem(key, src); } catch {}
        }
        node.src = `ls:asset:${h}`;
      }
    }
    return out;
  }

  function loadCardPayload(cardId){
    return readJson(cardKey(cardId));
  }

  function saveCardPayload(cardId, manifest){
    const key = cardKey(cardId);
    const prev = loadCardPayload(cardId);
    const nextRev = (prev && typeof prev.rev === "number") ? (prev.rev + 1) : 1;
    const normalized = normalizeManifestForStorage(manifest);
    const payload = { rev: nextRev, updatedAt: Date.now(), manifest: normalized };
    const ok = writeJson(key, payload);
    if (ok) addCardIdToIndex(cardId);
    return ok ? payload : null;
  }

  function hydrateCardFromStorage(cardRoot){
    const root = resolveCardRoot(cardRoot);
    if (!root) return false;
    const cardId = getCardIdFromRoot(root) || "default";
    const payload = loadCardPayload(cardId);
    if (!payload || !payload.manifest) return false;

    withCardRegistry(root, () => {
      const state = getRegistryState(root);
      const prev = state.meta.suppressStorage;
      state.meta.suppressStorage = true;
      try{
        resetRegistrySilently(root);
        mergeManifestSilently(payload.manifest, root, {replaceRoots:true});
        state.meta.lastLoadedRev = payload.rev || 0;
        state.meta.dirty = false;
      } finally {
        state.meta.suppressStorage = prev;
      }
      clearCaches(root);
      updateStatus(root);
    });

    return true;
  }

  function markCardDirty(cardRoot){
    const root = resolveCardRoot(cardRoot);
    if (!root) return;
    // no-op hook: useful for future UI.
  }

  function scheduleCardSave(cardRoot, immediate=false){
    const root = resolveCardRoot(cardRoot);
    if (!root) return;
    const cardId = getCardIdFromRoot(root) || "default";

    const delay = immediate ? 0 : SAVE_DEBOUNCE_MS;
    if (saveTimers.has(cardId)) clearTimeout(saveTimers.get(cardId));
    saveTimers.set(cardId, setTimeout(() => {
      withCardRegistry(root, () => {
        const snap = toManifestSnapshot(root);
        const payload = saveCardPayload(cardId, snap);
        const state = getRegistryState(root);
        if (payload){
          state.meta.lastSavedRev = payload.rev || 0;
          state.meta.dirty = false;
        }
      });
    }, delay));
  }

  function handleStorageEvent(e){
    if (!e || !e.key) return;

    if (e.key === INDEX_KEY){
      // Another window changed the card list.
      if (typeof window.reconcileCardsFromStorage === "function"){
        window.reconcileCardsFromStorage();
      }
      return;
    }

    if (e.key.startsWith(CARD_KEY_PREFIX) && e.key.endsWith(CARD_KEY_SUFFIX)){
      const cardId = e.key.slice(CARD_KEY_PREFIX.length, e.key.length - CARD_KEY_SUFFIX.length);
      const root = getCardRoot(cardId);
      if (!root) return;

      const payload = loadCardPayload(cardId);
      if (!payload || !payload.manifest) return;

      withCardRegistry(root, () => {
        const state = getRegistryState(root);
        const curRev = state.meta.lastLoadedRev || 0;
        const incoming = payload.rev || 0;
        if (incoming <= curRev) return;

        const prev = state.meta.suppressStorage;
        state.meta.suppressStorage = true;
        try{
          resetRegistrySilently(root);
          mergeManifestSilently(payload.manifest, root, {replaceRoots:true});
          state.meta.lastLoadedRev = incoming;
          state.meta.dirty = false;
        } finally {
          state.meta.suppressStorage = prev;
        }

        clearCaches(root);
        refreshAllUI(root);
        renderOnce(root);
      });
    }
  }

  window.cardStore = {
    INDEX_KEY,
    cardKey,
    readCardIndexIds,
    writeCardIndexIds,
    addCardIdToIndex,
    loadCardPayload,
    saveCardPayload,
    hydrateCardFromStorage,
    resolveAssetSrc
  };

  // Expose through the same `window.libraries.*` pattern used in the other project.
  window.libraries = window.libraries || {};
  window.libraries.deck = window.libraries.deck || {};
  window.libraries.deck.cardStore = window.cardStore;
  window.libraries.deck.resolveAssetSrc = resolveAssetSrc;
  window.libraries.deck.listCardIds = () => readCardIndexIds();
  window.libraries.deck.loadCardPayload = (id) => loadCardPayload(id);
  window.libraries.deck.saveCardPayload = (id, m) => saveCardPayload(id, m);

  window.markCardDirty = markCardDirty;
  window.scheduleCardSave = scheduleCardSave;
  window.resolveAssetSrc = resolveAssetSrc;

  window.addEventListener("storage", handleStorageEvent);
})();
