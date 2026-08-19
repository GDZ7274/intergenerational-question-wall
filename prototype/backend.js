(function initializeQuestionWallBackend() {
  const config = globalThis.QUESTION_WALL_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || "").replace(/\/$/, "");
  const supabaseAnonKey = String(config.supabaseAnonKey || "");
  const enabled = Boolean(supabaseUrl && supabaseAnonKey);

  class BackendError extends Error {
    constructor(message, options = {}) {
      super(message);
      this.name = "BackendError";
      this.code = options.code || "remote_error";
      this.status = options.status || 0;
      this.retryAfter = Number(options.retryAfter || 0);
    }
  }

  function requestHeaders(prefer = "") {
    const headers = {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (prefer) headers.Prefer = prefer;
    return headers;
  }

  async function request(path, options = {}) {
    if (!enabled) throw new Error("Remote backend is not configured.");
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      method: options.method || "GET",
      headers: requestHeaders(options.prefer),
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const detail = await response.text();
      let payload = null;
      try {
        payload = detail ? JSON.parse(detail) : null;
      } catch {
        // PostgREST can return plain text for proxy-level failures.
      }
      throw new BackendError(
        payload?.message || `Remote request failed (${response.status}).`,
        {
          code: payload?.code || "remote_error",
          status: response.status,
        },
      );
    }
    if (response.status === 204) return null;
    const responseBody = await response.text();
    return responseBody ? JSON.parse(responseBody) : null;
  }

  async function rpc(name, parameters = {}) {
    const payload = await request(`rpc/${name}`, {
      method: "POST",
      body: parameters,
    });
    if (payload?.ok === false) {
      throw new BackendError(payload.message || "请求暂时无法完成。", {
        code: payload.error,
        retryAfter: payload.retryAfter,
      });
    }
    return payload;
  }

  function mapNote(row) {
    return {
      id: row.note_id,
      questionId: row.question_id,
      answerId: row.answer_id,
      direction: row.direction,
      question: row.question,
      answer: row.answer,
      createdAt: row.published_at,
      featured: Boolean(row.featured),
      answerCount: Number(row.answer_count || 1),
    };
  }

  function mapQuestion(row) {
    return {
      id: row.id,
      direction: row.direction,
      askerRole: row.asker_role,
      targetRole: row.target_role,
      body: row.body,
      answerCount: Number(row.answer_count || 0),
      createdAt: row.created_at,
      status: row.status,
      authorSessionId: "remote",
    };
  }

  async function loadContent() {
    const [noteRows, questionRows] = await Promise.all([
      request("wall_notes?select=*&order=published_at.desc&limit=100"),
      request("question_pool?select=*&order=answer_count.asc,created_at.asc&limit=100"),
    ]);
    return {
      notes: noteRows.map(mapNote),
      questions: questionRows.map(mapQuestion),
    };
  }

  async function loadNote(noteId) {
    const id = typeof noteId === "string" ? noteId.trim() : "";
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) return null;
    const rows = await request(`wall_notes?select=*&note_id=eq.${encodeURIComponent(id)}&limit=1`);
    return rows.length ? mapNote(rows[0]) : null;
  }

  async function loadNotes(noteIds) {
    const ids = [...new Set(
      (Array.isArray(noteIds) ? noteIds : [])
        .map((noteId) => (typeof noteId === "string" ? noteId.trim() : ""))
        .filter((noteId) => /^[A-Za-z0-9_-]{1,128}$/.test(noteId)),
    )].slice(0, 120);
    if (!ids.length) return [];
    const filter = ids.map(encodeURIComponent).join(",");
    const rows = await request(`wall_notes?select=*&note_id=in.(${filter})&limit=${ids.length}`);
    return rows.map(mapNote);
  }

  async function loadRuntimeStatus() {
    const status = await rpc("public_runtime_status");
    return {
      schemaVersion: Number(status?.schemaVersion || 0),
      submissionsPaused: Boolean(status?.submissionsPaused),
      readOnly: Boolean(status?.readOnly),
      emergencyLockdown: Boolean(status?.emergencyLockdown),
      publicMessage: typeof status?.publicMessage === "string" ? status.publicMessage : "",
    };
  }

  async function createQuestion({ authorSessionId, authorRole, body, anonymous }) {
    const result = await rpc("submit_question", {
      p_session_id: authorSessionId,
      p_author_role: authorRole,
      p_body: body,
      p_anonymous: anonymous,
    });
    return {
      id: result.id,
      direction: authorRole === "adult" ? "adult_to_child" : "child_to_adult",
      askerRole: authorRole,
      targetRole: authorRole === "adult" ? "child" : "adult",
      body,
      answerCount: 0,
      createdAt: result.createdAt || new Date().toISOString(),
      status: result.status || "pending",
      authorSessionId,
      receipt: result.receipt,
    };
  }

  async function createAnswer({ questionId, authorSessionId, authorRole, body, anonymous }) {
    const result = await rpc("submit_answer", {
      p_session_id: authorSessionId,
      p_question_id: questionId,
      p_author_role: authorRole,
      p_body: body,
      p_anonymous: anonymous,
    });
    return {
      id: result.id,
      questionId,
      status: result.status || "pending",
      createdAt: result.createdAt || new Date().toISOString(),
      receipt: result.receipt,
    };
  }

  async function createReport({ noteId, reporterSessionId, reason = "other" }) {
    return rpc("submit_report", {
      p_session_id: reporterSessionId,
      p_note_id: noteId,
      p_reason: reason,
    });
  }

  async function getSubmissionStatus(receipt) {
    return rpc("get_submission_status", { p_receipt: receipt });
  }

  async function resubmitQuestion({ receipt, body, anonymous }) {
    return rpc("resubmit_question", {
      p_receipt: receipt,
      p_body: body,
      p_anonymous: anonymous,
    });
  }

  async function resubmitAnswer({ receipt, body, anonymous }) {
    return rpc("resubmit_answer", {
      p_receipt: receipt,
      p_body: body,
      p_anonymous: anonymous,
    });
  }

  globalThis.QuestionWallBackend = Object.freeze({
    enabled,
    experienceMode: false,
    loadContent,
    loadNote,
    loadNotes,
    loadRuntimeStatus,
    createQuestion,
    createAnswer,
    createReport,
    getSubmissionStatus,
    resubmitQuestion,
    resubmitAnswer,
  });
})();
