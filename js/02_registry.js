// ---------------------------
// Hex-Graph Registry (per-card)
// ---------------------------
// Goal: each card has independent graph state, persisted via LocalStorage.
// Implementation: registry states stored by cardId; `registry` is a Proxy that
// routes reads/writes to the current card context (or focused card).

const __registriesByCardId = new Map();
let __registryContextRoot = null;

function __resolveRegistryRoot(cardRoot){
  return resolveCardRoot(cardRoot || __registryContextRoot || null);
}

function __cardIdForRoot(cardRoot){
  const root = __resolveRegistryRoot(cardRoot);
  return getCardIdFromRoot(root) || "default";
}

function __createRegistryState(cardId){
  return {
    cardId,
    manifestVersion: 1,
    nodes: new Map(), // id -> node
    roots: { template: null, recipe: null, assets: [], tasks: [] },
    caches: {
      resolve: new Map(),
      plan: new Map(),
      composed: new Map()
    },
    meta: {
      suppressStorage: false,
      dirty: false,
      lastLoadedRev: 0,
      lastSavedRev: 0,
      updatedAt: 0
    },
    __rootsProxy: null
  };
}

function getRegistryState(cardRoot){
  const cardId = __cardIdForRoot(cardRoot);
  let state = __registriesByCardId.get(cardId);
  if (!state){
    state = __createRegistryState(cardId);
    __registriesByCardId.set(cardId, state);
  }
  return state;
}

function withCardRegistry(cardRoot, fn){
  // NOTE: earlier revisions referenced _resolveRegistryRoot by mistake.
  // Use the local resolver to keep everything file:// friendly and self-contained.
  const root = __resolveRegistryRoot(cardRoot);
  const prev = __registryContextRoot;
  __registryContextRoot = root;

  // Also swap selection globals to be per-card within this context (if available).
  const hasSel = (typeof window.__pushSelectionContext === "function") && (typeof window.__popSelectionContext === "function");
  if (hasSel) window.__pushSelectionContext(root);

  let res;
  try{
    res = fn(root, getRegistryState(root));
  } catch (err){
    // unwind context on sync errors
    try { if (hasSel) window.__popSelectionContext(root); } catch {}
    __registryContextRoot = prev;
    throw err;
  }

  // If fn returned a Promise, keep the context until it settles.
  if (res && typeof res.then === "function"){
    return res.finally(() => {
      try { if (hasSel) window.__popSelectionContext(root); } catch {}
      __registryContextRoot = prev;
    });
  }

  // Sync return: unwind immediately.
  try { if (hasSel) window.__popSelectionContext(root); } catch {}
  __registryContextRoot = prev;
  return res;
}

function __activeState(){
  return getRegistryState(__resolveRegistryRoot());
}

function __touchStorage(cardRoot, force=false){
  const root = __resolveRegistryRoot(cardRoot);
  if (!root) return;
  const state = getRegistryState(root);
  state.meta.dirty = true;
  state.meta.updatedAt = Date.now();
  if (state.meta.suppressStorage) return;

  if (typeof window.markCardDirty === "function"){
    window.markCardDirty(root);
  }
  if (typeof window.scheduleCardSave === "function"){
    window.scheduleCardSave(root, force);
  }
}

function __wrapArray(arr, onMutate){
  if (arr && arr.__isWrappedArray) return arr;
  const target = Array.isArray(arr) ? arr : [];
  const handler = {
    get(t, prop){
      if (prop === "__isWrappedArray") return true;
      const v = t[prop];
      if (typeof v === "function"){
        // wrap mutating methods to call onMutate
        const mutators = new Set(["push","pop","shift","unshift","splice","sort","reverse","copyWithin","fill"]);
        if (mutators.has(prop)){
          return (...args) => {
            const out = Array.prototype[prop].apply(t, args);
            onMutate();
            return out;
          };
        }
        return v.bind(t);
      }
      return v;
    },
    set(t, prop, value){
      t[prop] = value;
      onMutate();
      return true;
    }
  };
  return new Proxy(target, handler);
}

function __makeRootsProxy(state){
  if (state.__rootsProxy) return state.__rootsProxy;
  const onMutate = () => {
    clearCaches();
    __touchStorage(__resolveRegistryRoot(), false);
  };
  const handler = {
    get(t, prop){
      const v = t[prop];
      if ((prop === "assets" || prop === "tasks") && Array.isArray(v)){
        t[prop] = __wrapArray(v, onMutate);
        return t[prop];
      }
      return v;
    },
    set(t, prop, value){
      if (prop === "assets" || prop === "tasks"){
        t[prop] = __wrapArray(Array.isArray(value) ? value : [], onMutate);
      } else {
        t[prop] = value;
      }
      onMutate();
      return true;
    }
  };
  state.__rootsProxy = new Proxy(state.roots, handler);
  // ensure arrays are wrapped
  state.roots.assets = __wrapArray(state.roots.assets || [], onMutate);
  state.roots.tasks = __wrapArray(state.roots.tasks || [], onMutate);
  return state.__rootsProxy;
}

// `registry` proxy: keep existing callsites working.
const registry = new Proxy({}, {
  get(_t, prop){
    const state = __activeState();
    if (prop === "__byCardId") return __registriesByCardId;
    if (prop === "cardId") return state.cardId;
    if (prop === "manifestVersion") return state.manifestVersion;
    if (prop === "nodes") return state.nodes;
    if (prop === "roots") return __makeRootsProxy(state);
    if (prop === "caches") return state.caches;
    if (prop === "meta") return state.meta;
    return undefined;
  },
  set(_t, prop, value){
    const state = __activeState();
    if (prop === "nodes"){
      state.nodes = value instanceof Map ? value : new Map();
      clearCaches();
      __touchStorage(__resolveRegistryRoot(), true);
      return true;
    }
    if (prop === "roots"){
      state.roots = (value && typeof value === "object") ? value : { template:null, recipe:null, assets:[], tasks:[] };
      state.__rootsProxy = null;
      __makeRootsProxy(state);
      clearCaches();
      __touchStorage(__resolveRegistryRoot(), true);
      return true;
    }
    state[prop] = value;
    __touchStorage(__resolveRegistryRoot(), false);
    return true;
  }
});

function clearCaches(cardRoot){
  const state = getRegistryState(cardRoot);
  state.caches.resolve.clear();
  state.caches.plan.clear();
  state.caches.composed.clear();
}

function resetRegistry(cardRoot){
  const root = __resolveRegistryRoot(cardRoot);
  const state = getRegistryState(root);
  state.nodes = new Map();
  state.roots = { template: null, recipe: null, assets: [], tasks: [] };
  state.__rootsProxy = null;
  __makeRootsProxy(state);
  clearCaches(root);
  __touchStorage(root, true);
}

function resetRegistrySilently(cardRoot){
  const root = __resolveRegistryRoot(cardRoot);
  const state = getRegistryState(root);
  const prev = state.meta.suppressStorage;
  state.meta.suppressStorage = true;
  try{
    state.nodes = new Map();
    state.roots = { template: null, recipe: null, assets: [], tasks: [] };
    state.__rootsProxy = null;
    __makeRootsProxy(state);
    clearCaches(root);
    state.meta.dirty = false;
  } finally {
    state.meta.suppressStorage = prev;
  }
}

function setNode(id, node, cardRoot){
  const root = __resolveRegistryRoot(cardRoot);
  if (!id) return;
  const state = getRegistryState(root);
  state.nodes.set(id, node);
  state.caches.resolve.delete(id);
  state.caches.plan.clear();
  state.caches.composed.clear();
  __touchStorage(root, false);
}

function getNode(id, cardRoot){
  if (!id) return null;
  const root = __resolveRegistryRoot(cardRoot);
  const state = getRegistryState(root);
  return state.nodes.get(id) || null;
}

function deleteNode(id, cardRoot){
  if (!id) return false;
  const root = __resolveRegistryRoot(cardRoot);
  const state = getRegistryState(root);
  const ok = state.nodes.delete(id);
  if (ok){
    state.caches.resolve.delete(id);
    state.caches.plan.clear();
    state.caches.composed.clear();
    __touchStorage(root, false);
  }
  return ok;
}

function mergeManifest(m, cardRoot){
  const root = __resolveRegistryRoot(cardRoot);
  if (!m || typeof m !== "object"){
    log("Manifest missing or invalid.", "warn", root);
    return;
  }
  const state = getRegistryState(root);
  if (m.manifestVersion !== 1){
    log("Manifest version mismatch or missing; attempting best-effort merge.", "warn", root);
  }
  const nodes = m.nodes || {};
  for (const [id, node] of Object.entries(nodes)){
    if (!node || typeof node !== "object" || !node.type) continue;
    state.nodes.set(id, node);
  }
  // roots: merge gently
  if (m.roots && typeof m.roots === "object"){
    if (m.roots.template) state.roots.template = m.roots.template;
    if (m.roots.recipe) state.roots.recipe = m.roots.recipe;
    if (Array.isArray(m.roots.assets)){
      state.roots.assets = Array.from(new Set([...(state.roots.assets||[]), ...m.roots.assets]));
    }
    if (Array.isArray(m.roots.tasks)){
      state.roots.tasks = Array.from(new Set([...(state.roots.tasks||[]), ...m.roots.tasks]));
    }
  }
  state.__rootsProxy = null;
  __makeRootsProxy(state);
  clearCaches(root);
  __touchStorage(root, false);
  updateStatus(root);
}

function mergeManifestSilently(m, cardRoot, {replaceRoots=true} = {}){
  const root = __resolveRegistryRoot(cardRoot);
  const state = getRegistryState(root);
  const prev = state.meta.suppressStorage;
  state.meta.suppressStorage = true;
  try{
    if (!m || typeof m !== "object") return;
    const nodes = m.nodes || {};
    for (const [id, node] of Object.entries(nodes)){
      if (!node || typeof node !== "object" || !node.type) continue;
      state.nodes.set(id, node);
    }
    if (replaceRoots && m.roots && typeof m.roots === "object"){
      state.roots.template = m.roots.template || null;
      state.roots.recipe = m.roots.recipe || null;
      state.roots.assets = Array.isArray(m.roots.assets) ? m.roots.assets.slice() : [];
      state.roots.tasks = Array.isArray(m.roots.tasks) ? m.roots.tasks.slice() : [];
    }
    state.__rootsProxy = null;
    __makeRootsProxy(state);
    clearCaches(root);
    state.meta.dirty = false;
  } finally {
    state.meta.suppressStorage = prev;
  }
  updateStatus(root);
}

function toManifestSnapshot(cardRoot){
  const root = __resolveRegistryRoot(cardRoot);
  const state = getRegistryState(root);
  const nodesObj = {};
  for (const [id, node] of state.nodes.entries()){
    nodesObj[id] = node;
  }
  return {
    manifestVersion: 1,
    nodes: nodesObj,
    roots: deepClone(state.roots)
  };
}

function updateStatus(cardRoot){
  const root = resolveCardRoot(cardRoot);
  const state = getRegistryState(root);
  if (statusPill){
    statusPill.textContent = `registry: ${state.nodes.size} nodes`;
  }
  if (!root) return;
  const tplMini = $role(root, "tpl-root-mini");
  const recMini = $role(root, "rec-root-mini");
  const taskMini = $role(root, "task-root-mini");
  const mergedJson = $role(root, "merged-json");
  if (tplMini) tplMini.textContent = state.roots.template ? state.roots.template : "(no template root)";
  if (recMini) recMini.textContent = state.roots.recipe ? state.roots.recipe : "(no recipe root)";
  if (taskMini) taskMini.textContent = (state.roots.tasks && state.roots.tasks.length) ? `${state.roots.tasks.length} task(s)` : "(no tasks)";
  if (mergedJson) mergedJson.value = JSON.stringify(toManifestSnapshot(root), null, 2);
}

// Expose helpers for card_store + patches
window.getRegistryState = getRegistryState;
window.withCardRegistry = withCardRegistry;
window.resetRegistrySilently = resetRegistrySilently;
window.mergeManifestSilently = mergeManifestSilently;
window.deleteNode = deleteNode;
window.touchStorage = __touchStorage;
