// ---------------------------
// Selection IDs (per-card via card-context)
// ---------------------------
// The original code expects globals like `selectedRectId`. We keep those globals,
// but make them effectively per-card by swapping them when entering/exiting a
// card registry context (see withCardRegistry in 02_registry.js).

let selectedRectId = null;
let selectedFrameId = null;
let selectedAssetId = null;
let selectedLayerId = null;
let selectedTaskId = null;

const __selectionByCardId = new Map();
const __selectionContextStack = [];

function __selectionCardId(root){
  const r = resolveCardRoot(root) || getCardRoot();
  return getCardIdFromRoot(r) || "default";
}

function __getSelectionState(root){
  const id = __selectionCardId(root);
  let st = __selectionByCardId.get(id);
  if (!st){
    st = { rectId:null, frameId:null, assetId:null, layerId:null, taskId:null };
    __selectionByCardId.set(id, st);
  }
  return st;
}

// Called by withCardRegistry to make selection globals match the active card.
function __pushSelectionContext(root){
  const st = __getSelectionState(root);
  __selectionContextStack.push({
    rectId: selectedRectId,
    frameId: selectedFrameId,
    assetId: selectedAssetId,
    layerId: selectedLayerId,
    taskId: selectedTaskId,
    cardId: __selectionCardId(root)
  });
  selectedRectId = st.rectId;
  selectedFrameId = st.frameId;
  selectedAssetId = st.assetId;
  selectedLayerId = st.layerId;
  selectedTaskId = st.taskId;
}

function __popSelectionContext(root){
  // Save current globals back into the card selection state first.
  const st = __getSelectionState(root);
  st.rectId = selectedRectId || null;
  st.frameId = selectedFrameId || null;
  st.assetId = selectedAssetId || null;
  st.layerId = selectedLayerId || null;
  st.taskId = selectedTaskId || null;

  // Restore previous globals (previous context).
  const prev = __selectionContextStack.pop();
  if (prev){
    selectedRectId = prev.rectId;
    selectedFrameId = prev.frameId;
    selectedAssetId = prev.assetId;
    selectedLayerId = prev.layerId;
    selectedTaskId = prev.taskId;
  }
}

// Expose for 02_registry.js
window.__pushSelectionContext = __pushSelectionContext;
window.__popSelectionContext = __popSelectionContext;

// ---------------------------
// Helpers (unchanged)
// ---------------------------
function nsOf(id){
  const i = id.indexOf(":0x");
  return i > 0 ? id.slice(0, i) : "";
}

function makeNewId(ns){
  const r = Math.floor(Math.random()*1e16).toString(16).padStart(16,"0");
  return `${ns}:0x${r}`;
}
