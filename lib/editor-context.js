"use strict";

const path = require("path");

function isInstance(value, Type) {
  return typeof Type === "function" && value instanceof Type;
}

function uriString(uri) {
  return uri && typeof uri.toString === "function" ? uri.toString() : String(uri || "");
}

function sameUri(left, right) {
  return Boolean(left && right && uriString(left) === uriString(right));
}

function tabUri(vscode, tab) {
  const input = tab?.input;
  if (isInstance(input, vscode.TabInputText) || isInstance(input, vscode.TabInputCustom) || isInstance(input, vscode.TabInputNotebook)) {
    return input.uri;
  }
  if (isInstance(input, vscode.TabInputTextDiff) || isInstance(input, vscode.TabInputNotebookDiff)) {
    return input.modified;
  }
  return undefined;
}

function resolveActiveEditorSurface(vscode, isHermesTab = () => false) {
  const tab = vscode.window.tabGroups?.activeTabGroup?.activeTab;
  if (tab && isHermesTab(tab)) return { kind: "hermes" };
  const input = tab?.input;
  if (isInstance(input, vscode.TabInputCustom)) {
    return { kind: "custom", uri: input.uri, viewType: input.viewType };
  }
  const textUri = isInstance(input, vscode.TabInputText)
    ? input.uri
    : isInstance(input, vscode.TabInputTextDiff)
      ? input.modified
      : undefined;
  if (textUri) {
    const editor = [vscode.window.activeTextEditor, ...(vscode.window.visibleTextEditors || [])]
      .find(candidate => candidate && sameUri(candidate.document?.uri, textUri));
    return editor ? { kind: "text", editor } : { kind: "text-document", uri: textUri };
  }
  const active = vscode.window.activeTextEditor;
  if (active?.document?.uri && active.document.uri.scheme !== "hermes-diff-preview") {
    return { kind: "text", editor: active };
  }
  return { kind: "none" };
}

function contextName(uri) {
  return path.basename(uri?.fsPath || uri?.path || uriString(uri)) || "document";
}

function contextPath(vscode, uri) {
  try {
    return vscode.workspace.asRelativePath(uri, false);
  } catch {
    return uri?.fsPath || uri?.path || uriString(uri);
  }
}

function customSurfaceKey(surface) {
  return `${String(surface?.viewType || "")}\0${uriString(surface?.uri)}`;
}

function baseContext(vscode, uri, extra = {}) {
  return {
    type: "file",
    name: contextName(uri),
    path: contextPath(vscode, uri),
    uri: uriString(uri),
    ...extra
  };
}

function textDocumentContext(vscode, document, extra = {}) {
  const context = baseContext(vscode, document.uri, {
    documentVersion: document.version,
    isDirty: Boolean(document.isDirty),
    ...extra
  });
  if (document.isDirty && typeof document.getText === "function") {
    context.text = document.getText();
    context.textKind = "document";
  }
  return context;
}

function textEditorContext(vscode, editor) {
  const document = editor?.document;
  if (!document?.uri || document.isClosed) return null;
  const selection = editor.selection;
  if (selection && !selection.isEmpty) {
    return {
      ...baseContext(vscode, document.uri),
      type: "selection",
      name: `Selected lines ${selection.start.line + 1}-${selection.end.line + 1}`,
      text: document.getText(selection),
      textKind: "selection",
      selectionAccuracy: "exact",
      documentVersion: document.version,
      isDirty: Boolean(document.isDirty)
    };
  }
  return textDocumentContext(vscode, document);
}

function normalizeProviderContext(vscode, raw, surface) {
  if (!raw || typeof raw !== "object") return null;
  const uri = raw.uri || surface.uri;
  if (!uri) return null;
  const common = baseContext(vscode, uri, {
    viewType: String(raw.viewType || surface.viewType || ""),
    languageId: raw.languageId,
    documentVersion: raw.documentVersion,
    isDirty: raw.isDirty === undefined ? undefined : Boolean(raw.isDirty)
  });
  const selection = raw.selection;
  if (selection && typeof selection.text === "string" && selection.text.length) {
    const startLine = Number.isInteger(selection.startLine) ? selection.startLine : undefined;
    const endLine = Number.isInteger(selection.endLine) ? selection.endLine : startLine;
    return {
      ...common,
      type: "selection",
      name: startLine === undefined
        ? `Selected content from ${contextName(uri)}`
        : `Selected lines ${startLine + 1}-${endLine + 1}`,
      text: selection.text,
      textKind: "selection",
      selectionAccuracy: selection.accuracy === "rendered-text" ? "rendered-text" : "exact",
      startOffset: selection.startOffset,
      endOffset: selection.endOffset,
      startLine,
      endLine
    };
  }
  if (typeof raw.documentText === "string") {
    common.text = raw.documentText;
    common.textKind = "document";
  }
  return common;
}

class EditorContextResolver {
  constructor({ vscode, isHermesTab, onDidChange, onError }) {
    this.vscode = vscode;
    this.isHermesTab = isHermesTab || (() => false);
    this.onDidChange = onDidChange || (() => {});
    this.onError = onError || (() => {});
    this.context = null;
    this.requestId = 0;
    this.providerKey = "";
    this.providerSubscription = undefined;
    this.providerSurface = undefined;
    this.customSelection = undefined;
  }

  current() {
    return this.context;
  }

  async refresh(options = {}) {
    const requestId = ++this.requestId;
    let surface = resolveActiveEditorSurface(this.vscode, this.isHermesTab);
    if (surface.kind === "hermes") {
      if (!options.providerSurface) return this.context;
      surface = options.providerSurface;
    }
    if (surface.kind === "none") {
      this.customSelection = undefined;
      this._switchProvider("", undefined);
      return this._publish(requestId, null);
    }
    if (surface.kind === "text") {
      this.customSelection = undefined;
      this._switchProvider("", undefined);
      return this._publish(requestId, textEditorContext(this.vscode, surface.editor));
    }
    if (surface.kind === "text-document") {
      this.customSelection = undefined;
      this._switchProvider("", undefined);
      if (this.context?.uri === uriString(surface.uri)) return this.context;
      const context = await this._fallbackTextDocument(surface);
      return this._publish(requestId, context);
    }
    return this._resolveCustom(surface, requestId, options);
  }

  async _resolveCustom(surface, requestId, options = {}) {
    const surfaceKey = customSurfaceKey(surface);
    if (this.customSelection?.key !== surfaceKey) this.customSelection = undefined;
    let providerInfo;
    try {
      providerInfo = await this._findProvider(surface.viewType);
    } catch (error) {
      this.onError(error);
    }
    if (requestId !== this.requestId) return this.context;
    this._switchProvider(providerInfo?.key || "", providerInfo?.provider, surface);
    if (providerInfo?.provider) {
      try {
        const raw = await providerInfo.provider.getActiveContext({ viewType: surface.viewType, uri: surface.uri });
        if (requestId !== this.requestId) return this.context;
        const normalized = normalizeProviderContext(this.vscode, raw, surface);
        const hasSelectionField = raw
          && Object.prototype.hasOwnProperty.call(raw, "selection");
        const selectionExplicitlyCleared = hasSelectionField && raw.selection === null;
        const selectionClearedByProviderEvent = Boolean(
          options.providerEvent
          && normalized
          && !hasSelectionField
        );
        const selectionCleared = selectionExplicitlyCleared || selectionClearedByProviderEvent;
        if (selectionCleared) this.customSelection = undefined;
        if (normalized?.type === "selection") {
          this.customSelection = { key: surfaceKey, context: normalized };
          return this._publish(requestId, normalized);
        }
        if (!selectionCleared && this.customSelection?.key === surfaceKey) {
          return this._publish(requestId, this.customSelection.context);
        }
        if (normalized) return this._publish(requestId, normalized);
      } catch (error) {
        this.onError(error);
      }
    }
    const fallback = await this._fallbackTextDocument(surface);
    if (requestId !== this.requestId) return this.context;
    if (this.customSelection?.key === surfaceKey) {
      return this._publish(requestId, this.customSelection.context);
    }
    return this._publish(requestId, fallback || baseContext(this.vscode, surface.uri, { viewType: surface.viewType }));
  }

  async _findProvider(viewType) {
    const owner = (this.vscode.extensions?.all || []).find(extension =>
      extension.packageJSON?.contributes?.customEditors?.some(editor => editor.viewType === viewType)
    );
    if (!owner) return undefined;
    const exports = owner.isActive ? owner.exports : await owner.activate();
    const provider = exports?.customEditorContextProvider;
    if (provider?.apiVersion !== 1 || typeof provider.getActiveContext !== "function") return undefined;
    return { key: `${owner.id || "extension"}:${viewType}`, provider };
  }

  async _fallbackTextDocument(surface) {
    try {
      const document = await this.vscode.workspace.openTextDocument(surface.uri);
      if (!document || typeof document.getText !== "function") return null;
      return textDocumentContext(this.vscode, document, { viewType: surface.viewType });
    } catch (error) {
      this.onError(error);
      return null;
    }
  }

  _switchProvider(key, provider, surface) {
    this.providerSurface = surface;
    if (this.providerKey === key) return;
    this.providerSubscription?.dispose?.();
    this.providerSubscription = undefined;
    this.providerKey = key;
    if (provider && typeof provider.onDidChangeActiveContext === "function") {
      this.providerSubscription = provider.onDidChangeActiveContext(() => {
        void this.refresh({ providerSurface: this.providerSurface, providerEvent: true });
      });
    }
  }

  _publish(requestId, context) {
    if (requestId !== this.requestId) return this.context;
    this.context = context;
    this.onDidChange(context);
    return context;
  }

  clearIfUri(uri) {
    if (!this.context || this.context.uri !== uriString(uri)) return false;
    this.requestId += 1;
    this._switchProvider("", undefined);
    this.customSelection = undefined;
    this.context = null;
    this.onDidChange(null);
    return true;
  }

  handleTabsChanged(event) {
    for (const tab of event?.closed || []) {
      const uri = tabUri(this.vscode, tab);
      if (uri) this.clearIfUri(uri);
    }
    return this.refresh();
  }

  dispose() {
    this.requestId += 1;
    this.providerSubscription?.dispose?.();
    this.providerSubscription = undefined;
    this.providerKey = "";
    this.providerSurface = undefined;
    this.customSelection = undefined;
  }
}

module.exports = {
  EditorContextResolver,
  normalizeProviderContext,
  resolveActiveEditorSurface,
  textDocumentContext,
  textEditorContext
};
