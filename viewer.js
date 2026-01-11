(() => {
  const params = new URLSearchParams(window.location.search);
  const viewerCardId = params.get("cardId") || "default";
  const cv = document.getElementById("cv");
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  const info = document.getElementById("info");
  const btn = document.getElementById("btnToggle");

  let playing = true;
  let state = null;
  let images = new Map();
  let cur = 0, nextAt = 0;

  function clamp01(x){ return Math.max(0, Math.min(1, x)); }

  // Smooth window geometry animation (for Tasker-driven window movement).
  // Commands: {cmd:'setWindowGeometry', left, top, width, height, duration?, ease?}
  // - duration (ms): default 250, set to 0 for instant snap.
  // - ease: 'linear' | 'inOutCubic' (default).
  let geomAnimToken = 0;

  function lerp(a,b,t){ return a + (b - a) * t; }
  function easeLinear(t){ return t; }
  function easeInOutCubic(t){
    return (t < 0.5) ? (4 * t * t * t) : (1 - Math.pow(-2 * t + 2, 3) / 2);
  }
  function getEase(name){
    if (typeof name !== 'string') return easeInOutCubic;
    const n = name.trim();
    if (n === 'linear') return easeLinear;
    if (n === 'inOutCubic' || n === 'easeInOutCubic') return easeInOutCubic;
    return easeInOutCubic;
  }
  function currentGeom(){
    // screenX/screenY are the most widely supported window position accessors.
    return { left: window.screenX, top: window.screenY, width: window.outerWidth, height: window.outerHeight };
  }
  function postWindowGeometry(){
    try{
      if (window.opener && !window.opener.closed){
        const geom = currentGeom();
        window.opener.postMessage({ type: "windowGeometry", ...geom, cardId: viewerCardId }, "*");
      }
    } catch (e){
      /* ignore errors communicating with opener */
    }
  }
  function postWindowGeometry(){
    try{
      if (window.opener && !window.opener.closed){
        const geom = { type: "windowGeometry", ...currentGeom(), cardId: viewerCardId };
        window.opener.postMessage(geom, "*");
      }
    } catch (e){
      /* ignore errors communicating with opener */
    }
  }
  function applyGeom(g){
    try{
      if (typeof g.width === 'number' || typeof g.height === 'number'){
        const w = (typeof g.width === 'number') ? Math.max(100, g.width) : window.outerWidth;
        const h = (typeof g.height === 'number') ? Math.max(100, g.height) : window.outerHeight;
        window.resizeTo(w, h);
      }
      if (typeof g.left === 'number' || typeof g.top === 'number'){
        const x = (typeof g.left === 'number') ? g.left : window.screenX;
        const y = (typeof g.top === 'number') ? g.top : window.screenY;
        window.moveTo(x, y);
      }
    } catch (e){
      /* ignore errors */
    }
  }
  async function animateWindowGeometry(cmd){
    const duration = (typeof cmd.duration === 'number') ? Math.max(0, cmd.duration) : 250;
    const ease = getEase(cmd.ease);
    if (duration <= 0){
      applyGeom(cmd);
      postWindowGeometry();
      return;
    }
    const start = currentGeom();
    const end = {
      left: (typeof cmd.left === 'number') ? cmd.left : start.left,
      top: (typeof cmd.top === 'number') ? cmd.top : start.top,
      width: (typeof cmd.width === 'number') ? Math.max(100, cmd.width) : start.width,
      height: (typeof cmd.height === 'number') ? Math.max(100, cmd.height) : start.height
    };

    const token = ++geomAnimToken;
    const t0 = performance.now();

    return await new Promise((resolve) => {
      function step(ts){
        if (token !== geomAnimToken) return resolve();
        const raw = (ts - t0) / duration;
        const t = raw <= 0 ? 0 : raw >= 1 ? 1 : raw;
        const k = ease(t);

        // Round so moveTo/resizeTo don't get fractional wobble.
        const g = {
          left: Math.round(lerp(start.left, end.left, k)),
          top: Math.round(lerp(start.top, end.top, k)),
          width: Math.round(lerp(start.width, end.width, k)),
          height: Math.round(lerp(start.height, end.height, k))
        };

        applyGeom(g);

        if (t >= 1){
          postWindowGeometry();
          resolve();
        }
        else requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  async function ensureImg(id, src){
    if (!src || typeof src !== "string" || !src.startsWith("data:image/")) return null;
    if (images.has(id)) return images.get(id);
    const img = new Image();
    const p = new Promise((res, rej) => { img.onload = () => res(img); img.onerror = () => rej(new Error("load fail")); });
    img.src = src;
    try { await p; images.set(id, img); return img; } catch { return null; }
  }

  async function draw(){
    if (!state) return;
    const {outW,outH,frames,layers,rects,assets} = state;
    if (cv.width !== outW || cv.height !== outH){ cv.width = outW; cv.height = outH; }

    // checker
    const cs = 8;
    for (let y=0;y<outH;y+=cs){
      for (let x=0;x<outW;x+=cs){
        ctx.fillStyle = ((x/cs + y/cs) % 2 === 0) ? "#0c1118" : "#0a0e14";
        ctx.fillRect(x,y,cs,cs);
      }
    }

    const f = frames[cur];
    if (!f) return;

    for (const L of layers){
      if (!L.visible) continue;
      const ov = (L.overrides && L.overrides[f.id]) ? L.overrides[f.id] : {};
      const rectId = ov.rect || L.defaultRect;
      const R = rects[rectId];
      if (!R) continue;
      const aId = L.asset || R.asset;
      const A = assets[aId];
      const img = A ? await ensureImg(aId, A.src) : null;

      const op = clamp01((L.opacity ?? 1) * (ov.opacity ?? 1));
      const sx=R.sx||0, sy=R.sy||0, sw=R.sw||0, sh=R.sh||0;
      const dx=(R.dx||0)+(ov.dx||0), dy=(R.dy||0)+(ov.dy||0);
      const dw=(R.dw||sw||0), dh=(R.dh||sh||0);

      ctx.save();
      ctx.globalAlpha = op;
      ctx.imageSmoothingEnabled = false;
      if (img) ctx.drawImage(img, sx,sy,sw,sh, dx,dy,dw,dh);
      else {
        ctx.fillStyle="rgba(255,204,102,0.20)";
        ctx.strokeStyle="rgba(255,204,102,0.55)";
        ctx.lineWidth=2;
        ctx.fillRect(dx,dy,dw,dh); ctx.strokeRect(dx+1,dy+1,Math.max(0,dw-2),Math.max(0,dh-2));
      }
      ctx.restore();
    }

    info.textContent = '' + (cur+1) + '/' + frames.length + '  ' + (f.name || f.id) + '  (' + f.duration + 'ms)';
  }

  function dur(){ return Math.max(1, state?.frames?.[cur]?.duration || 100); }

  async function tick(ts){
    if (playing && state){
      if (ts >= nextAt){
        await draw();

        // Inform the opener about the frame that was just drawn.
        try {
          if (window.opener && !window.opener.closed && state && Array.isArray(state.frames)){
            const frame = state.frames[cur];
            if (frame){
              const payload = { type: 'frame', frameIndex: cur, frameId: frame.id, frameName: frame.name || '', cardId: viewerCardId };
              window.opener.postMessage(payload, '*');
            }
          }
        } catch (e) {
          /* ignore errors communicating with opener */
        }

        nextAt = ts + dur();
        cur = (cur + 1) % state.frames.length;
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  btn.onclick = () => { playing = !playing; btn.textContent = playing ? "Pause" : "Play"; };

  async function handleCommand(cmd){
    if (!cmd || typeof cmd !== "object") return;
    const c = cmd;
    switch (c.cmd){
      case 'pause': playing = false; btn.textContent = 'Play'; break;
      case 'play': playing = true; btn.textContent = 'Pause'; break;
      case 'goToFrameIndex':
        if (state && Array.isArray(state.frames)){
          const idx = Math.max(0, Math.min(state.frames.length-1, c.index || 0));
          cur = idx;
          nextAt = performance.now() + dur();
          await draw();

          // After jumping to a frame, notify the opener immediately so frame-based triggers can fire.
          try {
            if (window.opener && !window.opener.closed && state && Array.isArray(state.frames)){
              const frame = state.frames[cur];
              if (frame){
              const payload = { type: 'frame', frameIndex: cur, frameId: frame.id, frameName: frame.name || '', cardId: viewerCardId };
              window.opener.postMessage(payload, '*');
            }
          }
          } catch (e) {
            /* ignore errors */
          }
        }
        break;
      case 'setLayerVisibility':
        if (state && state.layers){
          const layer = state.layers.find(l => l.id === c.layer);
          if (layer) layer.visible = !!c.visible;
          await draw();
        }
        break;
      case 'setLayerOpacity':
        if (state && state.layers){
          const layer = state.layers.find(l => l.id === c.layer);
          if (layer) layer.opacity = clamp01(c.opacity ?? 1);
          await draw();
        }
        break;
      case 'setWindowGeometry':
        // Resize/move the viewer window (animated by default).
        try{
          await animateWindowGeometry(c);
        } catch (e){ /* ignore errors */ }
        postWindowGeometry();
        break;
      default:
        // unknown command
        break;
    }
  }

  window.addEventListener("message", async (ev) => {
    const m = ev.data;
    if (!m || typeof m !== "object") return;
    if (m.cardId && m.cardId !== viewerCardId) return;
    if (!m.cardId && viewerCardId !== "default") return;
    if (m.type === "state"){
      state = m.state;
      if (m.reset){ cur = 0; nextAt = performance.now(); }
      await draw();
    } else if (m.type === "command"){
      await handleCommand(m.command);
    }
  });

  // Tell the opener we’re alive so it can push the initial state immediately.
  try{
    if (window.opener && !window.opener.closed){
      window.opener.postMessage({ type: "viewerReady", cardId: viewerCardId }, "*");
      postWindowGeometry();
    }
  } catch (e){
    /* ignore */
  }
  postWindowGeometry();
})();
