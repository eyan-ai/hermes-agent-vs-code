const path = require("path");

function buildGeneratedDocumentCandidates(rawPath, {
  workspaceFolders = [],
  cwd = "",
  home = ""
} = {}) {
  const value = String(rawPath || "").trim();
  if (!value || /^file:/i.test(value)) return [];

  const candidates = [];
  const add = candidate => {
    if (!candidate) return;
    const normalized = path.normalize(candidate);
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  if (value.startsWith("~/")) {
    add(path.join(home, value.slice(2)));
    return candidates;
  }

  if (path.isAbsolute(value)) add(value);

  const relative = value.replace(/^[/\\]+/, "");
  const roots = [...workspaceFolders, cwd].filter(Boolean);
  for (const root of roots) add(path.resolve(root, relative));
  return candidates;
}

module.exports = { buildGeneratedDocumentCandidates };
