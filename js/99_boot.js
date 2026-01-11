  // ---------------------------
  // Boot
  // ---------------------------
  // ensureDefaults is now per-card (hydration happens in initCard)
  const packageSelect = document.querySelector('[data-role="package-select"]');
  if (packageSelect && typeof initPackageSelect === "function"){
    initPackageSelect(packageSelect);
  }
  const cardTemplate = document.getElementById("card-template");
  if (cardTemplate && cardTemplate.content && !cardTemplate.content.children.length){
    const seedCard = document.querySelector(".card-shell");
    if (seedCard){
      const templateCard = seedCard.cloneNode(true);
      templateCard.dataset.cardId = "";
      const title = templateCard.querySelector('[data-role="card-title"]');
      if (title) title.textContent = "";
      const panelHosts = templateCard.querySelectorAll(".card-adjacent, .card-adjacent [data-panel]");
      panelHosts.forEach((panelHost) => {
        panelHost.dataset.cardId = "";
      });
      cardTemplate.content.appendChild(templateCard);
    }
  }
  const IDEAL_CARD_WIDTH = 1000;
  const IDEAL_CARD_HEIGHT = 1400;
  const IDEAL_CARD_SCALE = 0.85;
  const MIN_CARD_ZOOM = 0.05;
  const MAX_CARD_ZOOM = 4.0;
  const getCardRoots = () => Array.from(document.querySelectorAll(".card-shell"));
  const cardLayoutObservers = new WeakMap();
  const cardControlObservers = new WeakMap();

  function getScrollContainer(element){
    let node = element ? element.parentElement : null;
    while (node && node !== document.body && node !== document.documentElement){
      const style = window.getComputedStyle(node);
      const overflow = `${style.overflowY} ${style.overflowX}`;
      if (/(auto|scroll|overlay)/.test(overflow)){
        return node;
      }
      node = node.parentElement;
    }
    return window;
  }

  function updateControlsPosition(card){
    if (!card) return;
    const controls = card.querySelector(".card-header__controls");
    if (!controls) return;
    const cardShell = card.closest(".card-shell") || card;
    const container = resolveCardContainer(card);
    const scrollContainer = getScrollContainer(card);
    const useViewport = scrollContainer === window;
    cardShell.dataset.controlsPosition = useViewport ? "viewport" : "container";
    const cardRect = card.getBoundingClientRect();
    const rect = controls.getBoundingClientRect();
    const containerRect = container && !useViewport ? container.getBoundingClientRect() : {left: 0, top: 0};
    const containerScrollLeft = container && !useViewport ? container.scrollLeft : 0;
    const containerScrollTop = container && !useViewport ? container.scrollTop : 0;
    const offsetX = useViewport ? 0 : containerRect.left - containerScrollLeft;
    const offsetY = useViewport ? 0 : containerRect.top - containerScrollTop;
    const styleTarget = cardShell.style;
    styleTarget.setProperty("--card-right", `${cardRect.right - offsetX}px`);
    styleTarget.setProperty("--card-top", `${cardRect.top - offsetY}px`);
    styleTarget.setProperty("--controls-right", `${rect.right - offsetX}px`);
    styleTarget.setProperty("--controls-top", `${rect.top - offsetY}px`);
    styleTarget.setProperty("--controls-height", `${rect.height}px`);
  }

  function getViewBoxDimensions(svg){
    if (svg && svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width){
      return svg.viewBox.baseVal;
    }
    const raw = svg ? svg.getAttribute("viewBox") : "";
    const parts = raw ? raw.split(/[,\s]+/).map(Number) : [];
    if (parts.length >= 4 && parts.every((value) => Number.isFinite(value))){
      return {x: parts[0], y: parts[1], width: parts[2], height: parts[3]};
    }
    return null;
  }

  function getLayoutBounds(svg, viewBox){
    if (!svg) return viewBox;
    const getRegionBounds = (region) => {
      if (!region) return null;
      const tag = region.tagName ? region.tagName.toLowerCase() : "";
      if (tag === "rect"){
        const x = Number(region.getAttribute("x"));
        const y = Number(region.getAttribute("y"));
        const w = Number(region.getAttribute("width"));
        const h = Number(region.getAttribute("height"));
        if (![x, y, w, h].every((value) => Number.isFinite(value))) return null;
        return {x, y, width: w, height: h};
      }
      if (typeof region.getBBox === "function"){
        const box = region.getBBox();
        if (![box.x, box.y, box.width, box.height].every((value) => Number.isFinite(value))) return null;
        return {x: box.x, y: box.y, width: box.width, height: box.height};
      }
      return null;
    };
    const safeRegion = svg.querySelector('[data-region="safe"]');
    const safeBounds = getRegionBounds(safeRegion);
    if (safeBounds) return safeBounds;
    const regions = Array.from(svg.querySelectorAll("[data-region]"));
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    regions.forEach((region) => {
      const bounds = getRegionBounds(region);
      if (!bounds) return;
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
    });
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)){
      return viewBox;
    }
    return {x: minX, y: minY, width: maxX - minX, height: maxY - minY};
  }

  function resolveCardContainer(card){
    return card ? (card.closest(".card-container") || document.documentElement) : document.documentElement;
  }

  function updateCardLayout(card){
  if (!card) return;
  const svg = card.querySelector(".card-layout");
  if (!svg) return;

  const viewBox = getViewBoxDimensions(svg);
  if (!viewBox || !viewBox.width || !viewBox.height) return;

  // --- Config (set by index controls via CSS variables on :root) ---
  const rootStyle = window.getComputedStyle(document.documentElement);

  const cfgStr = (name, fallback) => {
    const raw = rootStyle.getPropertyValue(name);
    const v = raw ? String(raw).trim() : "";
    return v || fallback;
  };

  const cfgNum = (name, fallback) => {
    const raw = rootStyle.getPropertyValue(name);
    if (!raw) return fallback;
    const v = Number(String(raw).trim().replace(/px$/i, ""));
    return Number.isFinite(v) ? v : fallback;
  };

  const cfgBool = (name, fallback) => {
    const raw = rootStyle.getPropertyValue(name);
    if (!raw) return fallback;
    const v = String(raw).trim().toLowerCase();
    if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
    if (v === "0" || v === "false" || v === "no" || v === "off") return false;
    return fallback;
  };

  const baseWidth = viewBox.width || IDEAL_CARD_WIDTH;
  const baseHeight = viewBox.height || IDEAL_CARD_HEIGHT;

  // Ideal design size (un-zoomed, in CSS px). Zoom is applied via CSS `zoom`,
  // so we *do not* bake zoom into the region variables below.
  const fallbackIdealW = baseWidth * IDEAL_CARD_SCALE;
  const fallbackIdealH = baseHeight * IDEAL_CARD_SCALE;

  const idealWidth = cfgNum("--cfg-card-ideal-w", fallbackIdealW);
  const idealHeight = cfgNum("--cfg-card-ideal-h", fallbackIdealH);

  const cfgMode = cfgStr("--cfg-card-zoom-mode", "auto"); // "auto" | "manual"
  const manualZoom = cfgNum("--cfg-card-zoom-manual", 1.0);

  const minZoom = cfgNum("--cfg-card-zoom-min", MIN_CARD_ZOOM);
  const maxZoom = cfgNum("--cfg-card-zoom-max", MAX_CARD_ZOOM);
  const maxAutoFit = cfgNum("--cfg-card-max-autofit", 1.0);
  const autoLayout = cfgBool("--cfg-card-auto-layout", true);

  // Prefer a per-card portal viewport if present.
  const portalStage = card.closest(".portal")?.querySelector(".portal-stage");
  const container = portalStage || resolveCardContainer(card);
  const rect = container.getBoundingClientRect();

  const viewportWidth = rect.width || idealWidth;
  const viewportHeight = rect.height || idealHeight;

  const autoZoomRaw = Math.min(
    viewportWidth / idealWidth,
    viewportHeight / idealHeight
  );
  const autoZoom = Math.min(
    Number.isFinite(autoZoomRaw) && autoZoomRaw > 0 ? autoZoomRaw : 1,
    maxAutoFit
  );

  const unclampedZoom = (cfgMode === "manual") ? manualZoom : autoZoom;
  const clampedZoom = Math.min(Math.max(unclampedZoom, minZoom), maxZoom);

  // Expose sizing vars used by CSS. Width/height are the *ideal* (unzoomed) size.
  card.style.setProperty("--visual-grid-unit", clampedZoom);
  card.style.setProperty("--card-ideal-w", `${idealWidth}px`);
  card.style.setProperty("--card-ideal-h", `${idealHeight}px`);
  card.style.setProperty("--card-zoom", clampedZoom);

  // Layout scale from viewBox units to ideal CSS px (unzoomed).
  const scaleX = idealWidth / viewBox.width;
  const scaleY = idealHeight / viewBox.height;
  const scale = Math.min(scaleX, scaleY);

  card.style.setProperty("--card-scale", scale);
  card.style.setProperty("--card-scale-x", scaleX);
  card.style.setProperty("--card-scale-y", scaleY);

  // Compute bounds in viewBox units (safe region, if present)
  const layoutBounds = autoLayout ? getLayoutBounds(svg, viewBox) : viewBox;

  const layoutContainer = card.querySelector(".tcg-card__layout");
  const layoutTarget = layoutContainer || card;

  const layoutX = layoutBounds ? layoutBounds.x * scaleX : 0;
  const layoutY = layoutBounds ? layoutBounds.y * scaleY : 0;
  const layoutW = layoutBounds ? layoutBounds.width * scaleX : idealWidth;
  const layoutH = layoutBounds ? layoutBounds.height * scaleY : idealHeight;

  layoutTarget.style.width = `${layoutW}px`;
  layoutTarget.style.height = `${layoutH}px`;
  layoutTarget.style.setProperty("--layout-x", `${layoutX}px`);
  layoutTarget.style.setProperty("--layout-y", `${layoutY}px`);
  layoutTarget.style.setProperty("--layout-w", `${layoutW}px`);
  layoutTarget.style.setProperty("--layout-h", `${layoutH}px`);
  layoutTarget.style.setProperty("--content-h", `${layoutH}px`);

  const content = card.querySelector(".tcg-card__content");
  if (content){
    content.style.width = `${layoutW}px`;
  }

  if (autoLayout){
    const regions = svg.querySelectorAll("[data-region]");
    regions.forEach((region) => {
      const name = region.dataset.region;
      if (!name) return;
      const x = Number(region.getAttribute("x")) || 0;
      const y = Number(region.getAttribute("y")) || 0;
      const w = Number(region.getAttribute("width")) || 0;
      const h = Number(region.getAttribute("height")) || 0;

      layoutTarget.style.setProperty(`--${name}-x`, `${x * scaleX}px`);
      layoutTarget.style.setProperty(`--${name}-y`, `${y * scaleY}px`);
      layoutTarget.style.setProperty(`--${name}-w`, `${w * scaleX}px`);
      layoutTarget.style.setProperty(`--${name}-h`, `${h * scaleY}px`);

      if (name === "section-gap" && h){
        layoutTarget.style.setProperty("--section-gap", `${h * scaleY}px`);
      }
      if (name === "image" && h){
        layoutTarget.style.setProperty("--image-h", `${h * scaleY}px`);
      }
      if (name === "header" && h){
        layoutTarget.style.setProperty("--header-h", `${h * scaleY}px`);
      }
      if (name === "panels" && h){
        layoutTarget.style.setProperty("--panels-h", `${h * scaleY}px`);
      }
      if (name === "footer" && h){
        layoutTarget.style.setProperty("--footer-h", `${h * scaleY}px`);
      }
    });
  }

  const baseScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  layoutTarget.style.setProperty("--card-padding", `${18 * baseScale}px`);
  layoutTarget.style.setProperty("--header-pad-x", `${14 * baseScale}px`);
  layoutTarget.style.setProperty("--header-pad-y", `${10 * baseScale}px`);
  layoutTarget.style.setProperty("--image-pad", `${10 * baseScale}px`);
  layoutTarget.style.setProperty("--image-gap", `${6 * baseScale}px`);

  updateControlsPosition(card);
}


  function initControlsPositioning(card){
    if (!card || cardControlObservers.has(card)) return;
    const handler = () => updateControlsPosition(card);
    window.addEventListener("scroll", handler, {passive: true});
    const scrollContainer = getScrollContainer(card);
    if (scrollContainer && scrollContainer !== window){
      scrollContainer.addEventListener("scroll", handler, {passive: true});
    }
    const container = resolveCardContainer(card);
    if (container){
      const observer = new ResizeObserver(handler);
      observer.observe(container);
      cardControlObservers.set(card, {handler, scrollContainer, observer});
    } else {
      cardControlObservers.set(card, {handler, scrollContainer, observer: null});
    }
  }

  function initCardLayout(root){
    const card = root.querySelector(".tcg-card");
    if (!card) return;
    updateCardLayout(card);
    initControlsPositioning(card);
    if (!cardLayoutObservers.has(card)){
      const observer = new ResizeObserver(() => updateCardLayout(card));
      const container = resolveCardContainer(card);
      observer.observe(container);
      cardLayoutObservers.set(card, observer);
    }
  }

  function updateCardIdentity(root, cardId){
    if (!root) return;
    const safeId = cardId || root.dataset.cardId || "";
    root.dataset.cardId = safeId;
    const title = $role(root, "card-title");
    if (title) title.textContent = `Sprite Editor Deck · ${safeId}`;
    const panelHosts = root.querySelectorAll(".card-adjacent, .card-adjacent [data-panel]");
    panelHosts.forEach((panelHost) => {
      panelHost.dataset.cardId = safeId;
    });
  }

  function getExistingCardIds(){
    return new Set(getCardRoots().map((root) => root.dataset.cardId).filter(Boolean));
  }

  function createUniqueCardId(){
  const baseId = (typeof getOrCreateCardId === "function") ? getOrCreateCardId() : "";
  const seed = (window.idManager && typeof window.idManager.nextCardId === "function") ? window.idManager.nextCardId() : (baseId || "card");
  const bytes = new Uint8Array(6);
  if (window.crypto && window.crypto.getRandomValues){
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i=0;i<bytes.length;i++) bytes[i] = Math.floor(Math.random()*256);
  }
  const rand = Array.from(bytes, (b) => b.toString(16).padStart(2,"0")).join("");
  const candidate = `${seed}-${rand}`;

  // Avoid collisions with cards already on the page or known in storage.
  const existing = getExistingCardIds();
  const stored = (window.cardStore && typeof window.cardStore.readCardIndexIds === "function")
    ? new Set(window.cardStore.readCardIndexIds())
    : new Set();
  if (!existing.has(candidate) && !stored.has(candidate)) return candidate;

  let i = 1;
  let c = `${candidate}-${i}`;
  while (existing.has(c) || stored.has(c)){
    i += 1;
    c = `${candidate}-${i}`;
  }
  return c;
}

function cloneCardTemplate(){
    const template = document.getElementById("card-template");
    if (template && template.content){
      const fragment = template.content.cloneNode(true);
      const root = fragment.querySelector(".card-shell");
      return {fragment, root};
    }
    const fallback = document.querySelector('.card-shell[data-card-template="true"]');
    if (fallback){
      const root = fallback.cloneNode(true);
      return {fragment: root, root};
    }
    return {fragment: null, root: null};
  }

  function initCard(root){
    if (!root) return;
    // Hydrate per-card registry from LocalStorage (or create defaults)
    if (window.cardStore && typeof window.cardStore.hydrateCardFromStorage === "function"){
      const loaded = window.cardStore.hydrateCardFromStorage(root);
      if (!loaded){
        ensureDefaults(root);
        if (typeof window.touchStorage === "function") window.touchStorage(root, true);
      }
    } else {
      ensureDefaults(root);
    }
    initCardLayout(root);
    initViewerGeometry(root);
    refreshAllUI(root);
    renderOnce(root);
    if (typeof initCoreEvents === "function"){
      initCoreEvents(root);
    }
    if (typeof initTemplateEvents === "function"){
      initTemplateEvents(root);
    }
    if (typeof initRectEvents === "function"){
      initRectEvents(root);
    }
    if (typeof initFrameEvents === "function"){
      initFrameEvents(root);
    }
    if (typeof initAssetEvents === "function"){
      initAssetEvents(root);
    }
    if (typeof initLayerEvents === "function"){
      initLayerEvents(root);
    }
    if (typeof initTaskEvents === "function"){
      initTaskEvents(root);
    }
    pushStateToPopout(false, root);
    initSupplementalPanelsForCard(root);
  }

  (function initCardIdentity(){
  const container = document.querySelector(".card-container");
  const storedIds = (window.cardStore && typeof window.cardStore.readCardIndexIds === "function")
    ? window.cardStore.readCardIndexIds()
    : [];

  // Ensure we have exactly the stored number of cards (if any), else keep 1.
  const desiredCount = storedIds.length ? storedIds.length : 1;
  if (container){
    while (getCardRoots().length < desiredCount){
      const {fragment, root} = cloneCardTemplate();
      if (!fragment || !root) break;
      container.appendChild(fragment);
    }
    // If storage has an index, drop any extra seed cards so the deck is stable across reloads.
    if (storedIds.length){
      const roots = getCardRoots();
      for (let i = roots.length - 1; i >= desiredCount; i -= 1){
        roots[i].remove();
      }
    }
  }

  // Assign ids (from storage, or generate) and ensure storage index is populated.
  getCardRoots().forEach((root, index) => {
    let cardId = root.dataset.cardId;
    if (storedIds.length){
      cardId = storedIds[index] || storedIds[storedIds.length - 1] || cardId;
    }
    if (!cardId){
      cardId = createUniqueCardId();
    }
    updateCardIdentity(root, cardId);
    if (window.cardStore && typeof window.cardStore.addCardIdToIndex === "function"){
      window.cardStore.addCardIdToIndex(cardId);
    }
  });

  // Expose a reconciler so other windows can add cards via storage events.
  window.reconcileCardsFromStorage = function reconcileCardsFromStorage(){
    const ids = (window.cardStore && typeof window.cardStore.readCardIndexIds === "function")
      ? window.cardStore.readCardIndexIds()
      : [];
    if (!ids.length) return;

    const existingById = new Map(getCardRoots().map((r) => [r.dataset.cardId, r]));
    if (!container) return;

    ids.forEach((id) => {
      if (existingById.has(id)) return;
      const {fragment, root} = cloneCardTemplate();
      if (!fragment || !root) return;
      container.appendChild(fragment);
      updateCardIdentity(root, id);
      initCard(root);
      refreshAllUI(root);
      renderOnce(root);
      if (typeof window.scheduleCardSave === "function") window.scheduleCardSave(root, true);
      updateAllCardLayouts();
    });
  };
})();

  const updateAllCardLayouts = () => {
    getCardRoots().forEach((root) => {
      const card = root.querySelector(".tcg-card");
      if (!card) return;
      updateCardLayout(card);
    });
  };

  window.addEventListener("resize", updateAllCardLayouts);

  getCardRoots().forEach((root) => initCard(root));

  // Initialise geometry controls with current defaults and set up apply handler
  function initViewerGeometry(root){
    const geometry = window.popoutGeometry;
    const elements = geometry ? geometry.getElements(root) : {
      width: $role(root, "popout-width"),
      height: $role(root, "popout-height"),
      left: $role(root, "popout-left"),
      top: $role(root, "popout-top")
    };
    const {width: wInput, height: hInput, left: xInput, top: yInput} = elements;
    if (wInput) wInput.value = defaultPopWidth;
    if (hInput) hInput.value = defaultPopHeight;
    if (xInput) xInput.value = defaultPopLeft;
    if (yInput) yInput.value = defaultPopTop;
    const applyBtn = $role(root, "popout-geometry-apply");
    if (applyBtn){
      applyBtn.onclick = () => {
        const current = geometry ? geometry.getElements(root) : elements;
        const readNumeric = (input) => {
          if (!input) return NaN;
          const raw = input.value;
          if (raw === "" || raw === null || raw === undefined) return NaN;
          const parsed = Number(raw);
          return Number.isFinite(parsed) ? parsed : NaN;
        };
        const wValue = readNumeric(current.width);
        const hValue = readNumeric(current.height);
        const xValue = readNumeric(current.left);
        const yValue = readNumeric(current.top);
        let w = Number.isFinite(wValue) ? Math.max(100, wValue) : defaultPopWidth;
        let h = Number.isFinite(hValue) ? Math.max(100, hValue) : defaultPopHeight;
        defaultPopWidth = w;
        defaultPopHeight = h;
        if (Number.isFinite(xValue)) defaultPopLeft = xValue;
        if (Number.isFinite(yValue)) defaultPopTop = yValue;
        // If a viewer window exists, send geometry updates.
        const popoutWin = (typeof window.getPopoutWindow === "function") ? window.getPopoutWindow(root) : null;
        if (popoutWin && !popoutWin.closed){
          const cmd = { cmd: "setWindowGeometry" };
          let hasField = false;
          if (Number.isFinite(wValue)){
            cmd.width = Math.max(100, wValue);
            hasField = true;
          }
          if (Number.isFinite(hValue)){
            cmd.height = Math.max(100, hValue);
            hasField = true;
          }
          if (Number.isFinite(xValue)){
            cmd.left = xValue;
            hasField = true;
          }
          if (Number.isFinite(yValue)){
            cmd.top = yValue;
            hasField = true;
          }
          if (hasField){
            sendCommandToViewer(cmd, root);
            log("Sent pop-out viewer geometry command.", "info", root);
          }
        }
      };
    }
  }

  // Keep merged JSON updated (lightweight)
  setInterval(() => {
    getCardRoots().forEach((root) => {
      const merged = (typeof resolveRoleElement === "function") ? resolveRoleElement(root, "merged-json") : $role(root, "merged-json");
      if (!merged) return;
      // If user is actively editing merged JSON, don't overwrite.
      const active = document.activeElement === merged;
      if (!active) merged.value = JSON.stringify(toManifestSnapshot(root), null, 2);
    });
  }, 800);

  // Push initial viewer state if open
  setInterval(() => {
    getCardRoots().forEach((root) => pushStateToPopout(false, root));
  }, 1200);

  // Toggle supplemental panels beside the card.
  function initSupplementalPanelsForCard(root){
    if (!root) return;
    const toggles = root.querySelectorAll("[data-panel-toggle]");
    if (!toggles.length) return;
    toggles.forEach((toggle) => {
      const target = toggle.getAttribute("data-panel-toggle");
      const panelScope = (typeof getPanelScope === "function")
        ? getPanelScope(root)
        : (root.querySelector(".card-adjacent") || root);
      const panel = panelScope ? panelScope.querySelector(`[data-panel="${target}"]`) : null;
      if (!panel) return;
      toggle.addEventListener("click", () => {
        const hidden = panel.classList.toggle("is-hidden");
        toggle.classList.toggle("is-active", !hidden);
        toggle.setAttribute("aria-pressed", hidden ? "false" : "true");
      });
    });
  }

  const newCardButton = document.querySelector('[data-role="btn-new-card"]');
  if (newCardButton){
    newCardButton.addEventListener("click", () => {
      const container = document.querySelector(".card-container");
      if (!container) return;
      const {fragment, root} = cloneCardTemplate();
      if (!fragment || !root) return;
      const cardId = createUniqueCardId();
      updateCardIdentity(root, cardId);
      if (window.cardStore && typeof window.cardStore.addCardIdToIndex === "function"){
        window.cardStore.addCardIdToIndex(cardId);
      }
      container.appendChild(fragment);
      const selectedManifest = (typeof getSelectedPackageManifest === "function")
        ? getSelectedPackageManifest()
        : null;
      if (selectedManifest && typeof applyPackageToRegistry === "function"){
        applyPackageToRegistry(selectedManifest, root);
      } else {
        ensureDefaults(root);
      }
      initCard(root);
      refreshAllUI(root);
      renderOnce(root);
      updateAllCardLayouts();
    });
  }
