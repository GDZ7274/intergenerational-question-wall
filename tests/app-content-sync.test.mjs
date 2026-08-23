import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const appSource = await readFile(new URL("../prototype/app.js", import.meta.url), "utf8");

function createClassList() {
  const values = new Set();
  return {
    add(...names) {
      names.forEach((name) => values.add(name));
    },
    remove(...names) {
      names.forEach((name) => values.delete(name));
    },
    toggle(name, force) {
      if (force === true) values.add(name);
      else if (force === false) values.delete(name);
      else if (values.has(name)) values.delete(name);
      else values.add(name);
    },
    contains(name) {
      return values.has(name);
    },
  };
}

function createElement(id) {
  return {
    id,
    innerHTML: "",
    textContent: "",
    open: false,
    scrollTop: 0,
    dataset: {},
    classList: createClassList(),
    addEventListener() {},
    appendChild() {},
    close() {
      this.open = false;
    },
    showModal() {
      this.open = true;
    },
    querySelector() {
      return null;
    },
    focus() {},
  };
}

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function createHarness(backend) {
  const app = createElement("app");
  const dialog = createElement("note-dialog");
  const dialogContent = createElement("note-dialog-content");
  const participationDialog = createElement("participation-dialog");
  const participationDialogContent = createElement("participation-dialog-content");
  const shareDialog = createElement("share-dialog");
  const shareDialogContent = createElement("share-dialog-content");
  const toast = createElement("toast");
  const elements = new Map([
    ["app", app],
    ["note-dialog", dialog],
    ["note-dialog-content", dialogContent],
    ["participation-dialog", participationDialog],
    ["participation-dialog-content", participationDialogContent],
    ["share-dialog", shareDialog],
    ["share-dialog-content", shareDialogContent],
    ["toast", toast],
  ]);
  const location = {
    href: "https://example.test/prototype/#wall",
    hash: "#wall",
  };
  const history = {
    state: null,
    pushState(state, _title, hash) {
      this.state = state;
      location.hash = hash;
    },
    replaceState(state, _title, hash) {
      this.state = state;
      location.hash = hash;
    },
    back() {},
  };
  const localStorage = createStorage();
  const warnings = [];
  const document = {
    cookie: "",
    visibilityState: "visible",
    activeElement: null,
    body: { appendChild() {}, classList: createClassList() },
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelector() {
      return null;
    },
    addEventListener() {},
    createElement() {
      return createElement("");
    },
    createRange() {
      return { selectNodeContents() {} };
    },
  };
  const sandbox = {
    QuestionWallBackend: backend,
    localStorage,
    sessionStorage: createStorage(),
    document,
    navigator: { clipboard: { async writeText() {} } },
    location,
    history,
    URL,
    performance: { now: () => 1000 },
    crypto: { randomUUID: () => "session-content-sync" },
    console: {
      error() {},
      warn(...args) {
        warnings.push(args);
      },
    },
    confirm: () => true,
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    scrollTo() {},
    addEventListener() {},
    getSelection() {
      return { removeAllRanges() {}, addRange() {} };
    },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(appSource, sandbox);
  return {
    sandbox,
    app,
    dialog,
    dialogContent,
    shareDialog,
    shareDialogContent,
    localStorage,
    warnings,
  };
}

function textNote(id, overrides = {}) {
  return {
    id,
    kind: "text",
    questionId: `question-${id}`,
    answerId: `answer-${id}`,
    photoNoteId: null,
    direction: "adult_to_child",
    question: `${id} 的问题`,
    answer: `${id} 的回答`,
    createdAt: "2026-08-23T10:00:00.000Z",
    featured: false,
    answerCount: 1,
    mediaUrl: null,
    imageUrl: null,
    altText: "",
    mediaWidth: null,
    mediaHeight: null,
    ...overrides,
  };
}

function runtimeStatus() {
  return {
    schemaVersion: 4,
    submissionsPaused: false,
    readOnly: false,
    emergencyLockdown: false,
    publicMessage: "",
    photoNotesEnabled: true,
  };
}

function evaluateJson(sandbox, expression) {
  return JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, sandbox));
}

test("runtime sync fetches content with unchanged switches and renders only for a content diff", async () => {
  const calls = { status: 0, content: 0, render: 0 };
  const original = textNote("note-sync-1");
  const added = textNote("note-sync-2", { createdAt: "2026-08-23T11:00:00.000Z" });
  let content = { notes: [original], questions: [] };
  const backend = {
    enabled: true,
    experienceMode: false,
    async loadRuntimeStatus() {
      calls.status += 1;
      return runtimeStatus();
    },
    async loadContent() {
      calls.content += 1;
      return content;
    },
  };
  const { sandbox } = createHarness(backend);
  sandbox.__original = original;
  sandbox.__renderCalls = calls;
  vm.runInContext(
    `runtimeStatus = ${JSON.stringify(runtimeStatus())};
     remoteNotes = [__original];
     remoteQuestions = [];
     remoteAvailable = true;
     remoteLoadFailed = false;
     replacePublicNoteVerification(remoteNotes);
     ui.recommendationComplete = true;
     render = () => { __renderCalls.render += 1; };`,
    sandbox,
  );

  await vm.runInContext("syncRuntimeStatus()", sandbox);
  assert.equal(calls.status, 1);
  assert.equal(calls.content, 1, "content must still refresh when runtime switches are unchanged");
  assert.equal(calls.render, 0, "an identical snapshot must not trigger a render");
  assert.equal(
    vm.runInContext("ui.recommendationComplete", sandbox),
    true,
    "a skipped render must not silently mutate the visible feed state",
  );

  content = { notes: [original, added], questions: [] };
  await vm.runInContext("syncRuntimeStatus()", sandbox);
  assert.equal(calls.status, 2);
  assert.equal(calls.content, 2);
  assert.equal(calls.render, 1, "newly published content should trigger exactly one render");
  assert.deepEqual(evaluateJson(sandbox, "remoteNotes.map((note) => note.id)"), [
    "note-sync-1",
    "note-sync-2",
  ]);
});

test("routine content removal purges wall history, the open detail, and the share sheet", async () => {
  const removed = textNote("note-remove-1");
  const survivor = textNote("note-remove-2");
  const backend = {
    enabled: true,
    experienceMode: false,
    async loadContent() {
      return { notes: [survivor], questions: [] };
    },
  };
  const { sandbox, dialog, dialogContent, shareDialog, localStorage } = createHarness(backend);
  sandbox.__removed = removed;
  sandbox.__survivor = survivor;
  vm.runInContext(
    `remoteNotes = [__removed, __survivor];
     remoteQuestions = [];
     remoteAvailable = true;
     replacePublicNoteVerification(remoteNotes);
     recentViewedNoteIds.push(__removed.id, __survivor.id);
     saveRecentViewedNoteIds();
     ui.recommendationIds = [__survivor.id];
     ui.recommendationIndex = 0;
     dialog.open = true;
     dialog.dataset.noteId = __removed.id;
     dialogContent.innerHTML = "removed detail";
     shareDialog.open = true;
     shareDialog.dataset.noteId = __removed.id;
     noteShareImageCache.set(__removed.id, { contentKey: "old", blob: {} });`,
    sandbox,
  );

  assert.equal(await vm.runInContext("refreshRemoteContent()", sandbox), true);
  assert.deepEqual(evaluateJson(sandbox, "remoteNotes.map((note) => note.id)"), [survivor.id]);
  assert.deepEqual(evaluateJson(sandbox, "recentViewedNoteIds"), [survivor.id]);
  assert.deepEqual(evaluateJson(sandbox, "ui.recommendationIds"), [survivor.id]);
  assert.deepEqual(
    JSON.parse(localStorage.getItem("question-wall-recent-viewed-v1")),
    [survivor.id],
  );
  assert.equal(dialog.open, false);
  assert.equal(dialog.dataset.noteId, undefined);
  assert.equal(dialogContent.innerHTML, "");
  assert.equal(shareDialog.open, false);
  assert.equal(shareDialog.dataset.noteId, undefined);
  assert.equal(vm.runInContext(`noteShareImageCache.has(${JSON.stringify(removed.id)})`, sandbox), false);
  assert.equal(vm.runInContext(`findViewableNote(${JSON.stringify(removed.id)})`, sandbox), null);
});

test("a single-note missing verification performs the same complete purge", async () => {
  const removed = textNote("note-verify-missing");
  const survivor = textNote("note-verify-survivor");
  const backend = {
    enabled: true,
    experienceMode: false,
    async loadNote() {
      return null;
    },
  };
  const { sandbox, dialog, dialogContent, shareDialog } = createHarness(backend);
  sandbox.__removed = removed;
  sandbox.__survivor = survivor;
  vm.runInContext(
    `remoteNotes = [__removed, __survivor];
     remoteAvailable = true;
     replacePublicNoteVerification(remoteNotes);
     recentViewedNoteIds.push(__removed.id, __survivor.id);
     saveRecentViewedNoteIds();
     ui.recommendationIds = [__survivor.id];
     ui.recommendationIndex = 0;
     persisted.favorites = [__removed.id];
     persisted.favoriteNotes = [createFavoriteNoteSnapshot(__removed)];
     validatedFavoriteNoteIds.add(__removed.id);
     dialog.open = true;
     dialog.dataset.noteId = __removed.id;
     dialogContent.innerHTML = "removed detail";
     shareDialog.open = true;
     shareDialog.dataset.noteId = __removed.id;`,
    sandbox,
  );

  const result = await vm.runInContext(`verifyPublicNote(${JSON.stringify(removed.id)})`, sandbox);
  assert.equal(result.status, "missing");
  assert.deepEqual(evaluateJson(sandbox, "remoteNotes.map((note) => note.id)"), [survivor.id]);
  assert.deepEqual(evaluateJson(sandbox, "recentViewedNoteIds"), [survivor.id]);
  assert.deepEqual(evaluateJson(sandbox, "ui.recommendationIds"), [survivor.id]);
  assert.deepEqual(evaluateJson(sandbox, "persisted.favorites"), []);
  assert.deepEqual(evaluateJson(sandbox, "persisted.favoriteNotes"), []);
  assert.equal(dialog.open, false);
  assert.equal(dialogContent.innerHTML, "");
  assert.equal(shareDialog.open, false);
});

test("content refresh failure keeps the last verified snapshot available", async () => {
  const calls = { render: 0 };
  const existing = textNote("note-offline-snapshot");
  const backend = {
    enabled: true,
    experienceMode: false,
    async loadRuntimeStatus() {
      return runtimeStatus();
    },
    async loadContent() {
      throw new Error("temporary content outage");
    },
  };
  const { sandbox, warnings } = createHarness(backend);
  sandbox.__existing = existing;
  sandbox.__renderCalls = calls;
  vm.runInContext(
    `runtimeStatus = ${JSON.stringify(runtimeStatus())};
     remoteNotes = [__existing];
     remoteQuestions = [];
     remoteAvailable = true;
     remoteLoadFailed = false;
     replacePublicNoteVerification(remoteNotes);
     render = () => { __renderCalls.render += 1; };`,
    sandbox,
  );

  await vm.runInContext("syncRuntimeStatus()", sandbox);

  assert.equal(vm.runInContext("remoteAvailable", sandbox), true);
  assert.equal(vm.runInContext("remoteLoadFailed", sandbox), false);
  assert.deepEqual(evaluateJson(sandbox, "remoteNotes.map((note) => note.id)"), [existing.id]);
  assert.equal(vm.runInContext(`getFreshVerifiedPublicNote(${JSON.stringify(existing.id)}).id`, sandbox), existing.id);
  assert.equal(calls.render, 0);
  assert.equal(
    warnings.some((entry) => entry.some((value) => String(value).includes("keeping the last verified snapshot"))),
    true,
  );
});
