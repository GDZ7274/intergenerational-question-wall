import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";

const adminSource = await readFile(new URL("../prototype/admin.js", import.meta.url), "utf8");
const edgeSource = await readFile(
  new URL("../supabase/functions/photo-note-media/index.ts", import.meta.url),
  "utf8",
);
const mediaBoundaryMigrationSource = await readFile(
  new URL("../supabase/migrations/0006_photo_media_service_boundary.sql", import.meta.url),
  "utf8",
);

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

function createElement(tagName = "div", id = "") {
  const listeners = new Map();
  const element = {
    id,
    tagName: tagName.toUpperCase(),
    className: "",
    textContent: "",
    value: "",
    hidden: false,
    disabled: false,
    checked: false,
    required: false,
    open: false,
    isConnected: true,
    dataset: {},
    style: {},
    childNodes: [],
    classList: createClassList(),
    addEventListener(type, listener) {
      const entries = listeners.get(type) || [];
      entries.push(listener);
      listeners.set(type, entries);
    },
    dispatch(type, event = {}) {
      return Promise.all((listeners.get(type) || []).map((listener) => listener({ target: element, ...event })));
    },
    append(...nodes) {
      nodes.forEach((node) => {
        if (node?.isFragment) element.childNodes.push(...node.childNodes);
        else element.childNodes.push(node);
      });
    },
    appendChild(node) {
      element.append(node);
      return node;
    },
    replaceChildren(...nodes) {
      element.childNodes = [];
      element.append(...nodes);
    },
    setAttribute(name, value) {
      element[name] = String(value);
    },
    removeAttribute(name) {
      delete element[name];
    },
    querySelector(selector) {
      if (selector === "button") return element.childNodes.find((node) => node?.tagName === "BUTTON") || createElement("button");
      return null;
    },
    querySelectorAll() {
      return [];
    },
    closest(selector) {
      if (selector === "label") return element.__label || (element.__label = createElement("label"));
      return null;
    },
    showModal() {
      element.open = true;
    },
    close() {
      element.open = false;
    },
    focus() {},
    click() {},
    reset() {
      element.resetCalls = (element.resetCalls || 0) + 1;
    },
    reportValidity() {
      return true;
    },
    setCustomValidity() {},
  };
  return element;
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

function createAdminHarness({ fetch: fetchImpl = async () => ({ ok: true, status: 200, async json() { return {}; } }) } = {}) {
  const ids = [...adminSource.matchAll(/document\.getElementById\("([^"]+)"\)/g)]
    .map((match) => match[1]);
  const elementsById = new Map(ids.map((id) => [id, createElement("div", id)]));
  const queueTabs = ["questions", "photo_capture", "photo_notes"].map((view) => {
    const tab = createElement("button", `tab-${view}`);
    tab.dataset.view = view;
    return tab;
  });
  const selectorElements = new Map([
    [".workspace", createElement("main", "workspace")],
    ["[data-dialog-cancel]", createElement("button")],
    ["[data-photo-edit-cancel]", createElement("button")],
    ["[data-emergency-cancel]", createElement("button")],
  ]);
  const metadataFieldIds = [
    "photo-question-text",
    "photo-answer-text",
    "photo-alt-text",
    "photo-internal-note",
  ];
  elementsById.get("photo-metadata-form").reset = function resetPhotoMetadataForm() {
    this.resetCalls = (this.resetCalls || 0) + 1;
    metadataFieldIds.forEach((id) => {
      elementsById.get(id).value = "";
    });
    elementsById.get("photo-safety-check").checked = false;
  };

  const document = {
    getElementById(id) {
      return elementsById.get(id) || null;
    },
    querySelector(selector) {
      return selectorElements.get(selector) || null;
    },
    querySelectorAll(selector) {
      return selector === ".queue-tab" ? queueTabs : [];
    },
    createElement(tagName) {
      return createElement(tagName);
    },
    createDocumentFragment() {
      return { isFragment: true, childNodes: [], append(...nodes) { this.childNodes.push(...nodes); } };
    },
  };
  const sessionStorage = createStorage();
  const revokedUrls = [];
  class TestURL extends URL {}
  TestURL.createObjectURL = () => "blob:generated-preview";
  TestURL.revokeObjectURL = (url) => revokedUrls.push(url);

  const exposure = `
  globalThis.__adminTest = {
    state,
    elements,
    clearSession,
    signOut,
    resolvePhotoPreviewUrl,
    performWorkspaceRefresh,
    updateViewChrome,
    selectView,
    appendPhotoNoteActions,
    executeAction,
    photoNoteBackend,
    setWorkspaceLoaders({ summary, rows = [], runtimeSettings }) {
      loadSummary = async () => summary;
      loadCurrentView = async () => rows;
      loadRuntimeSettings = async () => runtimeSettings;
    },
    setRefreshWorkspace(replacement) { refreshWorkspace = replacement; },
  };
})();`;
  const instrumentedSource = adminSource.replace(/  start\(\);\s*\}\)\(\);\s*$/, exposure);
  assert.notEqual(instrumentedSource, adminSource, "admin test exposure marker must stay current");

  const fetchCalls = [];
  const sandbox = {
    QUESTION_WALL_CONFIG: {
      supabaseUrl: "https://project.supabase.co",
      supabaseAnonKey: "public-anon-key",
    },
    document,
    sessionStorage,
    fetch: async (url, options) => {
      fetchCalls.push({ url: String(url), options });
      return fetchImpl(url, options);
    },
    URL: TestURL,
    FormData: class FormData {
      get() {
        return "";
      }
    },
    Image: class Image {},
    Blob,
    Intl,
    Date,
    console: { error() {}, warn() {} },
    setTimeout: () => 1,
    clearTimeout() {},
    addEventListener() {},
    location: {
      href: "https://example.test/prototype/admin.html",
      hash: "",
      pathname: "/prototype/admin.html",
    },
    history: { replaceState() {} },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(instrumentedSource, sandbox);
  return {
    sandbox,
    api: sandbox.__adminTest,
    elementsById,
    sessionStorage,
    revokedUrls,
    fetchCalls,
    queueTabs,
    createElement,
  };
}

test("admin clearSession removes photo blobs, drafts, private previews, forms, and list state", () => {
  const harness = createAdminHarness();
  const { state, elements, clearSession } = harness.api;
  const localBlob = new Blob(["private-photo"], { type: "image/jpeg" });
  state.session = { accessToken: "access", refreshToken: "refresh", expiresAt: Date.now() + 60_000 };
  state.profile = { email: "admin@example.test", role: "owner" };
  state.rows = [{ id: "private-row" }];
  state.hasMore = true;
  state.photoFile = localBlob;
  state.photoSource = "camera";
  state.photoPreviewUrl = "blob:private-local-preview";
  state.photoRotation = 90;
  state.photoDraft = {
    id: "draft-1",
    blob: localBlob,
    upload: { signedUrl: "https://project.supabase.co/private-upload-token" },
  };
  state.photoSubmitting = true;
  state.photoPreviewUrls.set("private-row", {
    url: "https://project.supabase.co/private-signed-preview",
    expiresAt: Date.now() + 60_000,
  });
  state.pendingPhotoEdit = { id: "private-row" };
  state.pendingAction = { entityId: "private-row" };
  elements.photoPreview.src = "blob:private-local-preview";
  elements.photoPreview.hidden = false;
  elements.photoQuestionText.value = "未提交的问题";
  elements.photoAnswerText.value = "未提交的回答";
  elements.photoAltText.value = "私有图片描述";
  elements.photoInternalNote.value = "内部备注";
  elements.photoSafetyCheck.checked = true;
  elements.contentList.append(createElement("article"));
  elements.reasonDialog.open = true;
  elements.photoEditDialog.open = true;
  elements.emergencyDialog.open = true;
  harness.sessionStorage.setItem("question-wall-admin-session", "private-session");

  clearSession();

  assert.equal(state.session, null);
  assert.equal(state.profile, null);
  assert.deepEqual(Array.from(state.rows), []);
  assert.equal(state.hasMore, false);
  assert.equal(state.photoFile, null);
  assert.equal(state.photoSource, "");
  assert.equal(state.photoPreviewUrl, "");
  assert.equal(state.photoRotation, 0);
  assert.equal(state.photoDraft, null);
  assert.equal(state.photoSubmitting, false);
  assert.equal(state.photoPreviewUrls.size, 0);
  assert.equal(state.pendingPhotoEdit, null);
  assert.equal(state.pendingAction, null);
  assert.equal(elements.photoPreview.src, undefined);
  assert.equal(elements.photoPreview.hidden, true);
  assert.equal(elements.photoQuestionText.value, "");
  assert.equal(elements.photoAnswerText.value, "");
  assert.equal(elements.photoAltText.value, "");
  assert.equal(elements.photoInternalNote.value, "");
  assert.equal(elements.photoSafetyCheck.checked, false);
  assert.equal(elements.photoMetadataForm.resetCalls, 1);
  assert.equal(elements.contentList.childNodes.length, 0);
  assert.equal(elements.reasonDialog.open, false);
  assert.equal(elements.photoEditDialog.open, false);
  assert.equal(elements.emergencyDialog.open, false);
  assert.equal(elements.adminIdentity.textContent, "");
  assert.equal(elements.adminRole.textContent, "");
  assert.equal(harness.sessionStorage.getItem("question-wall-admin-session"), null);
  assert.deepEqual(harness.revokedUrls, ["blob:private-local-preview"]);
});

test("sign out clears private state before the remote logout request finishes", async () => {
  let finishLogout;
  const logoutResponse = new Promise((resolve) => { finishLogout = resolve; });
  const harness = createAdminHarness({
    fetch: async (url) => {
      if (String(url).includes("/auth/v1/logout")) return logoutResponse;
      return { ok: true, status: 200, async json() { return {}; } };
    },
  });
  const { state, elements, signOut } = harness.api;
  state.session = {
    accessToken: "private-access-token",
    refreshToken: "private-refresh-token",
    expiresAt: Date.now() + 60_000,
  };
  state.photoDraft = { id: "draft-before-logout", blob: new Blob(["private"]) };
  state.photoPreviewUrls.set("private-note", { url: "https://project.supabase.co/private-preview" });
  elements.dashboardView.hidden = false;
  elements.loginView.hidden = true;
  harness.sessionStorage.setItem("question-wall-admin-session", "private-session");

  const pendingSignOut = signOut();

  assert.equal(state.session, null);
  assert.equal(state.photoDraft, null);
  assert.equal(state.photoPreviewUrls.size, 0);
  assert.equal(harness.sessionStorage.getItem("question-wall-admin-session"), null);
  assert.equal(elements.dashboardView.hidden, true);
  assert.equal(elements.loginView.hidden, false);

  finishLogout({ ok: true, status: 204, async json() { return {}; } });
  await pendingSignOut;
});

test("a private preview response cannot repopulate the cache after sign out", async () => {
  let finishPreview;
  const previewResponse = new Promise((resolve) => { finishPreview = resolve; });
  const harness = createAdminHarness({
    fetch: async (url) => {
      if (String(url).includes("/functions/v1/photo-note-media")) return previewResponse;
      return { ok: true, status: 200, async json() { return {}; } };
    },
  });
  const { state, clearSession, resolvePhotoPreviewUrl } = harness.api;
  state.session = {
    accessToken: "private-access-token",
    refreshToken: "private-refresh-token",
    expiresAt: Date.now() + 60_000,
  };

  const pendingPreview = resolvePhotoPreviewUrl({ id: "private-note", status: "pending" });
  clearSession();
  finishPreview({
    ok: true,
    status: 200,
    async json() {
      return {
        ok: true,
        preview: {
          url: "https://project.supabase.co/private-signed-preview",
          expiresIn: 600,
        },
      };
    },
  });

  await assert.rejects(pendingPreview, /登录会话已结束/);
  assert.equal(state.photoPreviewUrls.size, 0);
});

test("schema v3 admin dashboards hide and block photo capture and review views", async () => {
  const harness = createAdminHarness();
  const {
    state,
    performWorkspaceRefresh,
    selectView,
    setRefreshWorkspace,
    setWorkspaceLoaders,
  } = harness.api;
  setWorkspaceLoaders({
    summary: {
      pendingQuestions: 1,
      pendingAnswers: 2,
      openReports: 3,
      publishedNotes: 4,
    },
    rows: [],
    runtimeSettings: {
      submissionsPaused: false,
      readOnly: false,
      emergencyLockdown: false,
      publicMessage: "",
      updatedAt: null,
    },
  });
  setRefreshWorkspace(async () => {});
  state.workspaceRequestId = 7;

  await performWorkspaceRefresh(7);

  assert.equal(state.photoNotesAvailable, false);
  assert.equal(harness.queueTabs.find((tab) => tab.dataset.view === "questions").hidden, false);
  assert.equal(harness.queueTabs.find((tab) => tab.dataset.view === "photo_capture").hidden, true);
  assert.equal(harness.queueTabs.find((tab) => tab.dataset.view === "photo_notes").hidden, true);
  selectView("photo_capture");
  assert.equal(state.view, "questions");
  selectView("photo_notes");
  assert.equal(state.view, "questions");
});

test("schema v4 admin dashboards expose photo capture and review views", async () => {
  const harness = createAdminHarness();
  const {
    state,
    performWorkspaceRefresh,
    selectView,
    setRefreshWorkspace,
    setWorkspaceLoaders,
  } = harness.api;
  setWorkspaceLoaders({
    summary: {
      pendingQuestions: 1,
      pendingAnswers: 2,
      openReports: 3,
      publishedNotes: 4,
      pendingPhotoNotes: 0,
    },
    rows: [],
    runtimeSettings: {
      submissionsPaused: false,
      readOnly: false,
      emergencyLockdown: false,
      publicMessage: "",
      updatedAt: null,
    },
  });
  setRefreshWorkspace(async () => {});
  state.workspaceRequestId = 9;

  await performWorkspaceRefresh(9);

  assert.equal(state.photoNotesAvailable, true);
  assert.equal(harness.queueTabs.find((tab) => tab.dataset.view === "photo_capture").hidden, false);
  assert.equal(harness.queueTabs.find((tab) => tab.dataset.view === "photo_notes").hidden, false);
  selectView("photo_capture");
  assert.equal(state.view, "photo_capture");
});

test("hidden photo cleanup control invokes removeHiddenPublicMedia instead of the moderation RPC", async () => {
  const harness = createAdminHarness({
    fetch: async (url) => ({
      ok: true,
      status: 200,
      async json() {
        return String(url).includes("/functions/v1/photo-note-media")
          ? { ok: true, mediaRemoved: true }
          : [];
      },
    }),
  });
  const { state, appendPhotoNoteActions, executeAction, setRefreshWorkspace } = harness.api;
  const hiddenActions = createElement("div");
  appendPhotoNoteActions(hiddenActions, {
    id: "00000000-0000-4000-8000-000000000101",
    status: "hidden",
    publicObjectPath: "00000000-0000-4000-8000-000000000101/photo.jpg",
    featured: false,
  });
  const cleanupButton = hiddenActions.childNodes.find((node) => node.dataset.action === "cleanup_media");
  assert.ok(cleanupButton, "hidden media with a retained public path needs a cleanup action");
  assert.equal(cleanupButton.textContent, "重试清理公开图片");
  assert.equal(cleanupButton.dataset.entityType, "photo_note");

  const alreadyCleanActions = createElement("div");
  appendPhotoNoteActions(alreadyCleanActions, {
    id: "00000000-0000-4000-8000-000000000102",
    status: "hidden",
    publicObjectPath: "",
    featured: false,
  });
  assert.equal(alreadyCleanActions.childNodes.some((node) => node.dataset.action === "cleanup_media"), false);

  state.session = {
    accessToken: "admin-access-token",
    refreshToken: "admin-refresh-token",
    expiresAt: Date.now() + 3_600_000,
  };
  setRefreshWorkspace(async () => {});
  await executeAction({
    action: cleanupButton.dataset.action,
    entityType: cleanupButton.dataset.entityType,
    entityId: cleanupButton.dataset.entityId,
    sourceItem: null,
  });

  assert.equal(harness.fetchCalls.length, 1);
  assert.match(harness.fetchCalls[0].url, /\/functions\/v1\/photo-note-media$/);
  assert.deepEqual(JSON.parse(harness.fetchCalls[0].options.body), {
    action: "removeHiddenPublicMedia",
    id: "00000000-0000-4000-8000-000000000101",
  });
  assert.doesNotMatch(harness.fetchCalls[0].url, /admin_moderate_photo_note/);
});

test("reported photo hiding is sent to the Edge media compensation path", async () => {
  const harness = createAdminHarness({
    fetch: async (url) => ({
      ok: true,
      status: 200,
      async json() {
        return String(url).includes("/functions/v1/photo-note-media")
          ? { ok: true, mediaRemoved: true }
          : {};
      },
    }),
  });
  const { state, executeAction, setRefreshWorkspace } = harness.api;
  state.session = {
    accessToken: "admin-access-token",
    refreshToken: "admin-refresh-token",
    expiresAt: Date.now() + 3_600_000,
  };
  setRefreshWorkspace(async () => {});

  await executeAction({
    action: "hide_and_resolve",
    entityType: "report",
    entityId: "00000000-0000-4000-8000-000000000301",
    photoNoteId: "00000000-0000-4000-8000-000000000302",
    sourceItem: null,
  }, "需要下架");

  assert.equal(harness.fetchCalls.length, 1);
  assert.match(harness.fetchCalls[0].url, /\/functions\/v1\/photo-note-media$/);
  assert.deepEqual(JSON.parse(harness.fetchCalls[0].options.body), {
    action: "hideReportedPhoto",
    reportId: "00000000-0000-4000-8000-000000000301",
    reason: "需要下架",
  });
  assert.doesNotMatch(harness.fetchCalls[0].url, /admin_resolve_report/);
});

function loadEdgeHandler(environment = {}) {
  let handler = null;
  let createClientCalls = 0;
  const env = new Map(Object.entries(environment));
  const withoutImport = edgeSource.replace(
    /^import .*?;\s*/,
    "const { createClient } = globalThis.__edgeDependencies;\n",
  );
  const runnableSource = stripTypeScriptTypes(withoutImport, { mode: "transform" });
  const sandbox = {
    __edgeDependencies: {
      createClient() {
        createClientCalls += 1;
        throw new Error("CORS tests must stop before creating a Supabase client.");
      },
    },
    Deno: {
      env: { get: (name) => env.get(name) },
      serve(callback) {
        handler = callback;
      },
    },
    Request,
    Response,
    Headers,
    URL,
    Blob,
    crypto,
    console: { error() {}, warn() {} },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(runnableSource, sandbox);
  assert.equal(typeof handler, "function");
  return {
    handler,
    get createClientCalls() {
      return createClientCalls;
    },
  };
}

test("photo media Edge Function fails closed when CORS config is missing or origin mismatches", async () => {
  const missingConfig = loadEdgeHandler();
  const missingResponse = await missingConfig.handler(new Request(
    "https://functions.example.test/photo-note-media",
    { method: "OPTIONS", headers: { Origin: "https://wall.example.test" } },
  ));
  assert.equal(missingResponse.status, 503);
  assert.equal((await missingResponse.json()).error, "origin_configuration_missing");
  assert.equal(missingResponse.headers.get("access-control-allow-origin"), null);
  assert.equal(missingConfig.createClientCalls, 0);

  const mismatch = loadEdgeHandler({
    PHOTO_NOTE_ALLOWED_ORIGINS: "https://wall.example.test",
  });
  const mismatchResponse = await mismatch.handler(new Request(
    "https://functions.example.test/photo-note-media",
    { method: "POST", headers: { Origin: "https://attacker.example" }, body: "{}" },
  ));
  assert.equal(mismatchResponse.status, 403);
  assert.equal((await mismatchResponse.json()).error, "origin_not_allowed");
  assert.equal(mismatchResponse.headers.get("access-control-allow-origin"), null);
  assert.equal(mismatch.createClientCalls, 0);

  const missingOrigin = loadEdgeHandler({
    PHOTO_NOTE_ALLOWED_ORIGINS: "https://wall.example.test",
  });
  const missingOriginResponse = await missingOrigin.handler(new Request(
    "https://functions.example.test/photo-note-media",
    { method: "POST", body: "{}" },
  ));
  assert.equal(missingOriginResponse.status, 403);
  assert.equal((await missingOriginResponse.json()).error, "origin_required");
  assert.equal(missingOriginResponse.headers.get("access-control-allow-origin"), null);
  assert.equal(missingOrigin.createClientCalls, 0);

  const allowed = loadEdgeHandler({
    PHOTO_NOTE_ALLOWED_ORIGINS: "https://wall.example.test",
  });
  const allowedResponse = await allowed.handler(new Request(
    "https://functions.example.test/photo-note-media",
    { method: "OPTIONS", headers: { Origin: "https://wall.example.test" } },
  ));
  assert.equal(allowedResponse.status, 204);
  assert.equal(allowedResponse.headers.get("access-control-allow-origin"), "https://wall.example.test");
  assert.equal(allowedResponse.headers.get("vary"), "Origin");
  assert.equal(allowed.createClientCalls, 0);
});

test("SQL and Edge cleanup contracts retain a hidden-only clear_media transition", () => {
  const functionStart = mediaBoundaryMigrationSource.indexOf("create or replace function public.admin_moderate_photo_note");
  const functionEnd = mediaBoundaryMigrationSource.indexOf("create or replace function", functionStart + 1);
  assert.ok(functionStart >= 0 && functionEnd > functionStart);
  const moderationFunction = mediaBoundaryMigrationSource.slice(functionStart, functionEnd);

  assert.match(moderationFunction, /when 'clear_media' then/);
  assert.match(moderationFunction, /current_note\.status <> 'hidden'/);
  assert.match(moderationFunction, /next_public_path := null/);
  assert.match(
    moderationFunction,
    /when clean_action = 'clear_media' then current_note\.moderation_reason/,
  );
  assert.match(moderationFunction, /'photo_note',[\s\S]*?clean_action/);

  assert.match(edgeSource, /async function clearHiddenMediaReference/);
  assert.match(edgeSource, /edge_moderate_photo_note[\s\S]*?p_action:\s*"clear_media"/);
  assert.match(
    edgeSource,
    /case "removeHiddenPublicMedia":[\s\S]*?removeHiddenPublicMedia\(body, userClient, serviceClient, actorId\)/,
  );
  assert.match(
    edgeSource,
    /storage\.from\(PUBLIC_BUCKET\)\.remove\(\[publicPath\]\)[\s\S]*?clearHiddenMediaReference\(serviceClient, id, actorId\)/,
  );
});

test("only the service role can delegate Storage-coupled transitions, with a real moderator actor", () => {
  assert.match(
    mediaBoundaryMigrationSource,
    /public media actions must use photo-note-media/,
  );
  assert.match(
    mediaBoundaryMigrationSource,
    /create or replace function public\.edge_moderate_photo_note[\s\S]*?auth\.role\(\)[\s\S]*?'service_role'/,
  );
  assert.match(
    mediaBoundaryMigrationSource,
    /perform set_config\('question_wall\.photo_media_actor', p_actor_id::text, true\)/,
  );
  assert.match(
    mediaBoundaryMigrationSource,
    /moderated_by = actor_id[\s\S]*?actor_id,\s*'photo_note'/,
  );
  assert.match(
    mediaBoundaryMigrationSource,
    /reported photo media must use photo-note-media/,
  );
  assert.match(
    mediaBoundaryMigrationSource,
    /create or replace function public\.edge_hide_reported_photo[\s\S]*?return public\.admin_resolve_report\(p_id, 'hide_and_resolve', p_note\)/,
  );
  assert.match(
    mediaBoundaryMigrationSource,
    /revoke all on function public\.edge_moderate_photo_note[\s\S]*?from public, anon, authenticated;[\s\S]*?grant execute[\s\S]*?to service_role;/,
  );
  assert.match(edgeSource, /case "hideReportedPhoto"[\s\S]*?hideReportedPhoto\(body, serviceClient, actorId\)/);
});
