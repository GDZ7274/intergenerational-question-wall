import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const appSource = await readFile(new URL("../prototype/app.js", import.meta.url), "utf8");

const SAFE_PHOTO_URL =
  "https://project.supabase.co/storage/v1/object/public/photo-note-public/2026/photo-note-101.jpg";

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

function createHarness({ fetch: fetchImpl, share, canShare } = {}) {
  const app = createElement("app");
  const noteDialog = createElement("note-dialog");
  const noteDialogContent = createElement("note-dialog-content");
  const participationDialog = createElement("participation-dialog");
  const participationDialogContent = createElement("participation-dialog-content");
  const shareDialog = createElement("share-dialog");
  const shareDialogContent = createElement("share-dialog-content");
  const toast = createElement("toast");
  const elements = new Map([
    ["app", app],
    ["note-dialog", noteDialog],
    ["note-dialog-content", noteDialogContent],
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
  const navigator = {
    clipboard: { async writeText() {} },
    ...(share ? { share } : {}),
    ...(canShare ? { canShare } : {}),
  };
  const sandbox = {
    QuestionWallBackend: { enabled: false, experienceMode: false },
    localStorage: createStorage(),
    sessionStorage: createStorage(),
    document,
    navigator,
    location,
    history,
    URL,
    Blob,
    fetch: fetchImpl,
    performance: { now: () => 1000 },
    crypto: { randomUUID: () => "session-photo-tests" },
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
  return { sandbox, noteDialog, noteDialogContent, shareDialog, shareDialogContent, toast };
}

function photoNote(overrides = {}) {
  return {
    id: "photo-note-101",
    kind: "photo",
    questionId: null,
    answerId: null,
    photoNoteId: "photo-note-101",
    direction: "child_to_adult",
    question: "你小时候也会害怕犯错吗？",
    answer: "会，所以我更想先听你把话说完。",
    createdAt: "2026-08-23T10:00:00.000Z",
    featured: false,
    answerCount: 1,
    mediaUrl: SAFE_PHOTO_URL,
    imageUrl: SAFE_PHOTO_URL,
    altText: "一张蓝色手写实体便签",
    mediaWidth: 1800,
    mediaHeight: 1200,
    ...overrides,
  };
}

function evaluateJson(sandbox, expression) {
  return JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, sandbox));
}

test("photo notes render as image cards and image-first details without an answer CTA", () => {
  const { sandbox, noteDialog, noteDialogContent } = createHarness();
  sandbox.__photoNote = photoNote();
  vm.runInContext(
    "seedNotes.unshift(__photoNote); createNoteImageBlob = async () => new Blob([], { type: 'image/jpeg' })",
    sandbox,
  );

  const cardHtml = vm.runInContext("renderNoteCard(__photoNote)", sandbox);
  assert.match(cardHtml, /class="note-sheet note-template photo-note-card"/);
  assert.match(cardHtml, new RegExp(SAFE_PHOTO_URL.replaceAll("/", "\\/")));
  assert.match(cardHtml, /alt="一张蓝色手写实体便签"/);
  assert.match(cardHtml, /实体便签/);

  vm.runInContext('openNote("photo-note-101", { fromHistory: true })', sandbox);
  assert.equal(noteDialog.open, true);
  assert.match(noteDialogContent.innerHTML, /class="detail-photo-note"/);
  assert.match(noteDialogContent.innerHTML, /你小时候也会害怕犯错吗/);
  assert.match(noteDialogContent.innerHTML, /会，所以我更想先听你把话说完/);
  assert.match(noteDialogContent.innerHTML, /收藏/);
  assert.match(noteDialogContent.innerHTML, /分享/);
  assert.match(noteDialogContent.innerHTML, /举报/);
  assert.doesNotMatch(noteDialogContent.innerHTML, /我也来回答/);
  assert.doesNotMatch(noteDialogContent.innerHTML, /data-dialog-action="answer"/);
});

test("photo favorites persist a sanitized self-contained snapshot", () => {
  const { sandbox } = createHarness();
  sandbox.__photoNote = photoNote();
  vm.runInContext("seedNotes.unshift(__photoNote); toggleFavorite(__photoNote.id)", sandbox);

  assert.deepEqual(evaluateJson(sandbox, "persisted.favorites"), ["photo-note-101"]);
  assert.deepEqual(evaluateJson(sandbox, "persisted.favoriteNotes[0]"), {
    id: "photo-note-101",
    kind: "photo",
    questionId: null,
    answerId: null,
    photoNoteId: "photo-note-101",
    direction: "child_to_adult",
    question: "你小时候也会害怕犯错吗？",
    answer: "会，所以我更想先听你把话说完。",
    createdAt: "2026-08-23T10:00:00.000Z",
    featured: false,
    answerCount: 1,
    mediaUrl: SAFE_PHOTO_URL,
    imageUrl: SAFE_PHOTO_URL,
    altText: "一张蓝色手写实体便签",
    mediaWidth: 1800,
    mediaHeight: 1200,
  });

  vm.runInContext("seedNotes.shift()", sandbox);
  assert.equal(vm.runInContext('findViewableNote("photo-note-101").mediaUrl', sandbox), SAFE_PHOTO_URL);
  assert.match(
    vm.runInContext("ui.mineTab = 'favorites'; renderMineTabContent()", sandbox),
    /photo-note-card/,
  );
});

test("photo share cache keys change when the media identity changes", () => {
  const { sandbox } = createHarness();
  sandbox.__photoA = photoNote();
  sandbox.__photoB = photoNote({
    mediaUrl:
      "https://project.supabase.co/storage/v1/object/public/photo-note-public/2026/photo-note-102.jpg",
    imageUrl:
      "https://project.supabase.co/storage/v1/object/public/photo-note-public/2026/photo-note-102.jpg",
  });
  sandbox.__textVersion = {
    ...photoNote(),
    kind: "text",
    questionId: "question-101",
    answerId: "answer-101",
    photoNoteId: null,
    mediaUrl: null,
    imageUrl: null,
  };

  const photoKey = vm.runInContext("noteShareContentKey(__photoA)", sandbox);
  assert.notEqual(photoKey, vm.runInContext("noteShareContentKey(__photoB)", sandbox));
  assert.notEqual(photoKey, vm.runInContext("noteShareContentKey(__textVersion)", sandbox));
});

test("photo sharing uses the fetched original Blob with matching JPEG filename and MIME", async () => {
  const fetchCalls = [];
  const shareCalls = [];
  const originalBlob = new Blob(["original-photo-bytes"], { type: "image/jpeg" });
  const { sandbox } = createHarness({
    async fetch(input, options) {
      fetchCalls.push({ input: String(input), options });
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => (name.toLowerCase() === "content-type" ? "image/jpeg" : null) },
        async blob() {
          return originalBlob;
        },
      };
    },
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
  sandbox.__photoNote = photoNote();
  vm.runInContext("seedNotes.unshift(__photoNote)", sandbox);

  const prepared = await vm.runInContext('prepareNoteForShare("photo-note-101")', sandbox);
  assert.equal(prepared.status, "ready");
  assert.equal(prepared.imageBlob, originalBlob);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].input, SAFE_PHOTO_URL);

  assert.equal(await vm.runInContext('sharePreparedNoteImage("photo-note-101")', sandbox), true);
  assert.equal(shareCalls.length, 1);
  assert.equal(shareCalls[0].files.length, 1);
  assert.equal(shareCalls[0].files[0].parts[0], originalBlob);
  assert.equal(shareCalls[0].files[0].type, "image/jpeg");
  assert.match(shareCalls[0].files[0].name, /^解鸭留言墙-.*\.jpg$/);
});

test("photo media URL validation rejects executable, foreign, credentialed, and malformed sources", () => {
  const { sandbox } = createHarness();
  const unsafeUrls = [
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "http://project.supabase.co/storage/v1/object/public/photo-note-public/x.jpg",
    "https://evil.example/storage/v1/object/public/photo-note-public/x.jpg",
    "https://project.supabase.co/storage/v1/object/public/private/x.jpg",
    "https://user:secret@project.supabase.co/storage/v1/object/public/photo-note-public/x.jpg",
    "https://project.supabase.co/storage/v1/object/public/photo-note-public//x.jpg",
  ];

  assert.equal(vm.runInContext(`normalizePhotoMediaUrl(${JSON.stringify(SAFE_PHOTO_URL)})`, sandbox), SAFE_PHOTO_URL);
  unsafeUrls.forEach((url) => {
    assert.equal(
      vm.runInContext(`normalizePhotoMediaUrl(${JSON.stringify(url)})`, sandbox),
      "",
      `expected unsafe photo URL to be rejected: ${url}`,
    );
    sandbox.__unsafePhoto = photoNote({ mediaUrl: url, imageUrl: url });
    assert.equal(vm.runInContext("createFavoriteNoteSnapshot(__unsafePhoto)", sandbox), null);
  });
});
