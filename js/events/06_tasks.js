  // Tasks: add/delete/update/run
  function updateSelectedTaskFromEditor(cardRoot){
    const root = resolveCardRoot(cardRoot);
    const run = (fn) => (typeof window.withCardRegistry === "function") ? window.withCardRegistry(root, fn) : fn();
    if (!selectedTaskId) return true;
    const t = getNode(selectedTaskId);
    if (!t || t.type !== "Task") return true;
    const nameInput = root ? $role(root, "task-name-input") : null;
    const cmdsInput = root ? $role(root, "task-commands-input") : null;
    const nameVal = nameInput ? nameInput.value.trim() : "";
    const cmdsText = cmdsInput ? cmdsInput.value : "";
    let cmds = [];
    if (cmdsText.trim() !== ""){
      try{
        const arr = JSON.parse(cmdsText);
        if (Array.isArray(arr)) cmds = arr;
        else throw new Error("Commands must be an array");
      } catch(e){
        log(`Commands JSON parse error: ${e.message}`, "bad", root);
        return false;
      }
    }
    t.name = nameVal;
    t.commands = cmds;
    t.commands.forEach((cmd, index) => {
      if (cmd && typeof cmd === "object") {
        log(`Command ${index} types: left=${typeof cmd.left}, top=${typeof cmd.top}`, "info", root);
      }
    });
    setNode(selectedTaskId, t);
    clearCaches();
    refreshAllUI(root);
    log(`Updated task: ${t.name || selectedTaskId}`, "info", root);
    return true;
  }

  function initTaskEvents(cardRoot){
    const root = resolveCardRoot(cardRoot);
    const btnAdd = root ? $role(root, "btn-add-task") : null;
    const btnDel = root ? $role(root, "btn-del-task") : null;
    const btnUpdate = root ? $role(root, "btn-update-task") : null;
    const btnRun = root ? $role(root, "btn-run-tasks") : null;
    const btnPlay = root ? $role(root, "btn-play") : null;
    const btnStep = root ? $role(root, "btn-step") : null;
    const btnReset = root ? $role(root, "btn-reset") : null;

    if (btnAdd){
      btnAdd.onclick = () => run(() => {
        // Create a new Task node with a default name. Use a properly closed template literal for the name.
        // Build task name using concatenation to avoid nested template literal issues
        const t = { type:"Task", name: 'Task ' + ((registry.roots.tasks||[]).length + 1), commands: [] };
        const tid = makeNewId("tsk");
        setNode(tid, t);
        registry.roots.tasks = Array.isArray(registry.roots.tasks) ? registry.roots.tasks : [];
        registry.roots.tasks.push(tid);
        selectedTaskId = tid;
        clearCaches();
        refreshAllUI(root);
        renderOnce(root);
      });
    }

    if (btnDel){
      btnDel.onclick = () => run(() => {
        if (!selectedTaskId) return;
        registry.roots.tasks = (registry.roots.tasks||[]).filter(x => x !== selectedTaskId);
        deleteNode(selectedTaskId, root);
        selectedTaskId = null;
        clearCaches();
        refreshAllUI(root);
        renderOnce(root);
      });
    }

    if (btnUpdate){
      btnUpdate.onclick = () => run(() => {
        updateSelectedTaskFromEditor(root);
      });
    }

    if (btnRun){
      btnRun.onclick = () => run(() => {
        const ok = updateSelectedTaskFromEditor(root);
        if (ok) runTasks(root);
      });
    }

    if (btnPlay){
      btnPlay.onclick = () => run(async () => {
        const state = getRendererState(root);
        if (!state) return;
        state.playing = !state.playing;
        setPlayButtonState(root, state.playing);
        if (state.playing){
          state.nextAt = performance.now();
          await renderOnce(root);
          pushStateToPopout(true, root);
          requestAnimationFrame(() => tick(root));
        } else {
          await renderOnce(root);
        }
      });
    }

    if (btnStep){
      btnStep.onclick = () => run(async () => {
        const state = getRendererState(root);
        const plan = registry.roots.recipe ? buildRenderPlan(registry.roots.recipe) : null;
        if (!state || !plan || plan.frames.length === 0) return;
        state.curFrame = (state.curFrame + 1) % plan.frames.length;
        await renderOnce(root);
        pushStateToPopout(true, root);
      });
    }

    if (btnReset){
      btnReset.onclick = () => run(async () => {
        const state = getRendererState(root);
        if (!state) return;
        state.curFrame = 0;
        await renderOnce(root);
        pushStateToPopout(true, root);
      });
    }
  }
