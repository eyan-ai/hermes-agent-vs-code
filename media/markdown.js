// Lightweight, dependency-free Markdown -> HTML for assistant answers.
// Whitelist output only: everything is escaped, then a few safe patterns are
// applied. No raw HTML ever reaches the DOM. Loaded before main.js.
(function () {
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char]));
  }

  function isDocumentPath(value) {
    const candidate = String(value || "").trim();
    if (!candidate || /^https?:\/\//i.test(candidate) || /[\r\n]/.test(candidate)) return false;
    const qualified = /^file:/i.test(candidate)
      || /^(?:~\/|\.{1,2}[\\/]|[\\/]|[A-Za-z]:[\\/])/.test(candidate)
      || /[\\/]/.test(candidate);
    return qualified && /\.[A-Za-z][A-Za-z0-9+_-]{0,15}$/.test(candidate);
  }

  function documentName(value) {
    const raw = String(value || "").replace(/[?#].*$/, "").replace(/[\\/]+$/, "");
    const name = raw.split(/[\\/]/).pop() || raw;
    try {
      return decodeURIComponent(name);
    } catch {
      return name;
    }
  }

  function documentLink(value, wrapCode = false) {
    const candidate = String(value || "").trim();
    const label = escapeHtml(documentName(candidate));
    const content = wrapCode ? `<code>${label}</code>` : label;
    return `<a class="generated-doc-link" href="#" data-doc-path="${encodeURIComponent(candidate)}" title="${escapeHtml(candidate)}">${content}</a>`;
  }

  function inline(text) {
    const codeTokens = [];
    const tokenized = String(text).replace(/`([^`]+)`/g, (match, value) => {
      const token = `\u0000HERMES_CODE_${codeTokens.length}\u0000`;
      codeTokens.push(value);
      return token;
    });
    let out = escapeHtml(tokenized);
    out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    out = out.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    out = out.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, (match, label, url) => `<a href="#" data-href="${url.replace(/&amp;/g, "&")}">${label}</a>`);
    out = out.replace(/(^|\s)((?:~\/|\.{1,2}\/|\/)[^\s<>"']+\.[A-Za-z][A-Za-z0-9+_-]{0,15})(?=\s|$|[.,;:!?)]|$)/g, (match, prefix, path) => {
      return `${prefix}${documentLink(path)}`;
    });
    out = out.replace(/\u0000HERMES_CODE_(\d+)\u0000/g, (match, index) => {
      const value = codeTokens[Number(index)] || "";
      return isDocumentPath(value) ? documentLink(value, true) : `<code>${escapeHtml(value)}</code>`;
    });
    return out;
  }

  function render(markdown) {
    const lines = String(markdown || "").split("\n");
    const out = [];
    let paragraph = [];
    let code = null;
    let list = null;
    let table = null;

    const flushParagraph = () => {
      if (paragraph.length) {
        out.push(`<p>${paragraph.map(inline).join("<br>")}</p>`);
        paragraph = [];
      }
    };
    const flushList = () => {
      if (!list) return;
      const tag = list.ordered ? "ol" : "ul";
      out.push(`<${tag}>${list.items.join("")}</${tag}>`);
      list = null;
    };
    const flushTable = () => {
      if (!table) return;
      const rows = table.rows.map(row => `<tr>${row.map(cell => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("");
      out.push(`<div class="table-wrap"><table><thead><tr>${table.header.map(cell => `<th>${inline(cell)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`);
      table = null;
    };
    const isTableRow = line => /^\s*\|.*\|\s*$/.test(line) && line.includes("|");
    const splitRow = line => line.trim().replace(/^\||\|$/g, "").split("|").map(cell => cell.trim());
    const isTableDivider = line => /^\s*\|?[\s:|-]+\|[\s:|-]+\|?$/.test(line) && line.includes("-");
    const flushAll = () => {
      flushParagraph();
      flushList();
      flushTable();
      if (code !== null) {
        out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = null;
      }
    };

    for (const raw of lines) {
      const line = raw.replace(/\r$/, "");

      if (code !== null) {
        if (/^\s*```/.test(line)) {
          out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
          code = null;
        } else {
          code.push(line);
        }
        continue;
      }
      if (/^\s*```/.test(line)) {
        flushParagraph();
        flushList();
        flushTable();
        code = [];
        continue;
      }

      if (isTableDivider(line) && table) {
        // The `|---|---|` separator between header and body.
        continue;
      }
      if (isTableRow(line)) {
        if (!table) {
          flushParagraph();
          flushList();
          table = { header: splitRow(line), rows: [] };
        } else {
          table.rows.push(splitRow(line));
        }
        continue;
      }
      if (table) {
        flushTable();
      }

      const heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        flushParagraph();
        flushList();
        const level = heading[1].length;
        out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
        continue;
      }

      const quote = line.match(/^>\s?(.*)$/);
      if (quote) {
        flushParagraph();
        flushList();
        out.push(`<blockquote>${inline(quote[1])}</blockquote>`);
        continue;
      }

      const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
      if (bullet) {
        flushParagraph();
        if (!list || list.ordered) {
          flushList();
          list = { ordered: false, items: [] };
        }
        list.items.push(`<li>${inline(bullet[1])}</li>`);
        continue;
      }

      const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (numbered) {
        flushParagraph();
        if (!list || !list.ordered) {
          flushList();
          list = { ordered: true, items: [] };
        }
        list.items.push(`<li>${inline(numbered[1])}</li>`);
        continue;
      }

      if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
        flushParagraph();
        flushList();
        out.push("<hr>");
        continue;
      }

      if (/^\s*$/.test(line)) {
        flushParagraph();
        flushList();
        flushTable();
        continue;
      }

      paragraph.push(line);
    }
    flushAll();
    return out.join("");
  }

  window.markdownToHtml = render;
})();
