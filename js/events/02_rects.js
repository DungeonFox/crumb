  // Add/delete Rect
  function initRectEvents(cardRoot){
    const root = resolveCardRoot(cardRoot);
    const run = (fn) => (typeof window.withCardRegistry === "function") ? window.withCardRegistry(root, fn) : fn();
    const btnAdd = root ? $role(root, "btn-add-rect") : null;
    const btnDel = root ? $role(root, "btn-del-rect") : null;
    if (btnAdd){
      btnAdd.onclick = () => run(() => {
        const tpl = getNode(registry.roots.template);
        if (!tpl || tpl.type !== "Template") return;
        // Use string concatenation for the name to avoid nested template literal syntax issues
        const rect = { type:"Rect", name:'rect' + ((tpl.rects||[]).length), asset:(registry.roots.assets?.[0]||""), sx:0, sy:0, sw:32, sh:32, dx:0, dy:0, dw:32, dh:32 };
        const rid = makeNewId("tpl");
        setNode(rid, rect);
        tpl.rects = Array.isArray(tpl.rects) ? tpl.rects : [];
        tpl.rects.push(rid);
        setNode(registry.roots.template, tpl);
        selectedRectId = rid;
        clearCaches();
        refreshAllUI(root);
        renderOnce(root);
      });
    }
    if (btnDel){
      btnDel.onclick = () => run(() => {
        const tpl = getNode(registry.roots.template);
        if (!tpl || tpl.type !== "Template" || !selectedRectId) return;
        tpl.rects = (tpl.rects||[]).filter(x => x !== selectedRectId);
        setNode(registry.roots.template, tpl);
        deleteNode(selectedRectId, root);

        // Remove references from layers
        for (const {id, node} of listNodesOfType("Layer")){
          if (node.defaultRect === selectedRectId) node.defaultRect = "";
          if (node.overrides && typeof node.overrides === "object"){
            for (const k of Object.keys(node.overrides)){
              if (node.overrides[k]?.rect === selectedRectId) delete node.overrides[k].rect;
              if (Object.keys(node.overrides[k]||{}).length === 0) delete node.overrides[k];
            }
          }
          setNode(id, node);
        }

        selectedRectId = null;
        clearCaches();
        refreshAllUI(root);
        renderOnce(root);
      });
    }
  }
