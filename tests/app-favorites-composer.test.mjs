import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const appSource = await readFile(new URL("../prototype/app.js", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../prototype/styles.css", import.meta.url), "utf8");

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
    classList: createClassList(),
    addEventListener() {},
    close() {
      this.open = false;
    },
    focus() {},
    querySelector() {
      return null;
    },
  };
}

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
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

function createHarness({ persistedState, share, canShare, backend } = {}) {
  const storageKey = "question-wall-prototype-v1";
  const localStorage = createStorage(
    persistedState ? { [storageKey]: JSON.stringify(persistedState) } : {},
  );
  const sessionStorage = createStorage();
  const app = createElement("app");
  const dialog = createElement("note-dialog");
  const dialogContent = createElement("note-dialog-content");
  const toast = createElement("toast");
  const elements = new Map([
    ["app", app],
    ["note-dialog", dialog],
    ["note-dialog-content", dialogContent],
    ["toast", toast],
  ]);
  const location = {
    href: "https://example.test/prototype/?from=test#wall",
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
  const document = {
    cookie: "",
    visibilityState: "visible",
    activeElement: null,
    body: { appendChild() {} },
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
  const navigator = {
    clipboard: { async writeText() {} },
    ...(share ? { share } : {}),
    ...(canShare ? { canShare } : {}),
  };
  const sandbox = {
    QuestionWallBackend: backend || { enabled: false, experienceMode: false },
    localStorage,
    sessionStorage,
    document,
    navigator,
    location,
    history,
    URL,
    performance: { now: () => 1000 },
    crypto: { randomUUID: () => "session-12345678" },
    console: { error() {}, warn() {} },
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
  return { sandbox, app, toast };
}

function evaluateJson(sandbox, expression) {
  return JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, sandbox));
}

function assertTextareaInsideComposer(html, textareaId) {
  const composerStart = html.indexOf('<div class="composer-note ');
  const textareaStart = html.indexOf("<textarea", composerStart);
  const composerEnd = html.indexOf("</div>", composerStart);

  assert.notEqual(composerStart, -1, "composer note should be rendered");
  assert.ok(textareaStart > composerStart, "textarea should start inside the composer note");
  assert.ok(composerEnd > textareaStart, "textarea should close before the composer note");
  assert.match(html.slice(textareaStart, composerEnd), new RegExp(`id="${textareaId}"`));
}

test("question and answer forms edit directly inside the note without preview sections", () => {
  const { sandbox } = createHarness();
  const askHtml = vm.runInContext(
    `persisted.role = "adult";
     persisted.drafts.ask.adult = "你今天最开心的事情是什么？";
     renderAskPage()`,
    sandbox,
  );
  const answerHtml = vm.runInContext(
    `ui.selectedQuestionId = "pool-02";
     persisted.drafts.answer[ui.selectedQuestionId] = "可以先为下一步做好准备。";
     renderAnswerPage()`,
    sandbox,
  );

  assert.doesNotMatch(askHtml, /preview-section/);
  assert.doesNotMatch(answerHtml, /preview-section/);
  assertTextareaInsideComposer(askHtml, "ask-body");
  assertTextareaInsideComposer(answerHtml, "answer-body");
  assert.match(askHtml, /class="composer-note-field composer-note-question"/);
  assert.match(answerHtml, /data-note-kind="answer"/);
});

test("mobile composer keeps a 16px native input while scaling the full editing layer", () => {
  assert.match(stylesSource, /\.composer-note-input \{[\s\S]*?font-size: 16px;/);
  assert.match(
    stylesSource,
    /data-note-kind="answer"\]\[data-note-density="dense"\][\s\S]*?--composer-input-scale: 0\.71875;[\s\S]*?width: 139\.131%;/,
  );
  assert.doesNotMatch(stylesSource, /\.composer-note-input\[data-note-density\][^{]*\{[^}]*font-size: 16px/);
});

test("favorite add/remove cycles stay duplicate-free and saved notes are newest first", () => {
  const { sandbox } = createHarness({
    persistedState: {
      role: "adult",
      favorites: ["note-01", "note-01", "note-02"],
      myQuestions: [],
      myAnswers: [],
      notifications: [],
      drafts: { ask: { adult: "", child: "" }, answer: {} },
    },
  });

  assert.deepEqual(evaluateJson(sandbox, "persisted.favorites"), ["note-01", "note-02"]);
  assert.equal(vm.runInContext('toggleFavorite("note-01")', sandbox), false);
  assert.equal(vm.runInContext('toggleFavorite("note-01")', sandbox), true);
  assert.deepEqual(evaluateJson(sandbox, "persisted.favorites"), ["note-02", "note-01"]);
  assert.equal(evaluateJson(sandbox, 'persisted.favorites.filter((id) => id === "note-01").length'), 1);
  assert.deepEqual(evaluateJson(sandbox, "getFavoriteNotes().map((note) => note.id)"), [
    "note-01",
    "note-02",
  ]);
});

test("recommendation quick favorite action exposes its pressed state", () => {
  const { sandbox } = createHarness();
  const initialHtml = vm.runInContext("renderRecommendationPage()", sandbox);

  assert.match(
    initialHtml,
    /data-action="toggle-favorite"[\s\S]*?data-note-id="note-01"[\s\S]*?aria-pressed="false"/,
  );

  vm.runInContext('toggleFavorite("note-01")', sandbox);
  const favoriteHtml = vm.runInContext("renderRecommendationPage()", sandbox);
  assert.match(
    favoriteHtml,
    /data-action="toggle-favorite"[\s\S]*?data-note-id="note-01"[\s\S]*?aria-pressed="true"/,
  );
});

test("a remembered completed feed does not claim that the public wall is empty", () => {
  const { sandbox } = createHarness();
  const completedHtml = vm.runInContext(
    `getAvailableNotes().forEach((note) => seenNoteIds.add(note.id));
     ui.recommendationIds = [];
     ui.recommendationIndex = -1;
     renderRecommendationPage()`,
    sandbox,
  );

  assert.match(completedHtml, /这一批便签看完了/);
  assert.doesNotMatch(completedHtml, /暂时没有公开便签/);
});

test("canvas text helpers wrap graphemes and shrink text to fit", () => {
  const { sandbox } = createHarness();
  sandbox.__canvasContext = {
    font: "",
    measureText(value) {
      return { width: Array.from(value).length * 10 };
    },
  };

  assert.deepEqual(evaluateJson(sandbox, 'wrapCanvasText(__canvasContext, "甲乙丙\\n丁", 20)'), [
    "甲乙",
    "丙",
    "丁",
  ]);
  assert.deepEqual(
    evaluateJson(sandbox, 'fitCanvasText(__canvasContext, "甲乙", 100, 28, 20, 10, 700)'),
    { lines: ["甲乙"], fontSize: 18, lineHeight: 28 },
  );
  const multiline = evaluateJson(
    sandbox,
    'fitCanvasText(__canvasContext, "一\\n二\\n三\\n四\\n五\\n六\\n七\\n八", 100, 80, 20, 10, 600)',
  );
  assert.match(multiline.lines.join(""), /八/);
  assert.doesNotMatch(multiline.lines.join(""), /…/);
});

test("sharing prefers a generated note image when file sharing is supported", async () => {
  const shareCalls = [];
  const canShareCalls = [];
  const { sandbox } = createHarness({
    async share(payload) {
      shareCalls.push(payload);
    },
    canShare(payload) {
      canShareCalls.push(payload);
      return true;
    },
  });
  class TestFile {
    constructor(parts, name, options) {
      this.parts = parts;
      this.name = name;
      this.type = options.type;
    }
  }
  const imageBlob = { type: "image/png", marker: "generated-note-image" };
  sandbox.File = TestFile;
  sandbox.__imageBlob = imageBlob;
  vm.runInContext("createNoteImageBlob = async () => __imageBlob", sandbox);

  await vm.runInContext('prepareNoteForShare("note-01")', sandbox);
  await vm.runInContext('shareNote("note-01")', sandbox);

  assert.equal(canShareCalls.length, 1);
  assert.equal(shareCalls.length, 1);
  assert.equal(shareCalls[0].files.length, 1);
  assert.equal(shareCalls[0].files[0].parts[0], imageBlob);
  assert.equal(shareCalls[0].files[0].type, "image/png");
  assert.match(shareCalls[0].files[0].name, /^问问墙-.*\.png$/);
  assert.match(shareCalls[0].text, /https:\/\/example\.test\/prototype\/\?note=note-01#wall/);
  assert.equal("url" in shareCalls[0], false);
});

test("an unprepared share click only prepares the note and asks for a second click", async () => {
  const shareCalls = [];
  const { sandbox, toast } = createHarness({
    async share(payload) {
      shareCalls.push(payload);
    },
    canShare() {
      return true;
    },
  });
  sandbox.__firstClickImageBlob = { type: "image/png", marker: "first-click-image" };
  vm.runInContext("createNoteImageBlob = async () => __firstClickImageBlob", sandbox);

  await vm.runInContext('shareNote("note-01")', sandbox);

  assert.equal(shareCalls.length, 0);
  assert.match(toast.textContent, /便签已准备好，请再点一次分享/);
});

test("favorite snapshots remain available after a note leaves the live content window", () => {
  const archivedNote = {
    id: "archived-note-101",
    questionId: "archived-question-101",
    answerId: "archived-answer-101",
    direction: "child_to_adult",
    question: "这张旧便签还在吗？",
    answer: "收藏以后，它会保存在当前浏览器里。",
    createdAt: "2026-01-01T00:00:00.000Z",
    featured: false,
    answerCount: 1,
  };
  const { sandbox } = createHarness({
    persistedState: {
      role: "adult",
      favorites: [archivedNote.id],
      favoriteNotes: [archivedNote],
      myQuestions: [],
      myAnswers: [],
      notifications: [],
      drafts: { ask: { adult: "", child: "" }, answer: {} },
    },
  });

  assert.deepEqual(evaluateJson(sandbox, "getFavoriteNotes().map((note) => note.id)"), [
    archivedNote.id,
  ]);
  assert.equal(vm.runInContext('findViewableNote("archived-note-101").answer', sandbox), archivedNote.answer);
  assert.match(vm.runInContext('ui.mineTab = "favorites"; renderMineTabContent()', sandbox), /这张旧便签还在吗/);
});

test("legacy id-only favorites are hydrated from the public wall", async () => {
  const archivedNote = {
    id: "archived-note-101",
    questionId: "archived-question-101",
    answerId: "archived-answer-101",
    direction: "child_to_adult",
    question: "旧版本收藏还能回来吗？",
    answer: "公开内容会在升级后补回本地快照。",
    createdAt: "2026-01-01T00:00:00.000Z",
    featured: false,
    answerCount: 1,
  };
  const { sandbox } = createHarness({
    persistedState: {
      role: "adult",
      favorites: [archivedNote.id],
      myQuestions: [],
      myAnswers: [],
      notifications: [],
      drafts: { ask: { adult: "", child: "" }, answer: {} },
    },
    backend: {
      enabled: true,
      experienceMode: false,
      async loadNotes(ids) {
        return ids.includes(archivedNote.id) ? [archivedNote] : [];
      },
    },
  });

  await vm.runInContext("remoteAvailable = true; remoteNotes = []; reconcileRemoteFavorites()", sandbox);

  assert.deepEqual(evaluateJson(sandbox, "persisted.favoriteNotes.map((note) => note.id)"), [
    archivedNote.id,
  ]);
  assert.deepEqual(evaluateJson(sandbox, "getFavoriteNotes().map((note) => note.id)"), [
    archivedNote.id,
  ]);
});

test("publicly removed favorites are invalidated but network failures preserve their snapshot", async () => {
  const archivedNote = {
    id: "removed-note-101",
    questionId: "removed-question-101",
    answerId: "removed-answer-101",
    direction: "adult_to_child",
    question: "这张便签还公开吗？",
    answer: "公开视图会决定它是否继续显示。",
    createdAt: "2026-01-01T00:00:00.000Z",
    featured: false,
    answerCount: 1,
  };
  const persistedState = {
    role: "adult",
    favorites: [archivedNote.id],
    favoriteNotes: [archivedNote],
    myQuestions: [],
    myAnswers: [],
    notifications: [],
    drafts: { ask: { adult: "", child: "" }, answer: {} },
  };
  const removedHarness = createHarness({
    persistedState,
    backend: { enabled: true, experienceMode: false, async loadNotes() { return []; } },
  });
  await vm.runInContext(
    "remoteAvailable = true; remoteNotes = []; reconcileRemoteFavorites()",
    removedHarness.sandbox,
  );
  assert.deepEqual(evaluateJson(removedHarness.sandbox, "persisted.favorites"), []);

  const offlineHarness = createHarness({
    persistedState,
    backend: {
      enabled: true,
      experienceMode: false,
      async loadNotes() {
        throw new Error("offline");
      },
    },
  });
  await vm.runInContext(
    "remoteAvailable = true; remoteNotes = []; reconcileRemoteFavorites()",
    offlineHarness.sandbox,
  );
  assert.deepEqual(evaluateJson(offlineHarness.sandbox, "persisted.favorites"), [archivedNote.id]);
  assert.deepEqual(evaluateJson(offlineHarness.sandbox, "persisted.favoriteNotes.map((note) => note.id)"), [
    archivedNote.id,
  ]);
  assert.deepEqual(evaluateJson(offlineHarness.sandbox, "getFavoriteNotes()"), []);
});

test("emergency lockdown hides favorites without deleting their ids or snapshots", async () => {
  const savedNote = {
    id: "lockdown-note-101",
    questionId: "lockdown-question-101",
    answerId: "lockdown-answer-101",
    direction: "child_to_adult",
    question: "紧急关闭时收藏还会保留吗？",
    answer: "恢复开放后仍然可以在当前浏览器里看到。",
    createdAt: "2026-01-02T00:00:00.000Z",
    featured: false,
    answerCount: 1,
  };
  const { sandbox } = createHarness({
    persistedState: {
      role: "adult",
      favorites: [savedNote.id],
      favoriteNotes: [savedNote],
      myQuestions: [],
      myAnswers: [],
      notifications: [],
      drafts: { ask: { adult: "", child: "" }, answer: {} },
    },
    backend: {
      enabled: true,
      experienceMode: false,
      async loadNotes() {
        return [];
      },
    },
  });

  await vm.runInContext(
    `runtimeStatus.emergencyLockdown = true;
     remoteAvailable = true;
     remoteNotes = [];
     reconcileRemoteFavorites()`,
    sandbox,
  );

  assert.deepEqual(evaluateJson(sandbox, "persisted.favorites"), [savedNote.id]);
  assert.deepEqual(evaluateJson(sandbox, "persisted.favoriteNotes.map((note) => note.id)"), [
    savedNote.id,
  ]);
  assert.deepEqual(evaluateJson(sandbox, "getFavoriteNotes()"), []);
});

test("file share rejection falls through to native text sharing", async () => {
  const shareCalls = [];
  const { sandbox } = createHarness({
    async share(payload) {
      shareCalls.push(payload);
      if (payload.files) {
        const error = new Error("File sharing is not available now.");
        error.name = "DataError";
        throw error;
      }
    },
    canShare() {
      return true;
    },
  });
  class TestFile {
    constructor(parts, name, options) {
      this.parts = parts;
      this.name = name;
      this.type = options.type;
    }
  }
  sandbox.File = TestFile;
  sandbox.__imageBlob = { type: "image/png" };
  vm.runInContext("createNoteImageBlob = async () => __imageBlob", sandbox);

  await vm.runInContext('prepareNoteForShare("note-01")', sandbox);
  await vm.runInContext('shareNote("note-01")', sandbox);

  assert.equal(shareCalls.length, 1);
  assert.equal(shareCalls[0].files.length, 1);

  await vm.runInContext('shareNote("note-01")', sandbox);

  assert.equal(shareCalls.length, 2);
  assert.equal("files" in shareCalls[1], false);
  assert.equal(shareCalls[1].url, "https://example.test/prototype/?note=note-01#wall");
});

test("a prepared share calls native sharing synchronously without revalidating or rerendering", async () => {
  const note = {
    id: "ready-note-101",
    questionId: "ready-question-101",
    answerId: "ready-answer-101",
    direction: "adult_to_child",
    question: "准备好以后可以立刻分享吗？",
    answer: "点击时直接打开系统分享面板。",
    createdAt: "2026-01-03T00:00:00.000Z",
    featured: false,
    answerCount: 1,
  };
  const calls = { loadNote: 0, createImage: 0 };
  const shareCalls = [];
  let finishSharing;
  const nativeSharePending = new Promise((resolve) => {
    finishSharing = resolve;
  });
  const { sandbox } = createHarness({
    async share(payload) {
      shareCalls.push(payload);
      return nativeSharePending;
    },
    canShare() {
      return true;
    },
    backend: {
      enabled: true,
      experienceMode: false,
      async loadNote(id) {
        calls.loadNote += 1;
        return id === note.id ? note : null;
      },
    },
  });
  class TestFile {
    constructor(parts, name, options) {
      this.parts = parts;
      this.name = name;
      this.type = options.type;
    }
  }
  sandbox.File = TestFile;
  sandbox.__readyImageBlob = { type: "image/png", marker: "prepared-image" };
  sandbox.__sharePreparationCalls = calls;
  vm.runInContext(
    `createNoteImageBlob = async () => {
       __sharePreparationCalls.createImage += 1;
       return __readyImageBlob;
     };
     remoteAvailable = true;
     remoteNotes = [${JSON.stringify(note)}]`,
    sandbox,
  );

  await vm.runInContext(`prepareNoteForShare(${JSON.stringify(note.id)})`, sandbox);
  calls.loadNote = 0;
  calls.createImage = 0;

  const sharing = vm.runInContext(`shareNote(${JSON.stringify(note.id)})`, sandbox);

  assert.equal(shareCalls.length, 1, "native share must start before shareNote yields");
  assert.equal(calls.loadNote, 0);
  assert.equal(calls.createImage, 0);
  assert.equal(shareCalls[0].files.length, 1);
  assert.equal(shareCalls[0].files[0].parts[0], sandbox.__readyImageBlob);

  finishSharing();
  await sharing;
});

test("offline invalidation keeps a prepared image for reuse after public revalidation", async () => {
  const note = {
    id: "revalidated-note-101",
    questionId: "revalidated-question-101",
    answerId: "revalidated-answer-101",
    direction: "child_to_adult",
    question: "断网恢复后还要重新生成图片吗？",
    answer: "内容没变时会复用已经准备好的图片。",
    createdAt: "2026-01-04T00:00:00.000Z",
    featured: false,
    answerCount: 1,
  };
  const calls = { loadNote: 0, createImage: 0 };
  const shareCalls = [];
  const { sandbox } = createHarness({
    async share(payload) {
      shareCalls.push(payload);
    },
    canShare() {
      return true;
    },
    backend: {
      enabled: true,
      experienceMode: false,
      async loadNote(id) {
        calls.loadNote += 1;
        return id === note.id ? note : null;
      },
    },
  });
  class TestFile {
    constructor(parts, name, options) {
      this.parts = parts;
      this.name = name;
      this.type = options.type;
    }
  }
  const imageBlob = { type: "image/png", marker: "reusable-image" };
  sandbox.File = TestFile;
  sandbox.__reusableImageBlob = imageBlob;
  sandbox.__offlineReuseCalls = calls;
  vm.runInContext(
    `createNoteImageBlob = async () => {
       __offlineReuseCalls.createImage += 1;
       return __reusableImageBlob;
     };
     remoteAvailable = true;
     remoteNotes = [${JSON.stringify(note)}]`,
    sandbox,
  );

  await vm.runInContext(`prepareNoteForShare(${JSON.stringify(note.id)})`, sandbox);
  calls.loadNote = 0;
  calls.createImage = 0;

  vm.runInContext('handleRemoteUnavailable(new Error("offline"))', sandbox);
  await vm.runInContext(`shareNote(${JSON.stringify(note.id)})`, sandbox);

  assert.equal(shareCalls.length, 0);
  assert.equal(vm.runInContext(`noteShareImageCache.has(${JSON.stringify(note.id)})`, sandbox), true);

  vm.runInContext("remoteAvailable = true", sandbox);
  await vm.runInContext(`prepareNoteForShare(${JSON.stringify(note.id)})`, sandbox);

  assert.equal(calls.loadNote, 1);
  assert.equal(calls.createImage, 0);

  await vm.runInContext(`shareNote(${JSON.stringify(note.id)})`, sandbox);

  assert.equal(shareCalls.length, 1);
  assert.equal(shareCalls[0].files.length, 1);
  assert.equal(shareCalls[0].files[0].parts[0], imageBlob);
});

test("a stale verification response cannot restore sharing after the wall goes offline", async () => {
  const note = {
    id: "racing-note-101",
    questionId: "racing-question-101",
    answerId: "racing-answer-101",
    direction: "adult_to_child",
    question: "请求途中断网以后还能分享吗？",
    answer: "旧请求的成功结果不能恢复公开分享状态。",
    createdAt: "2026-01-05T00:00:00.000Z",
    featured: false,
    answerCount: 1,
  };
  let resolveLoadNote;
  const pendingLoadNote = new Promise((resolve) => {
    resolveLoadNote = resolve;
  });
  const calls = { loadNote: 0 };
  const shareCalls = [];
  const { sandbox } = createHarness({
    async share(payload) {
      shareCalls.push(payload);
    },
    canShare() {
      return true;
    },
    backend: {
      enabled: true,
      experienceMode: false,
      async loadNote() {
        calls.loadNote += 1;
        return pendingLoadNote;
      },
    },
  });
  const imageBlob = { type: "image/png", marker: "cached-before-offline" };
  sandbox.__racingNote = note;
  sandbox.__racingImageBlob = imageBlob;
  vm.runInContext(
    `remoteAvailable = true;
     remoteNotes = [__racingNote];
     cachePreparedNoteShareImage(__racingNote, __racingImageBlob)`,
    sandbox,
  );

  const preparation = vm.runInContext(
    `prepareNoteForShare(${JSON.stringify(note.id)})`,
    sandbox,
  );
  assert.equal(calls.loadNote, 1);

  vm.runInContext('handleRemoteUnavailable(new Error("offline"))', sandbox);
  resolveLoadNote(note);
  const result = await preparation;

  assert.equal(result.status, "unavailable");
  assert.equal(vm.runInContext(`getFreshVerifiedPublicNote(${JSON.stringify(note.id)})`, sandbox), null);
  assert.equal(vm.runInContext(`noteShareImageCache.has(${JSON.stringify(note.id)})`, sandbox), true);

  await vm.runInContext(`shareNote(${JSON.stringify(note.id)})`, sandbox);

  assert.equal(calls.loadNote, 1, "offline sharing must not start another verification request");
  assert.equal(shareCalls.length, 0);
  assert.equal(vm.runInContext(`noteShareImageCache.has(${JSON.stringify(note.id)})`, sandbox), true);
});

test("a verification started before lockdown stays stale after the wall recovers", async () => {
  const note = {
    id: "lockdown-race-note-101",
    questionId: "lockdown-race-question-101",
    answerId: "lockdown-race-answer-101",
    direction: "child_to_adult",
    question: "关闭前发出的请求能在恢复后继续生效吗？",
    answer: "恢复后的公开状态必须由新的校验结果决定。",
    createdAt: "2026-01-06T00:00:00.000Z",
    featured: false,
    answerCount: 1,
  };
  let resolveFirstLoad;
  const firstLoad = new Promise((resolve) => {
    resolveFirstLoad = resolve;
  });
  const calls = { loadNote: 0, createImage: 0 };
  const shareCalls = [];
  const { sandbox } = createHarness({
    async share(payload) {
      shareCalls.push(payload);
    },
    canShare() {
      return true;
    },
    backend: {
      enabled: true,
      experienceMode: false,
      async loadNote() {
        calls.loadNote += 1;
        return calls.loadNote === 1 ? firstLoad : null;
      },
    },
  });
  sandbox.__lockdownRaceCalls = calls;
  vm.runInContext(
    `createNoteImageBlob = async () => {
       __lockdownRaceCalls.createImage += 1;
       return { type: "image/png" };
     };
     remoteAvailable = true`,
    sandbox,
  );

  const preparation = vm.runInContext(
    `prepareNoteForShare(${JSON.stringify(note.id)})`,
    sandbox,
  );
  assert.equal(calls.loadNote, 1);

  vm.runInContext(
    `runtimeStatus.emergencyLockdown = true;
     clearPublicNoteVerification();
     runtimeStatus.emergencyLockdown = false;
     remoteAvailable = true;
     replacePublicNoteVerification([])`,
    sandbox,
  );
  resolveFirstLoad(note);
  const result = await preparation;

  assert.equal(result.status, "unavailable");
  assert.equal(calls.createImage, 0);
  assert.equal(vm.runInContext(`getFreshVerifiedPublicNote(${JSON.stringify(note.id)})`, sandbox), null);

  await vm.runInContext(`shareNote(${JSON.stringify(note.id)})`, sandbox);

  assert.equal(calls.loadNote, 2, "sharing after recovery must use a new verification request");
  assert.equal(shareCalls.length, 0);
});
