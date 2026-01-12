(() => {
  const NS = "http://www.w3.org/2000/svg";
  const ATLAS = window.FONT_ATLAS;
  if (!ATLAS || !ATLAS.glyphs){
    console.warn("SVG text renderer: FONT_ATLAS missing.");
    return;
  }

  const GLYPHS = ATLAS.glyphs;
  const FALLBACK_KEY = "U003F"; // '?'
  const SPACE_KEY = "U0020";

  function svgEl(name){
    return document.createElementNS(NS, name);
  }

  function normalizeText(s){
    if (typeof s !== "string") return "";
    s = s.replaceAll("\r\n", "\n");
    s = s.replaceAll("\r", "\n");
    s = s.split("“").join('"').split("”").join('"');
    s = s.split("‘").join("'").split("’").join("'");
    s = s.split("–").join("-").split("—").join("-");
    s = s.split("…").join("...");
    s = s.split("•").join("*").split("·").join("*");
    s = s.split("\u00A0").join(" ");
    return s;
  }

  function keyForChar(ch){
    const cp = ch.codePointAt(0);
    const hex = cp.toString(16).toUpperCase().padStart(4, "0");
    return "U" + hex;
  }

  function glyphForChar(ch){
    if (ch === "\t") ch = " ";
    const key = keyForChar(ch);
    return GLYPHS[key] ? key : (GLYPHS[FALLBACK_KEY] ? FALLBACK_KEY : key);
  }

  function isSpaceGlyphKey(key){
    return key === SPACE_KEY;
  }

  function tokenize(text){
    text = normalizeText(text);
    const tokens = [];
    let buf = [];
    let mode = null;

    function flush(){
      if (!buf.length) return;
      tokens.push({ type: mode, glyphKeys: buf });
      buf = [];
    }

    for (const ch of text){
      if (ch === "\n"){
        flush();
        tokens.push({ type: "newline" });
        mode = null;
        continue;
      }
      if (ch === " " || ch === "\t"){
        if (mode !== "space") flush();
        mode = "space";
        buf.push(SPACE_KEY);
        continue;
      }
      if (mode !== "word") flush();
      mode = "word";
      buf.push(glyphForChar(ch));
    }
    flush();
    return tokens;
  }

  function glyphWidthUnits(key){
    const g = GLYPHS[key];
    return (g.edges.L + g.edges.R);
  }

  function glyphHeightUnits(key){
    const g = GLYPHS[key];
    return (g.edges.T + g.edges.B);
  }

  function measureGlyphRunUnits(glyphKeys, trackingUnits){
    let w = 0;
    let h = 0;
    let nonSpaceH = 0;
    for (let i = 0; i < glyphKeys.length; i++){
      const key = glyphKeys[i];
      w += glyphWidthUnits(key);
      if (i !== glyphKeys.length - 1) w += trackingUnits;
      if (!isSpaceGlyphKey(key)){
        nonSpaceH = Math.max(nonSpaceH, glyphHeightUnits(key));
      }
      h = Math.max(h, glyphHeightUnits(key));
    }
    return { width: w, height: (nonSpaceH || h) };
  }

  function splitWordToken(wordToken, maxWidthUnits, trackingUnits){
    const parts = [];
    const keys = wordToken.glyphKeys;
    let start = 0;

    while (start < keys.length){
      let end = start;
      let run = [];
      let best = start;

      while (end < keys.length){
        run.push(keys[end]);
        const m = measureGlyphRunUnits(run, trackingUnits);
        if (m.width <= maxWidthUnits){
          best = end + 1;
          end++;
          continue;
        }
        break;
      }

      if (best === start){
        parts.push({ type: "word", glyphKeys: [keys[start]] });
        start += 1;
      } else {
        parts.push({ type: "word", glyphKeys: keys.slice(start, best) });
        start = best;
      }
    }

    return parts;
  }

  function wrapTokensIntoLines(tokens, maxWidthUnits, trackingUnits, maxLines, breakLongWords){
    const lines = [];
    let lineKeys = [];

    function commitLine(){
      while (lineKeys.length && isSpaceGlyphKey(lineKeys[0])) lineKeys.shift();
      while (lineKeys.length && isSpaceGlyphKey(lineKeys[lineKeys.length - 1])) lineKeys.pop();
      lines.push(lineKeys);
      lineKeys = [];
    }

    function lineWidthIfAppended(keysToAppend){
      const combined = lineKeys.concat(keysToAppend);
      return measureGlyphRunUnits(combined, trackingUnits).width;
    }

    let ti = 0;
    while (ti < tokens.length){
      const t = tokens[ti];

      if (t.type === "newline"){
        commitLine();
        if (lines.length >= maxLines) return { ok: false, lines: [] };
        ti++;
        continue;
      }

      const tokenKeys = t.glyphKeys || [];

      if (!lineKeys.length && tokenKeys.length && isSpaceGlyphKey(tokenKeys[0])){
        ti++;
        continue;
      }

      if (t.type === "word" && !lineKeys.length){
        const m = measureGlyphRunUnits(tokenKeys, trackingUnits);
        if (m.width > maxWidthUnits){
          if (breakLongWords){
            const parts = splitWordToken(t, maxWidthUnits, trackingUnits);
            tokens.splice(ti, 1, ...parts);
            continue;
          }
          return { ok: false, lines: [] };
        }
      }

      const wouldOverflow = lineKeys.length && (lineWidthIfAppended(tokenKeys) > maxWidthUnits);

      if (wouldOverflow){
        commitLine();
        if (lines.length >= maxLines) return { ok: false, lines: [] };
        if (t.type === "space"){
          ti++;
          continue;
        }
        continue;
      }

      for (const k of tokenKeys) lineKeys.push(k);
      ti++;
    }

    commitLine();
    return { ok: true, lines };
  }

  function flattenGlyphKeys(text){
    const tokens = tokenize(text || "");
    const flat = [];
    for (const t of tokens){
      if (t.type === "newline"){
        flat.push(SPACE_KEY);
        continue;
      }
      if (t.glyphKeys) for (const k of t.glyphKeys) flat.push(k);
    }
    while (flat.length && isSpaceGlyphKey(flat[0])) flat.shift();
    while (flat.length && isSpaceGlyphKey(flat[flat.length - 1])) flat.pop();
    return flat;
  }

  function normalizeArea(area){
    const left = Number.isFinite(area?.left) ? area.left : 0;
    const top = Number.isFinite(area?.top) ? area.top : 0;
    const right = Number.isFinite(area?.right)
      ? area.right
      : (Number.isFinite(area?.width) ? left + area.width : left);
    const bottom = Number.isFinite(area?.bottom)
      ? area.bottom
      : (Number.isFinite(area?.height) ? top + area.height : top);
    const width = Number.isFinite(area?.width) ? area.width : Math.max(0, right - left);
    const height = Number.isFinite(area?.height) ? area.height : Math.max(0, bottom - top);
    return {
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height
    };
  }

  function computePlacements(config){
    const text = (config.text || "").trim();
    if (!text) return { placements: [], lines: [] };

    const scale = config.fontSizePx / ATLAS.font.unitsPerEm;
    if (!Number.isFinite(scale) || scale <= 0){
      return { placements: [], lines: [] };
    }

    const paddingPx = Math.max(0, config.paddingPx || 0);
    const trackingPx = config.trackingPx || 0;
    const lineHeightPx = Math.max(config.lineHeightPx || config.fontSizePx, 1);
    const justifyX = config.justifyX || config.align || "left";
    const justifyY = config.justifyY || "baseline";
    const breakLongWords = Boolean(config.breakLongWords);

    const area = normalizeArea(config.area || {});
    const maxWidthUnits = Math.max(1, (area.width - 2 * paddingPx) / scale);
    const trackingUnits = trackingPx / scale;

    const tokens = tokenize(text);
    const maxLines = Math.max(1, config.maxLines || 1);
    const allowWrap = Boolean(config.allowWrap);

    let linesRes;
    if (!allowWrap || maxLines === 1){
      linesRes = { ok: true, lines: [flattenGlyphKeys(text)] };
    } else {
      linesRes = wrapTokensIntoLines(tokens, maxWidthUnits, trackingUnits, maxLines, breakLongWords);
      if (!linesRes.ok) return { placements: [], lines: [] };
    }

    const lines = linesRes.lines;
    const placements = [];

    const lineBlockHeightPx = lineHeightPx * lines.length;
    const availableHeightPx = Math.max(0, area.height - 2 * paddingPx);
    let baselineStart = area.top + paddingPx + lineHeightPx;
    if (justifyY === "center"){
      baselineStart += (availableHeightPx - lineBlockHeightPx) / 2;
    } else if (justifyY === "bottom"){
      baselineStart += (availableHeightPx - lineBlockHeightPx);
    }

    for (let li = 0; li < lines.length; li++){
      const lineKeys = lines[li];
      const m = measureGlyphRunUnits(lineKeys, trackingUnits);
      const lineWidthPx = m.width * scale;
      const bottom = baselineStart + lineHeightPx * li;

      let xStart;
      if (justifyX === "center"){
        xStart = area.left + (area.width - lineWidthPx) / 2;
      } else if (justifyX === "right"){
        xStart = area.left + area.width - paddingPx - lineWidthPx;
      } else {
        xStart = area.left + paddingPx;
      }

      let xEdge = xStart;
      for (let gi = 0; gi < lineKeys.length; gi++){
        const key = lineKeys[gi];
        const g = GLYPHS[key] || GLYPHS[FALLBACK_KEY];
        const x = xEdge + g.edges.L * scale;
        const y = bottom - g.edges.B * scale;

        if (g.svg && g.svg.pathD){
          placements.push({
            key,
            x,
            y,
            s: scale,
            opacity: config.opacity ?? 1,
            fill: config.fill
          });
        }

        const advUnits = (g.edges.L + g.edges.R);
        xEdge += advUnits * scale;
        if (gi !== lineKeys.length - 1) xEdge += trackingUnits * scale;
      }
    }

    return { placements, lines };
  }

  function ensureDefs(svg){
    let defs = svg.querySelector('defs[data-role="font-atlas-defs"]');
    if (defs) return defs;
    defs = svgEl("defs");
    defs.dataset.role = "font-atlas-defs";
    for (const [key, g] of Object.entries(GLYPHS)){
      if (!g.svg || !g.svg.pathD) continue;
      const p = svgEl("path");
      p.setAttribute("id", key);
      p.setAttribute("d", g.svg.pathD);
      defs.appendChild(p);
    }
    svg.appendChild(defs);
    return defs;
  }

  function clearGlyphLayers(svg){
    const layers = svg.querySelectorAll('[data-role="glyph-layer"]');
    layers.forEach((layer) => layer.remove());
  }

  function renderTextGroup(svg, group){
    if (!svg || !group || !group.area) return;
    ensureDefs(svg);
    clearGlyphLayers(svg);

    const layout = computePlacements(group);
    if (!layout.placements.length) return;

    const gEl = svgEl("g");
    gEl.dataset.role = "glyph-layer";

    for (const pl of layout.placements){
      const use = svgEl("use");
      use.setAttribute("href", "#" + pl.key);
      use.setAttribute("transform", `translate(${pl.x} ${pl.y}) scale(${pl.s})`);
      if (pl.fill) use.setAttribute("fill", pl.fill);
      use.setAttribute("opacity", String(pl.opacity));
      gEl.appendChild(use);
    }

    svg.appendChild(gEl);
  }

  function renderGlyphLabel(svg, text, style, area, options = {}){
    if (!svg || !area) return;
    const width = Math.max(0, area.width || 0);
    const height = Math.max(0, area.height || 0);
    if (!width || !height) return;

    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
    svg.setAttribute("width", `${width}`);
    svg.setAttribute("height", `${height}`);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    clearGlyphLayers(svg);
    if (!text) return;

    const fontSizePx = parsePx(style.fontSize, 14);
    const lineHeightPx = getLineHeightPx(style, fontSizePx);
    const trackingPx = parsePx(style.letterSpacing, 0);
    const fill = style.color || "rgba(235,240,255,.95)";
    const paddingPx = Math.max(0, options.paddingPx || 0);
    const maxLines = Math.max(1, options.maxLines || 1);

    renderTextGroup(svg, {
      text,
      area: {
        left: 0,
        top: 0,
        width,
        height
      },
      fontSizePx,
      lineHeightPx,
      trackingPx,
      paddingPx,
      maxLines,
      justifyX: options.justifyX || options.align || "center",
      justifyY: options.justifyY || "baseline",
      allowWrap: Boolean(options.allowWrap),
      breakLongWords: false,
      fill,
      opacity: options.opacity ?? 1
    });
  }

  function parsePx(value, fallback = 0){
    if (value == null) return fallback;
    const v = Number.parseFloat(String(value).trim().replace(/px$/i, ""));
    return Number.isFinite(v) ? v : fallback;
  }

  function getLineHeightPx(style, fontSizePx){
    const raw = style.lineHeight;
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) return parsed;
    return fontSizePx * 1.2;
  }

  function normalizeJustifyX(value){
    if (!value) return null;
    const raw = String(value).trim().toLowerCase();
    if (raw === "left" || raw === "center" || raw === "right") return raw;
    if (raw === "start" || raw === "flex-start") return "left";
    if (raw === "end" || raw === "flex-end") return "right";
    return null;
  }

  function normalizeJustifyY(value){
    if (!value) return null;
    const raw = String(value).trim().toLowerCase();
    if (raw === "top" || raw === "center" || raw === "bottom" || raw === "baseline") return raw;
    if (raw === "start" || raw === "flex-start") return "top";
    if (raw === "end" || raw === "flex-end") return "bottom";
    if (raw === "middle") return "center";
    return null;
  }

  function resolveJustify(host, style){
    const justifyX = normalizeJustifyX(host?.dataset?.justifyX)
      || normalizeJustifyX(host?.dataset?.uiAlign)
      || normalizeJustifyX(style?.textAlign)
      || normalizeJustifyX(style?.justifyContent)
      || "left";
    const justifyY = normalizeJustifyY(host?.dataset?.justifyY)
      || normalizeJustifyY(style?.alignItems)
      || normalizeJustifyY(style?.verticalAlign)
      || normalizeJustifyY(style?.justifyContent)
      || "baseline";
    return { justifyX, justifyY };
  }

  function getEdgePx(style, varName, fallback){
    const raw = style.getPropertyValue(varName);
    if (raw && raw.trim() !== ""){
      const parsed = parsePx(raw, fallback);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  }

  function getTextHostArea(host, container){
    const hostRect = host.getBoundingClientRect();
    const containerRect = container?.getBoundingClientRect ? container.getBoundingClientRect() : hostRect;
    const width = host.clientWidth || hostRect.width;
    const height = host.clientHeight || hostRect.height;
    const style = window.getComputedStyle(host);
    const edgeLeft = getEdgePx(style, "--text-left", parsePx(style.paddingLeft, 0));
    const edgeRight = getEdgePx(style, "--text-right", parsePx(style.paddingRight, 0));
    const edgeTop = getEdgePx(style, "--text-top", parsePx(style.paddingTop, 0));
    const edgeBottom = getEdgePx(style, "--text-bottom", parsePx(style.paddingBottom, 0));
    const innerWidth = Math.max(0, width - edgeLeft - edgeRight);
    const innerHeight = Math.max(0, height - edgeTop - edgeBottom);
    const offsetX = hostRect.left - containerRect.left;
    const offsetY = hostRect.top - containerRect.top;
    return {
      left: offsetX + edgeLeft,
      top: offsetY + edgeTop,
      width: innerWidth,
      height: innerHeight
    };
  }

  const cardTextResizeObservers = new WeakMap();

  function getCardTextSource(container){
    if (!container) return null;
    return container.querySelector(".card-text-source") || container;
  }

  function getOrCreateCardTextSvg(container, role){
    if (!container) return null;
    const selector = role
      ? `svg.card-text-svg[data-role="${role}"]`
      : "svg.card-text-svg";
    let svg = container.querySelector(selector);
    if (!svg){
      svg = svgEl("svg");
      svg.classList.add("card-text-svg");
      svg.setAttribute("aria-hidden", "true");
      container.appendChild(svg);
    }
    if (role) svg.dataset.role = role;
    return svg;
  }

  function ensureCardTextObservers(card, blocks){
    if (!card || !window.ResizeObserver) return;
    let entry = cardTextResizeObservers.get(card);
    if (!entry){
      const observer = new ResizeObserver(() => renderCardTextSvg(card));
      entry = { observer, elements: new Set() };
      cardTextResizeObservers.set(card, entry);
    }
    blocks.forEach((block) => {
      if (block.source && !entry.elements.has(block.source)){
        entry.observer.observe(block.source);
        entry.elements.add(block.source);
      }
      if (block.container && !entry.elements.has(block.container)){
        entry.observer.observe(block.container);
        entry.elements.add(block.container);
      }
    });
  }

  function renderTextHostSvg(host, role, options){
    const container = options?.container || host;
    const svg = getOrCreateCardTextSvg(container, role);
    if (!svg) return null;

    const containerRect = container.getBoundingClientRect();
    const containerWidth = container.clientWidth || containerRect.width;
    const containerHeight = container.clientHeight || containerRect.height;
    if (!containerWidth || !containerHeight) return null;

    const area = getTextHostArea(host, container);
    if (!area.width || !area.height) return null;

    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.setAttribute("width", `${containerWidth}`);
    svg.setAttribute("height", `${containerHeight}`);
    svg.setAttribute("viewBox", `0 0 ${containerWidth} ${containerHeight}`);

    return { svg, area, options };
  }

  function renderUiLabelsSvg(cardRoot){
    const card = cardRoot?.classList?.contains("tcg-card")
      ? cardRoot
      : cardRoot?.querySelector?.(".tcg-card");
    if (!card) return;

    const scope = card.closest(".card-shell") || card;
    const labelHosts = scope.querySelectorAll(".svg-label-host");
    if (!labelHosts.length) return;

    labelHosts.forEach((host) => {
      const svg = host.querySelector(".ui-label-svg");
      if (!svg) return;

      const source = host.querySelector(".card-text-source") || host;
      const text = String(source.textContent || "").trim();
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      if (source === host && !host.classList.contains("card-text-source")){
        host.style.color = "transparent";
      }

      svg.style.position = "absolute";
      svg.style.left = "0";
      svg.style.top = "0";
      svg.style.width = `${rect.width}px`;
      svg.style.height = `${rect.height}px`;
      svg.setAttribute("width", `${rect.width}`);
      svg.setAttribute("height", `${rect.height}`);
      svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);

      clearGlyphLayers(svg);
      if (!text) return;

      const hostStyle = window.getComputedStyle(host);
      const sourceStyle = window.getComputedStyle(source);
      const paddingPx = Math.min(
        parsePx(hostStyle.paddingLeft, 0),
        parsePx(hostStyle.paddingRight, 0),
        parsePx(hostStyle.paddingTop, 0),
        parsePx(hostStyle.paddingBottom, 0)
      );
      const { justifyX, justifyY } = resolveJustify(host, hostStyle);
      const fontSizePx = parsePx(sourceStyle.fontSize, 14);
      const lineHeightPx = getLineHeightPx(sourceStyle, fontSizePx);
      const trackingPx = parsePx(sourceStyle.letterSpacing, 0);
      const fill = sourceStyle.color || "rgba(235,240,255,.95)";
      const allowWrap = host.dataset.uiWrap === "true";
      const maxLines = allowWrap
        ? Math.max(1, Math.floor((rect.height - paddingPx * 2) / Math.max(lineHeightPx, 1)))
        : 1;

      renderTextGroup(svg, {
        text,
        area: {
          left: 0,
          top: 0,
          width: rect.width,
          height: rect.height
        },
        fontSizePx,
        lineHeightPx,
        trackingPx,
        paddingPx,
        maxLines,
        justifyX,
        justifyY,
        allowWrap,
        breakLongWords: false,
        fill,
        opacity: 1
      });
    });
  }

  function renderCardTextSvg(cardRoot){
    const card = cardRoot?.classList?.contains("tcg-card")
      ? cardRoot
      : cardRoot?.querySelector?.(".tcg-card");
    if (!card) return;

    const blocks = [
      {
        source: card.querySelector('[data-role="card-title"]'),
        container: card.querySelector(".card-header"),
        role: "card-title-svg",
        paddingPx: 0,
        allowWrap: false
      },
      {
        source: card.querySelector('[data-role="card-text"]'),
        container: card.querySelector(".card-text"),
        role: "card-text-svg",
        paddingPx: 0,
        allowWrap: true
      },
      {
        source: card.querySelector('[data-role="card-task"]'),
        container: card.querySelector(".card-task"),
        role: "card-task-svg",
        paddingPx: 0,
        allowWrap: true
      }
    ];

    ensureCardTextObservers(card, blocks);

    blocks.forEach((block) => {
      if (!block.source) return;
      const renderInfo = renderTextHostSvg(block.source, block.role, block);
      if (!renderInfo) return;

      const { svg, area } = renderInfo;
      const textSource = getCardTextSource(block.source);
      const text = textSource ? String(textSource.textContent || "").trim() : "";

      clearGlyphLayers(svg);

      if (!text) return;

      const sourceStyle = window.getComputedStyle(textSource || block.source);
      const fontSizePx = parsePx(sourceStyle.fontSize, 14);
      const lineHeightPx = getLineHeightPx(sourceStyle, fontSizePx);
      const trackingPx = parsePx(sourceStyle.letterSpacing, 0);
      const fill = sourceStyle.color || "rgba(235,240,255,.95)";
      const maxLines = block.allowWrap
        ? Math.max(1, Math.floor((area.height - block.paddingPx * 2) / Math.max(lineHeightPx, 1)))
        : 1;

      const hostStyle = window.getComputedStyle(block.source);
      const { justifyX, justifyY } = resolveJustify(block.source, hostStyle);

      renderTextGroup(svg, {
        text,
        area: {
          left: area.left,
          top: area.top,
          width: area.width,
          height: area.height
        },
        fontSizePx,
        lineHeightPx,
        trackingPx,
        paddingPx: block.paddingPx,
        maxLines,
        justifyX,
        justifyY,
        allowWrap: block.allowWrap,
        breakLongWords: false,
        fill,
        opacity: 1
      });
    });
  }

  window.svgTextRenderer = {
    glyphForChar,
    tokenize,
    measureGlyphRunUnits,
    wrapTokensIntoLines,
    computePlacements,
    renderTextGroup,
    renderGlyphLabel
  };

  window.renderCardTextSvg = renderCardTextSvg;
  window.renderUiLabelsSvg = renderUiLabelsSvg;
  window.renderCardUiLabelsSvg = renderUiLabelsSvg;
})();
