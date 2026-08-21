"use strict";

const assert = require("assert");
const {
  applyAutomaticTitle,
  applyManualTitle,
  hasUserText,
  inferTitleOrigin
} = require("../lib/session-title");

function test(name, run) {
  try {
    run();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("manual titles cannot be overwritten by later ACP titles", () => {
  const session = { title: "Original request", titleOrigin: "automatic" };
  assert.strictEqual(applyManualTitle(session, "My release notes"), true);
  assert.deepStrictEqual(session, { title: "My release notes", titleOrigin: "manual" });
  assert.strictEqual(applyAutomaticTitle(session, "Generated release summary"), false);
  assert.deepStrictEqual(session, { title: "My release notes", titleOrigin: "manual" });
});

test("meaningless Context titles do not replace the local request title", () => {
  for (const title of ["Context:", "Context: #7", " context:   #19 "]) {
    const session = { title: "优化这个东西", titleOrigin: "automatic" };
    assert.strictEqual(applyAutomaticTitle(session, title), false);
    assert.strictEqual(session.title, "优化这个东西");
  }
});

test("automatic titles require non-attachment user text", () => {
  const session = {
    title: "Untitled",
    titleOrigin: "automatic",
    messages: [{ role: "user", text: "", attachments: [{ name: "notes.md" }] }]
  };
  assert.strictEqual(hasUserText(session), false);
  assert.strictEqual(applyAutomaticTitle(session, "Context: #7"), false);
  assert.strictEqual(applyAutomaticTitle(session, "Generated context title"), false);
  assert.strictEqual(session.title, "Untitled");
});

test("valid ACP titles still update sessions that were not manually renamed", () => {
  const session = {
    title: "优化这个东西",
    titleOrigin: "automatic",
    messages: [{ role: "user", text: "优化这个东西" }]
  };
  assert.strictEqual(applyAutomaticTitle(session, "Hermes 插件文章优化"), true);
  assert.strictEqual(session.title, "Hermes 插件文章优化");
});

test("legacy request-derived titles remain eligible for valid automatic titles", () => {
  const session = {
    title: "Old request",
    messages: [{ role: "user", text: "Old request", command: "" }]
  };
  session.titleOrigin = inferTitleOrigin(session);
  assert.strictEqual(session.titleOrigin, "automatic");
  assert.strictEqual(applyAutomaticTitle(session, "Useful generated title"), true);
  assert.strictEqual(session.title, "Useful generated title");
});

test("legacy custom titles are conservatively migrated as manual", () => {
  const session = {
    title: "My saved release name",
    messages: [{ role: "user", text: "Summarize the release", command: "" }]
  };
  session.titleOrigin = inferTitleOrigin(session);
  assert.strictEqual(session.titleOrigin, "manual");
  assert.strictEqual(applyAutomaticTitle(session, "Generated release summary"), false);
  assert.strictEqual(session.title, "My saved release name");
});

test("legacy Context titles remain automatic so a later useful title can repair them", () => {
  const session = {
    title: "Context: #7",
    messages: [{ role: "user", text: "优化这个东西", command: "" }]
  };
  session.titleOrigin = inferTitleOrigin(session);
  assert.strictEqual(session.titleOrigin, "automatic");
  assert.strictEqual(applyAutomaticTitle(session, "Hermes 插件文章优化"), true);
  assert.strictEqual(session.title, "Hermes 插件文章优化");
});
