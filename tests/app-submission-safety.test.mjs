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

function createStorage() {
  const values = new Map();
  let writesFail = false;
  return {
    api: {
      getItem(key) {
        return values.has(key) ? values.get(key) : null;
      },
      setItem(key, value) {
        if (writesFail) throw new Error("storage unavailable");
        values.set(key, String(value));
      },
      removeItem(key) {
        values.delete(key);
      },
    },
    failWrites() {
      writesFail = true;
    },
    read(key) {
      return values.get(key) || "";
    },
  };
}

function createHarness() {
  const local = createStorage();
  const session = createStorage();
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
  const logs = [];
  const calls = { question: 0, answer: 0 };
  const location = { hash: "#ask" };
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
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelector() {
      return null;
    },
    addEventListener() {},
    createRange() {
      return { selectNodeContents() {} };
    },
  };
  const backend = {
    enabled: true,
    experienceMode: false,
    async createQuestion() {
      calls.question += 1;
      return {
        id: "remote-question",
        receipt: "a".repeat(64),
        status: "pending",
        createdAt: "2026-08-19T01:00:00Z",
      };
    },
    async createAnswer() {
      calls.answer += 1;
      return {
        id: "remote-answer",
        receipt: "b".repeat(64),
        status: "pending",
        createdAt: "2026-08-19T01:05:00Z",
      };
    },
    async loadContent() {
      return { notes: [], questions: [] };
    },
  };
  const sandbox = {
    QuestionWallBackend: backend,
    localStorage: local.api,
    sessionStorage: session.api,
    document,
    navigator: {
      clipboard: {
        async writeText() {},
      },
    },
    location,
    history,
    performance: { now: () => 1000 },
    crypto: { randomUUID: () => "session-12345678" },
    FormData: class FormData {
      constructor(form) {
        this.values = form.values;
      }
      get(name) {
        return this.values[name] ?? null;
      }
    },
    console: {
      error(...args) {
        logs.push(args);
      },
      warn(...args) {
        logs.push(args);
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

  function prepare(script) {
    vm.runInContext(`remoteAvailable = true; ${script}; savePersistedState();`, sandbox);
  }

  async function submit(functionName, form) {
    sandbox.__testForm = form;
    await vm.runInContext(`${functionName}(__testForm)`, sandbox);
    await Promise.resolve();
  }

  return { sandbox, local, session, app, toast, logs, calls, prepare, submit };
}

function submissionForm(values, dataset = {}) {
  const button = { disabled: false };
  return {
    values,
    dataset,
    button,
    querySelector() {
      return button;
    },
  };
}

test("successful question shows its receipt when durable local storage fails", async () => {
  const harness = createHarness();
  harness.prepare(`
    persisted.role = "adult";
    persisted.drafts.ask.adult = "你最希望大人理解什么？"
  `);
  harness.local.failWrites();
  const form = submissionForm({ body: "你最希望大人理解什么？", anonymous: "on" });

  await harness.submit("submitQuestion", form);

  assert.equal(harness.calls.question, 1);
  assert.equal(form.button.disabled, true);
  assert.match(harness.app.innerHTML, /问题已提交成功/);
  assert.match(harness.app.innerHTML, /不要再次提交同一内容/);
  assert.match(harness.app.innerHTML, new RegExp("a{64}"));
  assert.doesNotMatch(harness.toast.textContent, /失败|重试/);
  assert.match(harness.session.read("question-wall-unsaved-receipt-v1"), /a{64}/);
  assert.equal(harness.logs.some((entry) => JSON.stringify(entry).includes("a".repeat(64))), false);
});

test("successful answer shows its receipt when durable local storage fails", async () => {
  const harness = createHarness();
  harness.prepare(`
    persisted.role = "adult";
    persisted.drafts.answer["question-for-adult"] = "先认真听完。";
    remoteQuestions = [{
      id: "question-for-adult",
      direction: "child_to_adult",
      askerRole: "child",
      targetRole: "adult",
      body: "大人怎样才能更认真地听？",
      answerCount: 0,
      createdAt: "2026-08-19T00:00:00Z",
      status: "open",
      authorSessionId: "remote"
    }]
  `);
  harness.local.failWrites();
  const form = submissionForm(
    { body: "先认真听完。", anonymous: "on" },
    { questionId: "question-for-adult" },
  );

  await harness.submit("submitAnswer", form);

  assert.equal(harness.calls.answer, 1);
  assert.equal(form.button.disabled, true);
  assert.match(harness.app.innerHTML, /回答已提交成功/);
  assert.match(harness.app.innerHTML, new RegExp("b{64}"));
  assert.doesNotMatch(harness.toast.textContent, /失败|重试/);
  assert.match(harness.session.read("question-wall-unsaved-receipt-v1"), /b{64}/);
  assert.equal(harness.logs.some((entry) => JSON.stringify(entry).includes("b".repeat(64))), false);
});

test("notification and draft cleanup errors cannot reclassify a successful request", async () => {
  const harness = createHarness();
  harness.prepare(`
    persisted.role = "child";
    persisted.notifications = Object.freeze([]);
    persisted.drafts.ask = new Proxy(persisted.drafts.ask, {
      set() { throw new Error("draft cleanup failed"); }
    })
  `);
  const form = submissionForm({ body: "大人小时候也会害怕吗？", anonymous: "on" });

  await harness.submit("submitQuestion", form);

  const stored = JSON.parse(harness.local.read("question-wall-prototype-v1"));
  assert.equal(harness.calls.question, 1);
  assert.equal(stored.myQuestions[0].receipt, "a".repeat(64));
  assert.equal(vm.runInContext("ui.receiptFallback", harness.sandbox), null);
  assert.equal(vm.runInContext("ui.route", harness.sandbox), "mine");
  assert.doesNotMatch(harness.toast.textContent, /失败|重试/);
});
