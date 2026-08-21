(function exposeModelPicker(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.HermesModelPicker = api;
}(typeof globalThis !== "undefined" ? globalThis : this, () => {
  "use strict";

  function filterModels(models, query) {
    const source = Array.isArray(models) ? models : [];
    const needle = String(query || "").trim().toLocaleLowerCase();
    if (!needle) return source.slice();
    return source.filter(model => [model?.name, model?.id, model?.description]
      .map(value => String(value || ""))
      .join(" ")
      .toLocaleLowerCase()
      .includes(needle));
  }

  function nextSelectableIndex(models, currentIndex, delta) {
    const source = Array.isArray(models) ? models : [];
    if (!source.length || !source.some(model => !model?.unavailable)) return -1;
    const direction = delta < 0 ? -1 : 1;
    let index = Number.isInteger(currentIndex)
      ? currentIndex
      : (direction > 0 ? -1 : 0);
    for (let count = 0; count < source.length; count += 1) {
      index = (index + direction + source.length) % source.length;
      if (!source[index]?.unavailable) return index;
    }
    return -1;
  }

  function calculateOverlayPlacement(input) {
    const triggerRect = input?.triggerRect || {};
    const margin = Math.max(0, Number(input?.margin) || 0);
    const viewportWidth = Math.max(0, Number(input?.viewportWidth) || 0);
    const viewportHeight = Math.max(0, Number(input?.viewportHeight) || 0);
    const contentHeight = Math.max(0, Number(input?.contentHeight) || 0);
    const maxListHeight = Math.max(0, Number(input?.maxListHeight) || 0);
    const top = Number(triggerRect.top) || 0;
    const bottom = Number(triggerRect.bottom) || 0;
    const desiredHeight = Math.min(contentHeight, maxListHeight);
    const spaceBelow = Math.max(0, viewportHeight - margin - bottom);
    const spaceAbove = Math.max(0, top - margin);
    const direction = desiredHeight <= spaceBelow
      ? "down"
      : desiredHeight <= spaceAbove
        ? "up"
        : spaceBelow >= spaceAbove ? "down" : "up";
    const selectedSpace = direction === "down" ? spaceBelow : spaceAbove;
    const maxHeight = Math.max(0, Math.min(desiredHeight, selectedSpace));
    const availableWidth = Math.max(0, viewportWidth - margin * 2);
    const width = Math.min(Math.max(0, Number(triggerRect.width) || 0), availableWidth);
    const minimumLeft = margin;
    const maximumLeft = Math.max(minimumLeft, viewportWidth - margin - width);
    const requestedLeft = Number(triggerRect.left) || 0;
    const left = Math.min(Math.max(requestedLeft, minimumLeft), maximumLeft);

    return {
      direction,
      top: direction === "down" ? bottom : top - maxHeight,
      left,
      width,
      maxHeight
    };
  }

  return {
    calculateOverlayPlacement,
    filterModels,
    nextSelectableIndex
  };
}));
