import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const appSource = await readFile(new URL("../prototype/app.js", import.meta.url), "utf8");
const stylesSource = await readFile(new URL("../prototype/styles.css", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../prototype/index.html", import.meta.url), "utf8");

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
    click() {},
    close() {
      this.open = false;
    },
    showModal() {
      this.open = true;
    },
    remove() {},
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

function createHarness({
  persistedState,
  share,
  canShare,
  backend,
  localStorage: providedLocalStorage,
  sessionStorage: providedSessionStorage,
  cookie = "",
  href = "https://example.test/prototype/?from=test#wall",
  hash = "#wall",
  writeText,
} = {}) {
  const storageKey = "question-wall-prototype-v1";
  const localStorage = providedLocalStorage || createStorage(
    persistedState ? { [storageKey]: JSON.stringify(persistedState) } : {},
  );
  if (providedLocalStorage && persistedState) {
    localStorage.setItem(storageKey, JSON.stringify(persistedState));
  }
  const sessionStorage = providedSessionStorage || createStorage();
  const createdObjectUrls = [];
  const revokedObjectUrls = [];
  class TestURL extends URL {}
  TestURL.createObjectURL = (blob) => {
    const url = `blob:share-preview-${createdObjectUrls.length + 1}`;
    createdObjectUrls.push({ blob, url });
    return url;
  };
  TestURL.revokeObjectURL = (url) => {
    revokedObjectUrls.push(url);
  };
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
    href,
    hash,
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
    cookie,
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
  const navigator = {
    clipboard: { writeText: writeText || (async () => {}) },
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
    URL: TestURL,
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
  return {
    sandbox,
    app,
    dialog,
    dialogContent,
    participationDialog,
    participationDialogContent,
    shareDialog,
    shareDialogContent,
    toast,
    document,
    localStorage,
    sessionStorage,
    createdObjectUrls,
    revokedObjectUrls,
  };
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

test("brand and adult role wording change at the presentation layer only", () => {
  const { sandbox } = createHarness({
    persistedState: {
      role: "adult",
      favorites: [],
      myQuestions: [],
      myAnswers: [],
      notifications: [],
      drafts: { ask: { adult: "", child: "" }, answer: {} },
    },
  });

  assert.match(indexSource, /<title>【躺倒鸭】解鸭留言墙<\/title>/);
  assert.match(indexSource, /property="og:title"\s+content="【躺倒鸭】解鸭留言墙"/);
  assert.match(indexSource, /name="twitter:title"\s+content="【躺倒鸭】解鸭留言墙"/);
  assert.equal(vm.runInContext("persisted.role", sandbox), "adult");
  assert.equal(vm.runInContext('roleName("adult")', sandbox), "大朋友");
  assert.equal(vm.runInContext('directionMeta("adult_to_child").label', sandbox), "大朋友问 → 小朋友答");
  assert.equal(
    vm.runInContext("seedNotes[0].question", sandbox),
    "如果大人也要上一节课，你最想教他们什么？",
    "question copy authored with 大人 must not be mechanically rewritten",
  );

  const topbarHtml = vm.runInContext("renderTopbar()", sandbox);
  const identityHtml = vm.runInContext("renderIdentityPage()", sandbox);
  assert.match(topbarHtml, /<span class="brand-name">解鸭留言墙<\/span>/);
  assert.match(identityHtml, /我是大朋友/);
  assert.doesNotMatch(identityHtml, /我是大人/);
  assert.match(
    vm.runInContext("noteImageFilename(seedNotes[0])", sandbox),
    /^解鸭留言墙-.*\.png$/,
  );
});

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

test("landing uses the approved campaign artwork and concise mobile choices", () => {
  const { sandbox } = createHarness();
  const html = vm.runInContext("renderLandingPage()", sandbox);

  assert.match(html, /assets\/hero-overlay\.png/);
  assert.match(html, /assets\/landing-duck\.png/);
  assert.match(html, /今天想从哪件事开始？/);
  assert.match(html, /留一个问题/);
  assert.match(html, /回答一张便签/);
  assert.match(html, /下滑先看看/);
  assert.match(html, /<p class="landing-browse"/);
  assert.doesNotMatch(html, /data-action="landing-browse"/);
  assert.doesNotMatch(html, /把一个问题，交给另一代/);
});

test("the completed wall shows a replay prompt and keeps upward page-swipe history", () => {
  const { sandbox } = createHarness();
  vm.runInContext(
    `ui.route = "wall";
     ui.recommendationIds = ["note-01", "note-02"];
     ui.recommendationIndex = 1;
     ui.recommendationComplete = true;
     touchGestureStart = { kind: "viewer", x: 120, y: 120, axis: "y", startedAt: 900 };
     handleTouchEnd({ changedTouches: [{ clientX: 120, clientY: 190 }], cancelable: true, preventDefault() {} });`,
    sandbox,
  );

  assert.equal(vm.runInContext("ui.recommendationComplete", sandbox), false);
  assert.equal(vm.runInContext("ui.recommendationIndex", sandbox), 1);

  vm.runInContext("ui.recommendationComplete = true", sandbox);
  const endHtml = vm.runInContext("renderRecommendationEnd()", sandbox);
  assert.match(endHtml, /assets\/ending-duck\.gif/);
  assert.match(endHtml, /哎鸭，被你看完啦/);
  assert.match(endHtml, /single-note-gesture-icon-reversed/);
  assert.match(endHtml, /上滑回看上一张/);
  assert.doesNotMatch(endHtml, /recommendation-end-kicker/);
  assert.doesNotMatch(endHtml, /推荐/);
});

test("ordered viewed history survives a reload and restores the last public note", () => {
  const sharedLocalStorage = createStorage();
  const firstVisit = createHarness({ localStorage: sharedLocalStorage });
  const noteCount = vm.runInContext("seedNotes.length", firstVisit.sandbox);

  vm.runInContext("getCurrentRecommendation()", firstVisit.sandbox);
  for (let index = 0; index < noteCount; index += 1) {
    vm.runInContext("moveWall(1)", firstVisit.sandbox);
  }
  assert.equal(vm.runInContext("ui.recommendationComplete", firstVisit.sandbox), true);

  const reloaded = createHarness({
    localStorage: sharedLocalStorage,
    cookie: firstVisit.document.cookie,
  });
  const endHtml = vm.runInContext(
    "restoreRecentViewedHistory(); renderRecommendationPage()",
    reloaded.sandbox,
  );

  assert.match(endHtml, /上滑回看上一张/);
  vm.runInContext("moveWall(-1)", reloaded.sandbox);
  assert.equal(vm.runInContext("ui.recommendationComplete", reloaded.sandbox), false);
  assert.equal(
    vm.runInContext("getCurrentRecommendation().id", reloaded.sandbox),
    `note-${String(noteCount).padStart(2, "0")}`,
  );
});

test("replay history filters removed notes after remote content refresh", async () => {
  const sharedLocalStorage = createStorage();
  const firstVisit = createHarness({ localStorage: sharedLocalStorage });

  vm.runInContext("getCurrentRecommendation(); moveWall(1)", firstVisit.sandbox);
  const survivingNote = evaluateJson(firstVisit.sandbox, "seedNotes[0]");
  const reloaded = createHarness({
    localStorage: sharedLocalStorage,
    cookie: firstVisit.document.cookie,
    backend: {
      enabled: true,
      experienceMode: false,
      async loadContent() {
        return { notes: [survivingNote], questions: [] };
      },
    },
  });

  await vm.runInContext("refreshRemoteContent({ resetRecommendations: true })", reloaded.sandbox);
  const endHtml = vm.runInContext("renderRecommendationPage()", reloaded.sandbox);
  assert.match(endHtml, /上滑回看上一张/);

  vm.runInContext("moveWall(-1)", reloaded.sandbox);
  assert.equal(vm.runInContext("getCurrentRecommendation().id", reloaded.sandbox), survivingNote.id);
  assert.deepEqual(evaluateJson(reloaded.sandbox, "ui.recommendationIds"), [survivingNote.id]);
});

test("ordered replay history stays independent from the cookie no-repeat set", () => {
  const sharedLocalStorage = createStorage();
  const firstVisit = createHarness({ localStorage: sharedLocalStorage });
  const noteCount = vm.runInContext("seedNotes.length", firstVisit.sandbox);

  vm.runInContext("getCurrentRecommendation()", firstVisit.sandbox);
  for (let index = 0; index < noteCount; index += 1) {
    vm.runInContext("moveWall(1)", firstVisit.sandbox);
  }

  const historyWithoutCookie = createHarness({ localStorage: sharedLocalStorage });
  assert.equal(
    vm.runInContext("peekNextRecommendation().id", historyWithoutCookie.sandbox),
    "note-01",
    "local replay history must not itself suppress recommendations",
  );

  const cookieWithoutHistory = createHarness({ cookie: firstVisit.document.cookie });
  const endHtml = vm.runInContext("renderRecommendationPage()", cookieWithoutHistory.sandbox);
  assert.match(endHtml, /哎鸭，被你看完啦/);
  assert.doesNotMatch(endHtml, /回看/);
  assert.deepEqual(evaluateJson(cookieWithoutHistory.sandbox, "ui.recommendationIds"), []);
});

test("the photographed note wall remains visible behind every route", () => {
  assert.match(
    stylesSource,
    /\.site-background \{[\s\S]*?wall-scene\.png[\s\S]*?background-size: cover;[\s\S]*?\}/,
  );
  assert.match(
    stylesSource,
    /body\.is-immersive-route \.site-frost \{[\s\S]*?background: rgba\(247, 244, 239, 0\.08\);[\s\S]*?blur\(10px\)/,
  );
  assert.match(stylesSource, /\.site-background,[\s\S]*?position: fixed;[\s\S]*?inset: 0;/);
  assert.match(stylesSource, /body\.is-opening \.site-background \{[\s\S]*?scale\(1\.01\)/);
});

test("a downward page swipe from bottom to top enters the one-note wall", () => {
  const { sandbox } = createHarness();
  sandbox.__touchEndEvent = {
    changedTouches: [{ clientX: 120, clientY: 110 }],
    cancelable: true,
    preventDefault() {},
  };

  vm.runInContext(
    `ui.route = "home";
     touchGestureStart = { kind: "landing", x: 120, y: 180, axis: "y", startedAt: 900 };
     handleTouchEnd(__touchEndEvent);`,
    sandbox,
  );

  assert.equal(vm.runInContext("ui.route", sandbox), "wall");
});

test("an upward page swipe from top to bottom does not enter the wall from landing", () => {
  const { sandbox } = createHarness();
  sandbox.__touchEndEvent = {
    changedTouches: [{ clientX: 120, clientY: 190 }],
    cancelable: true,
    preventDefault() {},
  };

  vm.runInContext(
    `ui.route = "home";
     touchGestureStart = { kind: "landing", x: 120, y: 120, axis: "y", startedAt: 900 };
     handleTouchEnd(__touchEndEvent);`,
    sandbox,
  );

  assert.equal(vm.runInContext("ui.route", sandbox), "home");
});

test("wall touch gestures map bottom-to-top to next and top-to-bottom to previous", () => {
  const { sandbox } = createHarness();
  vm.runInContext(
    `ui.route = "wall";
     ui.recommendationIds = ["note-01", "note-02"];
     ui.recommendationIndex = 0;
     ui.recommendationComplete = false;
     touchGestureStart = { kind: "viewer", x: 120, y: 190, axis: "y", startedAt: 900 };
     handleTouchEnd({
       changedTouches: [{ clientX: 120, clientY: 110 }],
       cancelable: true,
       preventDefault() {},
     });`,
    sandbox,
  );
  assert.equal(vm.runInContext("ui.recommendationIndex", sandbox), 1);

  vm.runInContext(
    `touchGestureStart = { kind: "viewer", x: 120, y: 110, axis: "y", startedAt: 900 };
     handleTouchEnd({
       changedTouches: [{ clientX: 120, clientY: 190 }],
       cancelable: true,
       preventDefault() {},
     });`,
    sandbox,
  );
  assert.equal(vm.runInContext("ui.recommendationIndex", sandbox), 0);

  const viewerHtml = vm.runInContext(
    "ui.showSwipeHint = true; renderSingleNoteViewer(seedNotes[0])",
    sandbox,
  );
  assert.match(viewerHtml, /下滑继续/);
});

test("wheel and keyboard page directions select the matching next or previous note", () => {
  const { sandbox } = createHarness();
  vm.runInContext(
    `ui.route = "wall";
     ui.recommendationIds = ["note-01", "note-02"];
     ui.recommendationIndex = 0;
     ui.recommendationComplete = false;
     wheelGestureReadyAt = 0;
     handleWheel({
       deltaY: 80,
       cancelable: true,
       preventDefault() {},
       target: { closest(selector) { return selector === ".recommendation-page" ? this : null; } },
     });`,
    sandbox,
  );
  assert.equal(vm.runInContext("ui.recommendationIndex", sandbox), 1);

  vm.runInContext(
    `wheelGestureReadyAt = 0;
     handleWheel({
       deltaY: -80,
       cancelable: true,
       preventDefault() {},
       target: { closest(selector) { return selector === ".recommendation-page" ? this : null; } },
     });`,
    sandbox,
  );
  assert.equal(vm.runInContext("ui.recommendationIndex", sandbox), 0);

  vm.runInContext(
    `handleKeydown({ key: "ArrowDown", preventDefault() {} });`,
    sandbox,
  );
  assert.equal(vm.runInContext("ui.recommendationIndex", sandbox), 1);

  vm.runInContext(
    `handleKeydown({ key: "ArrowUp", preventDefault() {} });`,
    sandbox,
  );
  assert.equal(vm.runInContext("ui.recommendationIndex", sandbox), 0);
});

test("mobile nav opens the lightweight Q&A sheet before asking for a role", () => {
  const { sandbox, participationDialog, participationDialogContent } = createHarness();
  const navHtml = vm.runInContext("renderMobileNav()", sandbox);

  assert.match(navHtml, />墙</);
  assert.match(navHtml, />问答</);
  assert.match(navHtml, />我的</);
  assert.doesNotMatch(navHtml, />参与</);

  sandbox.__openParticipationEvent = {
    preventDefault() {},
    target: {
      closest() {
        return { dataset: { action: "open-participation" } };
      },
    },
  };
  vm.runInContext("ui.route = 'wall'; handleClick(__openParticipationEvent)", sandbox);

  assert.equal(participationDialog.open, true);
  assert.match(participationDialogContent.innerHTML, /提个问题/);
  assert.match(participationDialogContent.innerHTML, /去回答/);
  assert.equal(vm.runInContext("ui.route", sandbox), "wall");
  assert.equal(vm.runInContext("ui.pendingIntent", sandbox), null);

  sandbox.__askFromSheetEvent = {
    target: {
      closest() {
        return { dataset: { participationAction: "ask" } };
      },
    },
  };
  vm.runInContext("handleParticipationDialogClick(__askFromSheetEvent)", sandbox);

  assert.equal(participationDialog.open, false);
  assert.equal(vm.runInContext("ui.route", sandbox), "identity");
  assert.deepEqual(evaluateJson(sandbox, "ui.pendingIntent"), { type: "ask" });
});

test("answer choice defers identity selection and legacy participate links open the same sheet", () => {
  const direct = createHarness();
  direct.sandbox.__answerFromSheetEvent = {
    target: {
      closest() {
        return { dataset: { participationAction: "answer" } };
      },
    },
  };
  vm.runInContext(
    "openParticipationSheet(); handleParticipationDialogClick(__answerFromSheetEvent)",
    direct.sandbox,
  );
  assert.equal(vm.runInContext("ui.route", direct.sandbox), "identity");
  assert.deepEqual(evaluateJson(direct.sandbox, "ui.pendingIntent"), { type: "answer" });

  const legacy = createHarness({
    href: "https://example.test/prototype/#participate",
    hash: "#participate",
  });
  vm.runInContext("prepareInitialRoute()", legacy.sandbox);
  assert.equal(vm.runInContext("ui.route", legacy.sandbox), "wall");
  assert.equal(vm.runInContext("ui.pendingIntent", legacy.sandbox), null);
  assert.equal(vm.runInContext("ui.openParticipationAfterRender", legacy.sandbox), true);
  vm.runInContext("openParticipationSheet()", legacy.sandbox);
  assert.equal(legacy.participationDialog.open, true);
  assert.match(legacy.participationDialogContent.innerHTML, /提个问题/);
  assert.match(legacy.participationDialogContent.innerHTML, /去回答/);
});

test("approved raster assets retain their original bytes", async () => {
  const expected = new Map([
    ["wall-scene.png", "c0ed35231c52e3e603c879bf63c825b8edfa07c00dcb617ee7671f75be75d2c7"],
    ["hero-overlay.png", "8b47fd1c190d7db8d0ae434128aac29437446a99661279e773866507e7eaaeae"],
    ["landing-duck.png", "5e0d841a22301c4b4618cae8fc386253c851872519ba7577fbbe6b333d169998"],
    ["ending-duck.gif", "d7c0ec9216f0598ceab52c47babe675b8467bb6f30e34810871b7f5213ad75d8"],
  ]);

  for (const [name, digest] of expected) {
    const bytes = await readFile(new URL(`../prototype/assets/${name}`, import.meta.url));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), digest);
  }
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

  assert.match(completedHtml, /哎鸭，被你看完啦/);
  assert.match(completedHtml, /assets\/ending-duck\.gif/);
  assert.doesNotMatch(completedHtml, /暂时没有公开便签/);
});

test("wall end states distinguish empty, unavailable, and emergency modes", () => {
  const emptyHarness = createHarness({
    backend: { enabled: true, experienceMode: false },
  });
  const emptyHtml = vm.runInContext(
    "remoteAvailable = true; remoteNotes = []; renderRecommendationPage()",
    emptyHarness.sandbox,
  );
  assert.match(emptyHtml, /暂时没有公开便签/);

  const unavailableHarness = createHarness({
    backend: { enabled: true, experienceMode: false },
  });
  const unavailableHtml = vm.runInContext(
    "remoteAvailable = false; remoteLoadFailed = true; renderRecommendationPage()",
    unavailableHarness.sandbox,
  );
  assert.match(unavailableHtml, /暂时无法读取便签/);

  const emergencyHarness = createHarness({
    backend: { enabled: true, experienceMode: false },
  });
  const emergencyHtml = vm.runInContext(
    "remoteAvailable = true; runtimeStatus.emergencyLockdown = true; renderRecommendationPage()",
    emergencyHarness.sandbox,
  );
  assert.match(emergencyHtml, /问答墙暂时关闭/);
  assert.doesNotMatch(emergencyHtml, /暂时没有公开便签/);
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
  assert.match(shareCalls[0].files[0].name, /^解鸭留言墙-.*\.png$/);
  assert.match(shareCalls[0].text, /https:\/\/example\.test\/prototype\/\?note=note-01#wall/);
  assert.equal("url" in shareCalls[0], false);
});

test("the explicit share sheet offers three clear actions and the first image action shares", async () => {
  const shareCalls = [];
  const { sandbox, shareDialog, shareDialogContent, toast } = createHarness({
    async share(payload) {
      shareCalls.push(payload);
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
  sandbox.__firstClickImageBlob = { type: "image/png", marker: "first-click-image" };
  vm.runInContext("createNoteImageBlob = async () => __firstClickImageBlob", sandbox);

  vm.runInContext('openShareSheet("note-01")', sandbox);
  assert.equal(shareDialog.open, true);
  assert.match(shareDialogContent.innerHTML, /分享便签图片/);
  assert.match(shareDialogContent.innerHTML, /保存图片/);
  assert.match(shareDialogContent.innerHTML, /复制链接/);
  assert.match(shareDialogContent.innerHTML, /正在准备图片预览/);

  await vm.runInContext('noteSharePreparationPromises.get("note-01")', sandbox);
  await Promise.resolve();
  assert.match(
    shareDialogContent.innerHTML,
    /data-share-action="share-image"(?![^>]*disabled)/,
  );

  sandbox.__shareImageEvent = {
    target: {
      closest() {
        return { dataset: { shareAction: "share-image" } };
      },
    },
  };
  vm.runInContext("handleShareDialogClick(__shareImageEvent)", sandbox);

  assert.equal(shareCalls.length, 1, "one action click should immediately open native sharing");
  assert.doesNotMatch(toast.textContent, /再点一次/);
});

test("the share sheet previews the prepared image without rendering it twice and revokes it on close", async () => {
  const { sandbox, shareDialogContent, createdObjectUrls, revokedObjectUrls } = createHarness();
  sandbox.__previewImageBlob = { type: "image/png", marker: "preview-image" };
  vm.runInContext(
    `globalThis.__previewRenderCalls = 0;
     createNoteImageBlob = async () => {
       globalThis.__previewRenderCalls += 1;
       return __previewImageBlob;
     };`,
    sandbox,
  );

  vm.runInContext('openShareSheet("note-01")', sandbox);
  await vm.runInContext('noteSharePreparationPromises.get("note-01")', sandbox);
  await Promise.resolve();

  assert.match(shareDialogContent.innerHTML, /即将分享或保存的便签图片预览/);
  assert.match(shareDialogContent.innerHTML, /src="blob:share-preview-1"/);
  assert.match(shareDialogContent.innerHTML, /保存前预览/);
  assert.equal(vm.runInContext("globalThis.__previewRenderCalls", sandbox), 1);
  assert.equal(createdObjectUrls.length, 1);
  assert.equal(createdObjectUrls[0].blob, sandbox.__previewImageBlob);

  vm.runInContext('refreshShareSheet("note-01", "ready")', sandbox);
  assert.equal(vm.runInContext("globalThis.__previewRenderCalls", sandbox), 1);
  assert.equal(createdObjectUrls.length, 1, "the same cached Blob URL should be reused");

  vm.runInContext("closeShareSheet()", sandbox);
  assert.deepEqual(revokedObjectUrls, ["blob:share-preview-1"]);
  assert.equal(vm.runInContext("sharePreviewObjectUrl", sandbox), "");
});

test("save image and copy link actions each complete in one selection", async () => {
  const copied = [];
  const downloads = [];
  const { sandbox } = createHarness({
    async writeText(value) {
      copied.push(value);
    },
  });
  sandbox.__actionImageBlob = { type: "image/png", marker: "action-image" };
  sandbox.__downloads = downloads;
  vm.runInContext(
    `createNoteImageBlob = async () => __actionImageBlob;
     downloadNoteImage = (blob, note) => __downloads.push({ blob, id: note.id });`,
    sandbox,
  );

  await vm.runInContext('prepareNoteForShare("note-01")', sandbox);
  assert.equal(vm.runInContext('savePreparedNoteImage("note-01")', sandbox), true);
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].blob, sandbox.__actionImageBlob);
  assert.equal(downloads[0].id, "note-01");

  assert.equal(await vm.runInContext('copyNoteLink("note-01")', sandbox), true);
  assert.deepEqual(copied, ["https://example.test/prototype/?note=note-01#wall"]);
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

test("file share rejection falls through to save and copy in the same selection", async () => {
  const shareCalls = [];
  const copied = [];
  const downloads = [];
  const { sandbox, toast } = createHarness({
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
    async writeText(value) {
      copied.push(value);
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
  sandbox.__fallbackDownloads = downloads;
  vm.runInContext(
    `createNoteImageBlob = async () => __imageBlob;
     downloadNoteImage = (blob, note) => __fallbackDownloads.push({ blob, id: note.id });`,
    sandbox,
  );

  await vm.runInContext('prepareNoteForShare("note-01")', sandbox);
  const completed = await vm.runInContext('sharePreparedNoteImage("note-01")', sandbox);

  assert.equal(shareCalls.length, 1);
  assert.equal(shareCalls[0].files.length, 1);
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].blob, sandbox.__imageBlob);
  assert.equal(downloads[0].id, "note-01");
  assert.equal(copied.length, 1);
  assert.match(copied[0], /https:\/\/example\.test\/prototype\/\?note=note-01#wall/);
  assert.equal(completed, true);
  assert.doesNotMatch(toast.textContent, /再点一次/);
});

test("a prepared image action calls native sharing synchronously without revalidating or rerendering", async () => {
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

  const sharing = vm.runInContext(`sharePreparedNoteImage(${JSON.stringify(note.id)})`, sandbox);

  assert.equal(shareCalls.length, 1, "native share must start before the image action yields");
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
