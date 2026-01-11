  // Template scalar fields
  function bindTplScalar(cardRoot, role, key){
    const root = resolveCardRoot(cardRoot);
    const input = root ? $role(root, role) : null;
    if (!input) return;
    input.onchange = () => {
      const tpl = getNode(registry.roots.template);
      if (!tpl || tpl.type !== "Template") return;
      tpl[key] = Math.max(1, +input.value || 1);
      setNode(registry.roots.template, tpl);
      clearCaches();
      refreshAllUI(root);
      renderOnce(root);
    };
  }
  function initTemplateEvents(cardRoot){
    const root = resolveCardRoot(cardRoot);
    bindTplScalar(root, "tpl-tile-w", "tileW");
    bindTplScalar(root, "tpl-tile-h", "tileH");
    bindTplScalar(root, "tpl-grid-w", "gridW");
    bindTplScalar(root, "tpl-grid-h", "gridH");

    // Recipe template selection
    const recipeSelect = root ? $role(root, "recipe-template-select") : null;
    if (recipeSelect){
      recipeSelect.onchange = () => {
        const rec = getNode(registry.roots.recipe);
        if (!rec || rec.type !== "Recipe") return;
        rec.template = recipeSelect.value;
        setNode(registry.roots.recipe, rec);
        clearCaches();
        refreshAllUI(root);
        renderOnce(root);
      };
    }
  }
