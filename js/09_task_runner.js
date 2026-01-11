  // ---------------------------
  // Task Runner
  // ---------------------------
  const taskRunnerStates = new Map();
  const DEFAULT_TASK_RUNNER_CARD_KEY = "default";

  function getTaskRunnerState(cardRoot){
    const root = resolveCardRoot(cardRoot);
    const cardId = getCardIdFromRoot(root) || DEFAULT_TASK_RUNNER_CARD_KEY;
    let state = taskRunnerStates.get(cardId);
    if (!state){
      state = {
        cardId,
        runningTasks: false,
        frameTriggers: [],
        geometryFallbackWarned: false
      };
      taskRunnerStates.set(cardId, state);
    }
    state.root = root;
    return state;
  }

  function getFrameTriggersForCard(cardId){
    const key = cardId || DEFAULT_TASK_RUNNER_CARD_KEY;
    const state = taskRunnerStates.get(key);
    return state ? state.frameTriggers : [];
  }

  window.getFrameTriggersForCard = getFrameTriggersForCard;

  function geometryTokenValues(cardRoot){
    const state = getTaskRunnerState(cardRoot);
    const values = {
      CLl: 0,
      CLt: 0,
      CLw: 0,
      CLh: 0
    };
    const currentViewerGeometry = window.currentViewerGeometryByCard?.get(state.cardId);
    if (!currentViewerGeometry || typeof currentViewerGeometry !== "object"){
      if (!state.geometryFallbackWarned){
        log("Tasker: viewer window geometry unavailable; using 0 for CL* tokens.", "warn", state.root);
        state.geometryFallbackWarned = true;
      }
      return values;
    }
    const mappings = {
      CLl: "left",
      CLt: "top",
      CLw: "width",
      CLh: "height"
    };
    let missing = false;
    for (const [token, field] of Object.entries(mappings)){
      const v = currentViewerGeometry[field];
      if (typeof v === "number" && Number.isFinite(v)){
        values[token] = v;
      } else {
        missing = true;
      }
    }
    if (missing && !state.geometryFallbackWarned){
      log("Tasker: viewer window geometry incomplete; using 0 for missing CL* tokens.", "warn", state.root);
      state.geometryFallbackWarned = true;
    }
    return values;
  }

  function normalizeGeometryExpression(expr){
    if (typeof expr !== "string") return null;
    let normalized = expr.replace(/\u00A0/g, " ");
    normalized = normalized.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, "\"");
    normalized = normalized.trim();
    if (normalized.length >= 2){
      const first = normalized[0];
      const last = normalized[normalized.length - 1];
      if ((first === "\"" && last === "\"") || (first === "'" && last === "'")){
        normalized = normalized.slice(1, -1).trim();
      }
    }
    return normalized;
  }

  function tokenizeGeometryExpression(expr, cardRoot){
    const tokens = [];
    const re = /\s*([+\-*/]|CL[ltwh]|\d*\.?\d+)\s*/giy;
    let endIndex = 0;
    let match;
    while ((match = re.exec(expr)) !== null){
      endIndex = re.lastIndex;
      const token = match[1];
      if (token === "+" || token === "-" || token === "*" || token === "/"){
        tokens.push({ type: "op", value: token });
      } else if (token.length === 3 && token.slice(0, 2).toLowerCase() === "cl"){
        const suffix = token[2].toLowerCase();
        const normalized = suffix === "l" ? "CLl"
          : suffix === "t" ? "CLt"
          : suffix === "w" ? "CLw"
          : "CLh";
        tokens.push({ type: "var", value: normalized });
      } else {
        tokens.push({ type: "number", value: Number(token) });
      }
    }
    if (tokens.length === 0 || endIndex !== expr.length){
      const reason = tokens.length === 0
        ? "no tokens parsed"
        : `unexpected token at index ${endIndex}`;
      log(`Tasker: rejected geometry expression "${expr}" (${reason}).`, "warn", cardRoot);
      return null;
    }
    return tokens;
  }

  function evaluateGeometryExpression(expr, cardRoot){
    if (typeof expr !== "string") return null;
    const root = resolveCardRoot(cardRoot);
    log(`Tasker: expr raw="${expr}"`, "warn", root);
    const rawCodes = Array.from(expr).map(ch => ch.codePointAt(0).toString(16)).join(" ");
    log(`Tasker: expr codepoints=${rawCodes}`, "warn", root);
    const trimmed = expr.trim();
    log(`Tasker: expr trim="${trimmed}"`, "warn", root);
    const trimCodes = Array.from(trimmed).map(ch => ch.codePointAt(0).toString(16)).join(" ");
    log(`Tasker: expr trim codepoints=${trimCodes}`, "warn", root);
    const normalized = normalizeGeometryExpression(expr);
    if (typeof normalized !== "string") return null;
    const tokens = tokenizeGeometryExpression(normalized, root);
    if (!tokens) return null;
    const values = geometryTokenValues(root);
    let idx = 0;

    function parseFactor(){
      const token = tokens[idx];
      if (!token) return null;
      if (token.type === "op" && (token.value === "+" || token.value === "-")){
        idx++;
        const value = parseFactor();
        if (value === null) return null;
        return token.value === "-" ? -value : value;
      }
      if (token.type === "number"){
        idx++;
        return token.value;
      }
      if (token.type === "var"){
        idx++;
        const v = values[token.value];
        return (typeof v === "number") ? v : null;
      }
      return null;
    }

    function parseTerm(){
      let left = parseFactor();
      if (left === null) return null;
      while (idx < tokens.length && tokens[idx].type === "op" && (tokens[idx].value === "*" || tokens[idx].value === "/")){
        const op = tokens[idx].value;
        idx++;
        const right = parseFactor();
        if (right === null) return null;
        left = op === "*" ? left * right : left / right;
      }
      return left;
    }

    function parseExpression(){
      let left = parseTerm();
      if (left === null) return null;
      while (idx < tokens.length && tokens[idx].type === "op" && (tokens[idx].value === "+" || tokens[idx].value === "-")){
        const op = tokens[idx].value;
        idx++;
        const right = parseTerm();
        if (right === null) return null;
        left = op === "+" ? left + right : left - right;
      }
      return left;
    }

    const result = parseExpression();
    if (result === null || idx !== tokens.length || Number.isNaN(result)) return null;
    return result;
  }

  function normalizeGeometryFields(source, target, contextLabel, cardRoot){
    const fields = ["left", "top", "width", "height"];
    for (const field of fields){
      if (!source.hasOwnProperty(field)) continue;
      const value = source[field];
      if (typeof value === "number"){
        if (Number.isFinite(value)){
          target[field] = value;
        } else {
          if (target.hasOwnProperty(field)) delete target[field];
          log(`Tasker: skipped ${contextLabel} ${field} value (non-finite number).`, "warn", cardRoot);
        }
        continue;
      }
      if (typeof value === "string"){
        const evaluated = evaluateGeometryExpression(value, cardRoot);
        if (typeof evaluated === "number" && Number.isFinite(evaluated)){
          target[field] = evaluated;
        } else {
          if (target.hasOwnProperty(field)) delete target[field];
          log(`Tasker: skipped ${contextLabel} ${field} value "${value}" (invalid expression).`, "warn", cardRoot);
        }
        continue;
      }
      if (value !== undefined){
        if (target.hasOwnProperty(field)) delete target[field];
        log(`Tasker: skipped ${contextLabel} ${field} value (non-number).`, "warn", cardRoot);
      }
    }
  }

  function buildGeometryCommandFromTrigger(trigger, cardRoot){
    if (!trigger || typeof trigger !== "object") return null;
    const cmd = { cmd: "setWindowGeometry" };
    normalizeGeometryFields(trigger, cmd, "trigger", cardRoot);
    if (typeof trigger.duration === "number" && Number.isFinite(trigger.duration)){
      cmd.duration = trigger.duration;
    }
    if (typeof trigger.ease === "string"){
      cmd.ease = trigger.ease;
    }
    return cmd;
  }

  function findCommandElement(cardRoot, id){
    if (!id || typeof id !== "string") return null;
    const root = resolveCardRoot(cardRoot);
    if (!root) return null;
    const direct = $in(root, `[data-role="${id}"]`);
    if (direct) return direct;
    const role = toDataRole(id);
    if (!role) return null;
    return $in(root, `[data-role="${role}"]`);
  }

  async function runTasks(cardRoot){
    const state = getTaskRunnerState(cardRoot);
    const root = state.root;
    if (!root) return;
    if (typeof window.withCardRegistry === "function"){
      return window.withCardRegistry(root, () => __runTasksInner(root, state));
    }
    return __runTasksInner(root, state);
  }

  async function __runTasksInner(root, state){
    if (state.runningTasks){
      log("Tasker is already running.", "warn", root);
      return;
    }
    const taskIds = (getRegistryState(root).roots.tasks) || [];
    if (!taskIds.length){
      log("No tasks to run.", "warn", root);
      return;
    }
    state.runningTasks = true;
    log(`Starting ${taskIds.length} task(s)...`, "info", root);
    // Clear any existing frame triggers at the start of a run. New triggers will be
    // collected as tasks are processed.
    state.frameTriggers = [];
    for (const tid of taskIds){
      const t = getNode(tid);
      if (!t || t.type !== "Task") continue;
      log(`Running task: ${t.name || tid}`, "info", root);
      const cmds = Array.isArray(t.commands) ? t.commands : [];
      for (const cmd of cmds){
        if (!state.runningTasks) break;
        // Wait commands are handled locally; setWindowGeometryOnFrame commands are collected
        // as triggers; all other commands are forwarded to the viewer immediately.
        if (cmd.cmd === 'wait'){
          const dur = Math.max(0, cmd.duration || 0);
          await new Promise(res => setTimeout(res, dur));
        } else if (cmd.cmd === 'setDomValue'){
          const id = cmd.id;
          const value = cmd.value;
          let el = findCommandElement(root, id);
          const popoutWin = (typeof window.getPopoutWindow === "function") ? window.getPopoutWindow(root) : null;
          if (!el && typeof id === "string" && popoutWin && !popoutWin.closed){
            el = popoutWin.document.getElementById(id);
          }
          if (!el){
            log(`Tasker: setDomValue element not found (id: ${id}).`, "warn", root);
          } else {
            el.value = value;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          }
        } else if (cmd.cmd === 'clickDom'){
          const id = cmd.id;
          let el = findCommandElement(root, id);
          const popoutWin = (typeof window.getPopoutWindow === "function") ? window.getPopoutWindow(root) : null;
          if (!el && typeof id === "string" && popoutWin && !popoutWin.closed){
            el = popoutWin.document.getElementById(id);
          }
          if (!el){
            log(`Tasker: clickDom element not found (id: ${id}).`, "warn", root);
          } else if (typeof el.click === "function"){
            el.click();
          }
        } else if (cmd.cmd === 'setWindowGeometryOnFrame'){
          // Collect a deferred geometry trigger. Accept matching criteria on frameIndex, frameId or frameName.
          const trig = {};
          if (cmd.hasOwnProperty('frameIndex')) trig.frameIndex = cmd.frameIndex;
          if (cmd.frameId) trig.frameId = cmd.frameId;
          if (cmd.frameName) trig.frameName = cmd.frameName;
          const fields = ["left", "top", "width", "height"];
          for (const field of fields){
            if (cmd.hasOwnProperty(field)) trig[field] = cmd[field];
          }
          if (cmd.hasOwnProperty('duration')) trig.duration = cmd.duration;
          if (cmd.hasOwnProperty('ease')) trig.ease = cmd.ease;
          trig.repeat = !!cmd.repeat;
          state.frameTriggers.push(trig);
        } else {
          if (cmd.cmd === "setWindowGeometry"){
            const normalized = { ...cmd };
            normalizeGeometryFields(cmd, normalized, "command", root);
            const sent = sendCommandToViewer(normalized, root);
            if (!sent){
              log("Tasker: viewer window is not open; geometry command skipped.", "warn", root);
            }
          } else {
            const sent = sendCommandToViewer(cmd, root);
            if (!sent){
              log("Tasker: viewer window is not open; command skipped.", "warn", root);
            }
          }
        }
        // Small yield to allow UI updates
        await new Promise(res => setTimeout(res, 0));
      }
    }
    state.runningTasks = false;
    log("Tasker finished.", "info", root);
  }

  window.buildGeometryCommandFromTrigger = buildGeometryCommandFromTrigger;
