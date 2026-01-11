  // ---------------------------
  // Event Wiring
  // ---------------------------
  const currentViewerGeometryByCard = new Map();
  window.currentViewerGeometryByCard = currentViewerGeometryByCard;

  function initCoreEvents(cardRoot){
    const root = resolveCardRoot(cardRoot);
    if (!root) return;
    const btnRehash = $role(root, "btn-rehash");
    const btnPopout = $role(root, "btn-popout");
    const btnExportAtlas = $role(root, "btn-export-atlas");
    if (btnRehash) btnRehash.onclick = () => recomputeIdsTopologically(root);
    if (btnPopout) btnPopout.onclick = () => openPopout(root);
    if (btnExportAtlas) btnExportAtlas.onclick = () => exportAtlas(root);

    const fileTemplate = $role(root, "file-template");
    const fileRecipe = $role(root, "file-recipe");
    const fileTasker = $role(root, "file-tasker");
    if (fileTemplate){
      fileTemplate.onchange = async (e) => {
        const f = e.target.files?.[0];
        if (f) await handleLoadTemplateFile(f, root);
        e.target.value = "";
      };
    }
    if (fileRecipe){
      fileRecipe.onchange = async (e) => {
        const f = e.target.files?.[0];
        if (f) await handleLoadRecipeFile(f, root);
        e.target.value = "";
      };
    }
    if (fileTasker){
      fileTasker.onchange = async (e) => {
        const f = e.target.files?.[0];
        if (f) await handleLoadTaskerFile(f, root);
        e.target.value = "";
      };
    }

    const btnSaveTemplate = $role(root, "btn-save-template");
    const btnSaveRecipe = $role(root, "btn-save-recipe");
    const btnSaveTasks = $role(root, "btn-save-tasks");
    if (btnSaveTemplate) btnSaveTemplate.onclick = () => saveTemplateJson(root);
    if (btnSaveRecipe) btnSaveRecipe.onclick = () => saveRecipeJson(root);
    if (btnSaveTasks) btnSaveTasks.onclick = () => saveTasksJson(root);

    const btnCopyMerged = $role(root, "btn-copy-merged");
    if (btnCopyMerged){
      btnCopyMerged.onclick = async () => {
        try{
          const merged = $role(root, "merged-json");
          await navigator.clipboard.writeText(merged ? merged.value : "");
          log("Copied merged manifest JSON to clipboard.", "info", root);
        } catch {
          log("Clipboard copy failed (browser permissions).", "warn", root);
        }
      };
    }

    const btnLoadMerged = $role(root, "btn-load-merged");
    if (btnLoadMerged){
      btnLoadMerged.onclick = () => {
        const merged = $role(root, "merged-json");
        const j = safeJsonParse(merged ? merged.value : "");
        if (j.__error){ log(`Merged JSON parse error: ${j.__error}`, "bad", root); return; }
        registry.nodes = new Map();
        registry.roots = { template:null, recipe:null, assets:[], tasks:[] };
        mergeManifest(j);
        clearCaches();
        refreshAllUI(root);
        renderOnce(root);
        log("Loaded merged manifest JSON.", "info", root);
      };
    }

    if (!window.__coreMessageListener){
      window.__coreMessageListener = true;
      // Listen for frame events from the viewer and apply any queued geometry triggers.
      window.addEventListener("message", (ev) => {
        const m = ev.data;
        if (!m || typeof m !== "object") return;
        const cardId = m.cardId || "";
        const targetRoot = cardId ? getCardRoot(cardId) : resolveCardRoot(null);
        if (cardId && !targetRoot) return;
        if (m.type === "viewerReady"){
          if (typeof window.markPopoutReady === "function"){
            window.markPopoutReady(cardId);
          }
          pushStateToPopout(true, targetRoot);
          return;
        }
        const fields = ["left", "top", "width", "height"];
        if (m.type === "windowGeometry"){
          const hasGeometryPayload = fields.every((field) => typeof m[field] === "number" && Number.isFinite(m[field]));
          if (!hasGeometryPayload){
            log("Received invalid viewer window geometry payload.", "warn", targetRoot);
            return;
          }
          const geom = currentViewerGeometryByCard.get(cardId) || {};
          for (const field of fields){
            geom[field] = m[field];
          }
          currentViewerGeometryByCard.set(cardId, geom);
          return;
        }
        if (m.type === "frame"){
          const fIndex = m.frameIndex;
          const fId = m.frameId;
          const fName = m.frameName;
          const getTriggers = window.getFrameTriggersForCard;
          const triggers = (typeof getTriggers === "function") ? getTriggers(cardId) : null;
          if (!Array.isArray(triggers)) return;
          // Iterate over triggers and dispatch matching geometry commands. Use a plain for loop
          // so that triggers can be removed during iteration.
          for (let i=0; i<triggers.length; i++){
            const trig = triggers[i];
            // Match on provided criteria. If a criterion is defined and does not match, skip.
            if (trig.hasOwnProperty('frameIndex') && trig.frameIndex !== fIndex) continue;
            if (trig.frameId && trig.frameId !== fId) continue;
            if (trig.frameName && trig.frameName !== fName) continue;
            const builder = window.buildGeometryCommandFromTrigger;
            const cmd = (typeof builder === "function") ? builder(trig, targetRoot) : null;
            if (cmd){
              const hasGeometry = ["left", "top", "width", "height"].some((field) => typeof cmd[field] === "number");
              if (hasGeometry){
                sendCommandToViewer(cmd, targetRoot);
              } else {
                log("Tasker: trigger matched but no valid geometry fields after evaluation.", "warn", targetRoot);
              }
            }
            // Remove one-shot triggers; keep repeating triggers
            if (!trig.repeat){
              triggers.splice(i, 1);
              i--;
            }
          }
        }
      });
    }
  }
