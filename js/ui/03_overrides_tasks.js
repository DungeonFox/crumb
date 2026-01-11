  function refreshOverridesUI(cardRoot){
    const root = resolveCardRoot(cardRoot);
    const run = (fn) => (typeof window.withCardRegistry === "function") ? window.withCardRegistry(root, fn) : fn();
    if (!root) return;
    const box = $role(root, "override-list");
    if (!box) return;
    box.innerHTML = "";
    const rec = registry.roots.recipe ? getNode(registry.roots.recipe) : null;
    if (!rec || rec.type !== "Recipe") return;
    const tpl = rec.template ? getNode(rec.template) : null;
    if (!tpl || tpl.type !== "Template") return;

    const layer = selectedLayerId ? getNode(selectedLayerId) : null;
    if (!layer || layer.type !== "Layer"){
      const msg = document.createElement("div");
      msg.className = "item";
      msg.textContent = "Select a layer to edit overrides.";
      box.appendChild(msg);
      return;
    }

    const rectIds = Array.isArray(tpl.rects) ? tpl.rects.slice() : [];
    const frameIds = Array.isArray(tpl.frames) ? tpl.frames.slice() : [];

    const head = document.createElement("div");
    head.className = "head";
    head.style.gridTemplateColumns = "140px 1fr 130px 70px 70px 90px 90px";
    head.innerHTML = `<div>FrameSlot</div><div>Name</div><div>Rect</div><div>dx</div><div>dy</div><div>opacity</div><div>actions</div>`;
    box.appendChild(head);

    for (const fid of frameIds){
      const f = getNode(fid);
      const ov = (layer.overrides && layer.overrides[fid]) ? layer.overrides[fid] : null;
      const item = document.createElement("div");
      item.className = "item";
      item.style.gridTemplateColumns = "140px 1fr 130px 70px 70px 90px 90px";

      const rectVal = ov?.rect || "";
      const dxVal = (ov && ov.dx !== undefined) ? ov.dx : "";
      const dyVal = (ov && ov.dy !== undefined) ? ov.dy : "";
      const opVal = (ov && ov.opacity !== undefined) ? ov.opacity : "";

      item.innerHTML = `
        <div class="mono">${fid}</div>
        <div>${escapeHtml(f?.name || "")}</div>
        <div>${selectBox(`ov:${selectedLayerId}:${fid}`,"rect",["", ...rectIds], rectVal)}</div>
        <div><input data-ov="dx" data-l="${selectedLayerId}" data-f="${fid}" type="number" step="1" value="${escapeHtml(dxVal)}" /></div>
        <div><input data-ov="dy" data-l="${selectedLayerId}" data-f="${fid}" type="number" step="1" value="${escapeHtml(dyVal)}" /></div>
        <div><input data-ov="opacity" data-l="${selectedLayerId}" data-f="${fid}" type="number" step="0.05" min="0" max="1" value="${escapeHtml(opVal)}" /></div>
        <div class="row" style="gap:6px">
          <button data-ov-set="${fid}">Set</button>
          <button data-ov-clear="${fid}" class="danger">Clear</button>
        </div>
      `;
      box.appendChild(item);
    }
  }

  function refreshTaskerUI(cardRoot){
    const root = resolveCardRoot(cardRoot);
    if (!root) return;
    const taskList = $role(root, "task-list");
    if (!taskList) return;
    taskList.innerHTML = "";
    const head = document.createElement("div");
    head.className = "head";
    head.style.gridTemplateColumns = "140px 1fr 90px";
    head.innerHTML = `<div>ID</div><div>Name</div><div>#Cmds</div>`;
    taskList.appendChild(head);
    const tasks = listNodesOfType("Task").map(x => x.id).sort();
    for (const tid of tasks){
      const t = getNode(tid);
      const item = document.createElement("div");
      item.className = "item";
      item.style.gridTemplateColumns = "140px 1fr 90px";
      item.style.cursor = "pointer";
      if (tid === selectedTaskId) item.style.background = "rgba(93,214,193,0.10)";
      const ncmd = Array.isArray(t.commands) ? t.commands.length : 0;
      item.innerHTML = `
        <div class="mono">${tid}</div>
        <div>${escapeHtml(t.name || "")}</div>
        <div class="mono">${ncmd}</div>
      `;
      item.onclick = () => run(() => {
        selectedTaskId = tid;
        refreshAllUI(root);
      });
      taskList.appendChild(item);
    }
    // Populate selected task editor fields
    const tsel = selectedTaskId ? getNode(selectedTaskId) : null;
    const taskNameInput = $role(root, "task-name-input");
    const taskCommandsInput = $role(root, "task-commands-input");
    if (tsel && tsel.type === "Task"){
      if (taskNameInput) taskNameInput.value = tsel.name || "";
      if (taskCommandsInput) taskCommandsInput.value = JSON.stringify(tsel.commands || [], null, 2);
    } else {
      if (taskNameInput) taskNameInput.value = "";
      if (taskCommandsInput) taskCommandsInput.value = "";
    }
  }
