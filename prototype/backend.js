(function initializeQuestionWallBackend() {
  const config = globalThis.QUESTION_WALL_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || "").replace(/\/$/, "");
  const supabaseAnonKey = String(config.supabaseAnonKey || "");
  const enabled = Boolean(supabaseUrl && supabaseAnonKey);

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
      throw new Error(`Remote request failed (${response.status}): ${detail.slice(0, 240)}`);
    }
    if (response.status === 204) return null;
    const responseBody = await response.text();
    return responseBody ? JSON.parse(responseBody) : null;
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

  async function createQuestion({ id, authorSessionId, authorRole, body, anonymous }) {
    await request("questions", {
      method: "POST",
      prefer: "return=minimal",
      body: {
        id,
        author_session_id: authorSessionId,
        author_role: authorRole,
        body,
        anonymous,
      },
    });
    return {
      id,
      direction: authorRole === "adult" ? "adult_to_child" : "child_to_adult",
      askerRole: authorRole,
      targetRole: authorRole === "adult" ? "child" : "adult",
      body,
      answerCount: 0,
      createdAt: new Date().toISOString(),
      status: "open",
      authorSessionId,
    };
  }

  async function createAnswer({ id, questionId, authorSessionId, authorRole, body, anonymous }) {
    await request("answers", {
      method: "POST",
      prefer: "return=minimal",
      body: {
        id,
        question_id: questionId,
        author_session_id: authorSessionId,
        author_role: authorRole,
        body,
        anonymous,
      },
    });
    return {
      id,
      questionId,
      status: "published",
      createdAt: new Date().toISOString(),
    };
  }

  async function createReport({ noteId, reporterSessionId }) {
    await request("reports", {
      method: "POST",
      prefer: "return=minimal",
      body: {
        target_type: "note",
        target_id: noteId,
        reporter_session_id: reporterSessionId,
        reason: "other",
      },
    });
  }

  globalThis.QuestionWallBackend = Object.freeze({
    enabled,
    experienceMode: config.experienceMode !== false,
    loadContent,
    createQuestion,
    createAnswer,
    createReport,
  });
})();
