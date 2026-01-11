// js/00_run.js
// Minimal "run" helper used by UI click handlers.
// Goal: (1) eliminate `run is not defined`, (2) provide a clean basis for card-scoped
// and cross-card actions, without requiring a server.
//
// Supported call styles:
//   run(() => { ... })                      // uses active/default card
//   run(cardRootOrAnyChildEl, () => { ... })// resolves to owning .card-shell
//   run("cardIdString", () => { ... })      // resolves by data-card-id if supported
//
// The callback receives (root, cardId):
//   run(root => { ... })                    // root only
//   run((root, cardId) => { ... })          // both
//
// If `withCardRegistry` exists, `run` will use it to ensure the registry/selection
// context matches the owner card (and it will propagate through async returns if
// your withCardRegistry implementation is promise-aware).

(() => {
  function cssEscape(s){
    try{
      if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(String(s));
    } catch {}
    // basic fallback (good enough for ids you generate)
    return String(s).replace(/["\\]/g, "\\$&");
  }

  function fallbackResolveRoot(target){
    if (!target){
      return document.querySelector(".card-shell") || null;
    }
    if (typeof target === "string"){
      const sel = `.card-shell[data-card-id="${cssEscape(target)}"]`;
      return document.querySelector(sel) || document.querySelector(".card-shell") || null;
    }
    if (target.classList && target.classList.contains("card-shell")){
      return target;
    }
    if (typeof target.closest === "function"){
      return target.closest(".card-shell") || null;
    }
    return document.querySelector(".card-shell") || null;
  }

  function resolveRoot(target){
    try{
      if (typeof window.resolveCardRoot === "function"){
        return window.resolveCardRoot(target);
      }
    } catch {}
    return fallbackResolveRoot(target);
  }

  function getCardId(root){
    try{
      if (typeof window.getCardIdFromRoot === "function"){
        return window.getCardIdFromRoot(root) || "";
      }
    } catch {}
    return root?.dataset?.cardId || "";
  }

  function runImpl(root, fn){
    const r = root || resolveRoot(null);
    const id = getCardId(r);

    // Prefer a card-scoped registry wrapper if available.
    if (typeof window.withCardRegistry === "function"){
      return window.withCardRegistry(r, () => fn(r, id));
    }
    return fn(r, id);
  }

  function run(arg1, arg2){
    let root = null;
    let fn = null;

    if (typeof arg1 === "function"){
      fn = arg1;
      root = resolveRoot(null);
    } else {
      root = resolveRoot(arg1);
      fn = arg2;
    }

    if (typeof fn !== "function"){
      console.warn("run(...) called without a function", arg1, arg2);
      return undefined;
    }

    return runImpl(root, fn);
  }

  // ---------- Convenience helpers (optional, but useful for “card oriented tasks”) ----------
  run.resolveRoot = resolveRoot;
  run.cardId = (target) => getCardId(resolveRoot(target));
  run.currentRoot = () => resolveRoot(null);

  // Run a function for each card on the page.
  // Returns an array of results (may include Promises if callbacks are async).
  run.eachCard = (fn, opts = {}) => {
    const selector = opts.selector || ".card-shell";
    const roots = Array.from(document.querySelectorAll(selector));
    return roots.map(r => run(r, fn));
  };

  // Run an action on all cards, sequentially (useful if you want deterministic ordering).
  run.eachCardSeq = async (fn, opts = {}) => {
    const selector = opts.selector || ".card-shell";
    const roots = Array.from(document.querySelectorAll(selector));
    const out = [];
    for (const r of roots){
      out.push(await run(r, fn));
    }
    return out;
  };

  // Viewer helpers (card-scoped). These will no-op if your project doesn’t define them.
  run.openPopout = (target) => run(target, (root) => {
    if (typeof window.openPopout === "function") return window.openPopout(root);
  });

  run.pushStateToPopout = (target) => run(target, (root) => {
    if (typeof window.pushStateToPopout === "function") return window.pushStateToPopout(root);
  });

  run.sendToViewer = (target, cmd) => run(target, (root) => {
    if (typeof window.sendCommandToViewer === "function") return window.sendCommandToViewer(cmd, root);
  });

  run.runTasks = (target) => run(target, (root) => {
    if (typeof window.runTasks === "function") return window.runTasks(root);
  });

  // Browser-level scheduling helpers (handy for “browser tasks”).
  run.after = (ms, a, b) => {
    if (typeof a === "function") return window.setTimeout(() => run(a), ms);
    return window.setTimeout(() => run(a, b), ms);
  };

  run.every = (ms, a, b) => {
    if (typeof a === "function") return window.setInterval(() => run(a), ms);
    return window.setInterval(() => run(a, b), ms);
  };

  run.cancel = (id) => {
    try{ window.clearTimeout(id); } catch {}
    try{ window.clearInterval(id); } catch {}
  };

  // Install globally (do not overwrite if user already defined run).
  if (typeof window.run !== "function"){
    window.run = run;
  } else {
    // keep existing run, but attach helpers if missing
    const existing = window.run;
    for (const k of Object.keys(run)){
      if (existing[k] == null) existing[k] = run[k];
    }
  }

  // Optional alias (sometimes convenient in devtools)
  if (typeof window.runCard !== "function") window.runCard = window.run;
})();
