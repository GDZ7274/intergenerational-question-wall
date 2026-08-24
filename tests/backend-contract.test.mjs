import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const backendSource = await readFile(
  new URL("../prototype/backend.js", import.meta.url),
  "utf8",
);

function jsonResponse(payload, status = 200) {
  const text = JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return text;
    },
  };
}

function loadBackend(responses) {
  const calls = [];
  const queue = [...responses];
  const sandbox = {
    QUESTION_WALL_CONFIG: {
      supabaseUrl: "https://project.supabase.co",
      supabaseAnonKey: "public-test-key",
    },
    fetch: async (url, options) => {
      calls.push({ url, options });
      const response = queue.shift();
      if (!response) throw new Error("Unexpected fetch call");
      return response;
    },
  };
  vm.runInNewContext(backendSource, sandbox);
  return { backend: sandbox.QuestionWallBackend, calls };
}

test("question submissions use the controlled RPC and retain the receipt", async () => {
  const { backend, calls } = loadBackend([
    jsonResponse({
      ok: true,
      id: "question-id",
      receipt: "a".repeat(64),
      status: "pending",
      createdAt: "2026-08-19T01:00:00Z",
    }),
  ]);

  const question = await backend.createQuestion({
    authorSessionId: "session-12345678",
    authorRole: "adult",
    body: "你最希望大人理解什么？",
    anonymous: true,
  });

  assert.equal(question.id, "question-id");
  assert.equal(question.receipt, "a".repeat(64));
  assert.equal(question.status, "pending");
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/submit_question$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_session_id: "session-12345678",
    p_author_role: "adult",
    p_body: "你最希望大人理解什么？",
    p_anonymous: true,
  });
});

test("runtime state is normalized for the public application", async () => {
  const { backend } = loadBackend([
    jsonResponse({
      schemaVersion: 3,
      submissionsPaused: true,
      readOnly: false,
      emergencyLockdown: false,
      publicMessage: "今晚暂停投稿",
    }),
  ]);

  const status = JSON.parse(JSON.stringify(await backend.loadRuntimeStatus()));
  assert.deepEqual(status, {
    schemaVersion: 3,
    submissionsPaused: true,
    readOnly: false,
    emergencyLockdown: false,
    publicMessage: "今晚暂停投稿",
  });
});

test("shared notes are resolved through the public wall view", async () => {
  const { backend, calls } = loadBackend([
    jsonResponse([
      {
        note_id: "note-01",
        question_id: "question-01",
        answer_id: "answer-01",
        direction: "adult_to_child",
        question: "可以分享这张便签吗？",
        answer: "可以，链接会定位到这张公开便签。",
        published_at: "2026-08-19T01:00:00Z",
        featured: false,
        answer_count: 1,
      },
    ]),
  ]);

  const note = await backend.loadNote("note-01");

  assert.equal(note.id, "note-01");
  assert.equal(note.questionId, "question-01");
  assert.match(calls[0].url, /wall_notes\?select=\*&note_id=eq\.note-01&limit=1$/);
  assert.equal(await backend.loadNote("../private"), null);
  assert.equal(calls.length, 1);
});

test("public projection reads bypass browser cache for fresh approvals", async () => {
  const { backend, calls } = loadBackend([
    jsonResponse([]),
    jsonResponse([]),
  ]);

  await backend.loadContent();

  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[1].options.cache, "no-store");
});

test("saved note ids are batch-validated through the public wall view", async () => {
  const { backend, calls } = loadBackend([
    jsonResponse([
      {
        note_id: "note-01",
        question_id: "question-01",
        answer_id: "answer-01",
        direction: "adult_to_child",
        question: "批量验证收藏吗？",
        answer: "只返回仍然公开的便签。",
        published_at: "2026-08-19T01:00:00Z",
        featured: false,
        answer_count: 1,
      },
    ]),
  ]);

  const notes = await backend.loadNotes(["note-01", "note-02", "../private", "note-01"]);

  assert.deepEqual(JSON.parse(JSON.stringify(notes.map((note) => note.id))), ["note-01"]);
  assert.match(calls[0].url, /wall_notes\?select=\*&note_id=in\.\(note-01,note-02\)&limit=2$/);
});

test("controlled RPC refusals expose stable error metadata", async () => {
  const { backend } = loadBackend([
    jsonResponse({
      ok: false,
      error: "rate_limited",
      message: "提交太频繁，请稍后再试。",
      retryAfter: 90,
    }),
  ]);

  await assert.rejects(
    backend.createAnswer({
      questionId: "00000000-0000-4000-8000-000000000101",
      authorSessionId: "session-12345678",
      authorRole: "child",
      body: "先听我说完。",
      anonymous: true,
    }),
    (error) =>
      error.code === "rate_limited" &&
      error.retryAfter === 90 &&
      error.message === "提交太频繁，请稍后再试。",
  );
});

test("PostgREST failures preserve HTTP and database error codes", async () => {
  const { backend } = loadBackend([
    jsonResponse({ code: "42501", message: "permission denied" }, 403),
  ]);

  await assert.rejects(
    backend.getSubmissionStatus("b".repeat(64)),
    (error) => error.status === 403 && error.code === "42501",
  );
});
