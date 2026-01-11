// js/libraries/idManager_adapted.js
// Offline-safe ID manager inspired by the other project.
// Provides stable, human-friendly IDs for new cards.
// No DOM dependencies; no ES-module exports.

(() => {
  const STORAGE_KEY = "spritefuly.idManager.v1";

  const state = (() => {
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { prefix:"c", next: 1 };
      const parsed = JSON.parse(raw);
      const prefix = (parsed && typeof parsed.prefix === "string") ? parsed.prefix : "c";
      const next = (parsed && typeof parsed.next === "number") ? parsed.next : 1;
      return { prefix, next };
    } catch {
      return { prefix:"c", next: 1 };
    }
  })();

  function persist(){
    try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  function format(prefix, num){
    const n = Math.max(0, num|0);
    return `${prefix}${String(n).padStart(4,"0")}`;
  }

  function nextCardId(){
    const id = format(state.prefix, state.next++);
    persist();
    return id;
  }

  function setPrefix(prefix){
    if (!prefix || typeof prefix !== "string") return;
    state.prefix = prefix.trim().slice(0,1) || "c";
    persist();
  }

  function peek(){
    return format(state.prefix, state.next);
  }

  window.idManager = window.idManager || {};
  window.idManager.nextCardId = nextCardId;
  window.idManager.setPrefix = setPrefix;
  window.idManager.peek = peek;
})();
