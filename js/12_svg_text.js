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
    const align = config.align || "left";
    const breakLongWords = Boolean(config.breakLongWords);

    const area = config.area;
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

    for (let li = 0; li < lines.length; li++){
      const lineKeys = lines[li];
      const m = measureGlyphRunUnits(lineKeys, trackingUnits);
      const lineWidthPx = m.width * scale;
      const bottom = area.top + paddingPx + lineHeightPx * (li + 1);

      let xStart;
      if (align === "center"){
        xStart = area.left + (area.width - lineWidthPx) / 2;
      } else if (align === "right"){
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
      align: options.align || "center",
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

  function readBaseMetric(style, prop, fallback){
    const raw = style.getPropertyValue(prop);
    if (!raw) return fallback;
    const num = Number.parseFloat(raw);
    return Number.isFinite(num) ? num : fallback;
  }

  function getLineHeightPx(style, fontSizePx){
    const raw = style.lineHeight;
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) return parsed;
    return fontSizePx * 1.2;
  }

  function renderCardUiLabelsSvg(cardRoot){
    const card = cardRoot?.classList?.contains("tcg-card")
      ? cardRoot
      : cardRoot?.querySelector?.(".tcg-card");
    if (!card) return;

    const scope = card.closest(".card-shell") || card;
    const labelHosts = scope.querySelectorAll(".svg-label-host");
    if (!labelHosts.length) return;

    labelHosts.forEach((host) => {
      const source = host.querySelector(".card-text-source");
      const svg = host.querySelector(".ui-label-svg");
      if (!source || !svg) return;

      const text = String(source.textContent || "").trim();
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const hostStyle = window.getComputedStyle(host);
      const sourceStyle = window.getComputedStyle(source);
      const paddingPx = Math.min(
        parsePx(hostStyle.paddingLeft, 0),
        parsePx(hostStyle.paddingRight, 0),
        parsePx(hostStyle.paddingTop, 0),
        parsePx(hostStyle.paddingBottom, 0)
      );
      const align = host.dataset.uiAlign
        || ((host.tagName === "BUTTON" || host.classList.contains("card-control") || host.classList.contains("card-header__status")) ? "center" : "left");

      renderGlyphLabel(
        svg,
        text,
        sourceStyle,
        { width: rect.width, height: rect.height },
        {
          paddingPx,
          align,
          allowWrap: host.dataset.uiWrap === "true"
        }
      );
    });
  }

  function renderCardTextSvg(cardRoot){
    const card = cardRoot?.classList?.contains("tcg-card")
      ? cardRoot
      : cardRoot?.querySelector?.(".tcg-card");
    if (!card) return;

    const layoutTarget = card.querySelector(".tcg-card__layout") || card;
    const layoutStyle = window.getComputedStyle(layoutTarget);
    const content = card.querySelector(".tcg-card__content");
    if (!content) return;

    const layer = content.querySelector(".card-text-svg-layer");
    if (!layer) return;

    const cardScale = readBaseMetric(layoutStyle, "--card-scale", 1);
    const headerX = readBaseMetric(layoutStyle, "--header-x", 0);
    const headerY = readBaseMetric(layoutStyle, "--header-y", 0);
    const headerW = readBaseMetric(layoutStyle, "--header-w", 0);
    const headerH = readBaseMetric(layoutStyle, "--header-h", 0);
    const headerPadX = readBaseMetric(layoutStyle, "--header-pad-x", 0);
    const headerPadY = readBaseMetric(layoutStyle, "--header-pad-y", 0);

    const panelsX = readBaseMetric(layoutStyle, "--panels-x", 0);
    const panelsY = readBaseMetric(layoutStyle, "--panels-y", 0);
    const panelsW = readBaseMetric(layoutStyle, "--panels-w", 0);
    const panelsH = readBaseMetric(layoutStyle, "--panels-h", 0);
    const sectionGap = readBaseMetric(layoutStyle, "--section-gap", 0);

    const sectionHeight = Math.max(0, (panelsH - sectionGap * 2) / 3);

    const blocks = [
      {
        source: card.querySelector('[data-role="card-title"]'),
        svg: card.querySelector('[data-role="card-title-svg"]'),
        area: {
          left: headerX + headerPadX,
          top: headerY + headerPadY,
          width: Math.max(0, headerW - headerPadX * 2),
          height: Math.max(0, headerH - headerPadY * 2)
        },
        paddingPx: 0,
        allowWrap: false
      },
      {
        source: card.querySelector('[data-role="card-text"]'),
        svg: card.querySelector('[data-role="card-text-svg"]'),
        area: {
          left: panelsX,
          top: panelsY + sectionHeight + sectionGap,
          width: Math.max(0, panelsW),
          height: Math.max(0, sectionHeight)
        },
        paddingPx: 12 * cardScale,
        allowWrap: true
      },
      {
        source: card.querySelector('[data-role="card-task"]'),
        svg: card.querySelector('[data-role="card-task-svg"]'),
        area: {
          left: panelsX,
          top: panelsY + (sectionHeight + sectionGap) * 2,
          width: Math.max(0, panelsW),
          height: Math.max(0, sectionHeight)
        },
        paddingPx: 12 * cardScale,
        allowWrap: true
      }
    ];

    blocks.forEach((block) => {
      const svg = block.svg;
      if (!svg) return;
      const text = block.source ? String(block.source.textContent || "").trim() : "";

      svg.style.position = "absolute";
      svg.style.left = `${block.area.left}px`;
      svg.style.top = `${block.area.top}px`;
      svg.style.width = `${block.area.width}px`;
      svg.style.height = `${block.area.height}px`;
      svg.setAttribute("width", `${block.area.width}`);
      svg.setAttribute("height", `${block.area.height}`);
      svg.setAttribute("viewBox", `0 0 ${block.area.width} ${block.area.height}`);

      clearGlyphLayers(svg);

      if (!text) return;

      const sourceStyle = block.source ? window.getComputedStyle(block.source) : layoutStyle;
      const baseFontSize = parsePx(sourceStyle.fontSize, 14);
      const baseLineHeight = getLineHeightPx(sourceStyle, baseFontSize);
      const baseLetterSpacing = parsePx(sourceStyle.letterSpacing, 0);
      const fill = sourceStyle.color || "rgba(235,240,255,.95)";

      const fontSizePx = baseFontSize * cardScale;
      const lineHeightPx = baseLineHeight * cardScale;
      const trackingPx = baseLetterSpacing * cardScale;
      const maxLines = Math.max(1, Math.floor((block.area.height - block.paddingPx * 2) / lineHeightPx));

      renderTextGroup(svg, {
        text,
        area: {
          left: 0,
          top: 0,
          width: block.area.width,
          height: block.area.height
        },
        fontSizePx,
        lineHeightPx,
        trackingPx,
        paddingPx: block.paddingPx,
        maxLines,
        align: "left",
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
  window.renderCardUiLabelsSvg = renderCardUiLabelsSvg;
})();
