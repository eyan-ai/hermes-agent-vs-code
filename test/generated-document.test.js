"use strict";

const assert = require("assert");
const path = require("path");
const { buildGeneratedDocumentCandidates } = require("../lib/generated-document");

function test(name, run) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("absolute paths stay first and also gain a workspace-relative fallback", () => {
  const candidates = buildGeneratedDocumentCandidates("/DataMatrix/output.md", {
    workspaceFolders: ["/workspace"],
    cwd: "/workspace",
    home: "/home/user"
  });
  assert.deepStrictEqual(candidates, [
    path.normalize("/DataMatrix/output.md"),
    path.normalize("/workspace/DataMatrix/output.md")
  ]);
});

test("relative paths are resolved against every workspace root before cwd", () => {
  const candidates = buildGeneratedDocumentCandidates("docs/output file.md", {
    workspaceFolders: ["/workspace/a", "/workspace/b"],
    cwd: "/fallback",
    home: "/home/user"
  });
  assert.deepStrictEqual(candidates, [
    path.normalize("/workspace/a/docs/output file.md"),
    path.normalize("/workspace/b/docs/output file.md"),
    path.normalize("/fallback/docs/output file.md")
  ]);
});

test("home-relative paths expand without workspace fallbacks", () => {
  const candidates = buildGeneratedDocumentCandidates("~/notes/output.md", {
    workspaceFolders: ["/workspace"],
    cwd: "/workspace",
    home: "/home/user"
  });
  assert.deepStrictEqual(candidates, [path.normalize("/home/user/notes/output.md")]);
});

