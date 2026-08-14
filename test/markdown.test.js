"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "media", "markdown.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context);
const render = context.window.markdownToHtml;

function test(name, run) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("inline document paths with Chinese characters and spaces become links", () => {
  const documentPath = "/DataMatrix/Ontology 场景地图.html";
  const html = render(`\`${documentPath}\``);
  assert.match(html, /class="generated-doc-link"/);
  assert.ok(html.includes(`data-doc-path="${encodeURIComponent(documentPath)}"`));
  assert.ok(html.includes("<code>Ontology 场景地图.html</code>"));
});

test("plain document paths remain clickable", () => {
  const documentPath = "/workspace/output.md";
  const html = render(`Generated ${documentPath}`);
  assert.ok(html.includes(`data-doc-path="${encodeURIComponent(documentPath)}"`));
});

test("ordinary inline code does not become a document link", () => {
  const html = render("Run `npm run test` to verify.");
  assert.doesNotMatch(html, /data-doc-path=/);
  assert.match(html, /<code>npm run test<\/code>/);
});

test("a bare filename is not treated as a resolvable document path", () => {
  const html = render("Open `Agent评测指引_备份 copy.md` to compare the result.");
  assert.doesNotMatch(html, /data-doc-path=/);
  assert.match(html, /<code>Agent评测指引_备份 copy\.md<\/code>/);
});

test("external links keep their existing handler", () => {
  const html = render("[Open](https://example.com/file.md)");
  assert.match(html, /data-href="https:\/\/example\.com\/file\.md"/);
  assert.doesNotMatch(html, /data-doc-path=/);
});
