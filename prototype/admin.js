(function initializeModerationConsole() {
  "use strict";

  const config = globalThis.QUESTION_WALL_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || "").replace(/\/$/, "");
  const supabaseAnonKey = String(config.supabaseAnonKey || "");
  const sessionKey = "question-wall-admin-session";
  const pageSize = 50;
  const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const elements = {
    loginView: document.getElementById("login-view"),
    loginForm: document.getElementById("login-form"),
    loginStatus: document.getElementById("login-status"),
    dashboardView: document.getElementById("dashboard-view"),
    adminIdentity: document.getElementById("admin-identity"),
    refreshButton: document.getElementById("refresh-button"),
    logoutButton: document.getElementById("logout-button"),
    summaryQuestions: document.getElementById("summary-questions"),
    summaryAnswers: document.getElementById("summary-answers"),
    summaryReports: document.getElementById("summary-reports"),
    summaryPublished: document.getElementById("summary-published"),
    tabCountQuestions: document.getElementById("tab-count-questions"),
    tabCountAnswers: document.getElementById("tab-count-answers"),
    tabCountReports: document.getElementById("tab-count-reports"),
    tabs: [...document.querySelectorAll(".queue-tab")],
    workspaceEyebrow: document.getElementById("workspace-eyebrow"),
    workspaceTitle: document.getElementById("workspace-title"),
    contentSearch: document.getElementById("content-search"),
    contentTypeField: document.getElementById("content-type-field"),
    contentType: document.getElementById("content-type"),
    contentStatusField: document.getElementById("content-status-field"),
    contentStatus: document.getElementById("content-status"),
    workspaceLoading: document.getElementById("workspace-loading"),
    workspaceEmpty: document.getElementById("workspace-empty"),
    workspaceError: document.getElementById("workspace-error"),
    contentList: document.getElementById("content-list"),
    loadMoreButton: document.getElementById("load-more-button"),
    reasonDialog: document.getElementById("reason-dialog"),
    reasonForm: document.getElementById("reason-form"),
    reasonEyebrow: document.getElementById("reason-eyebrow"),
    reasonTitle: document.getElementById("reason-title"),
    reasonInput: document.getElementById("reason-input"),
    reasonConfirm: document.getElementById("reason-confirm"),
    toast: document.getElementById("admin-toast"),
  };

  const state = {
    session: null,
    profile: null,
    summary: {},
    view: "questions",
    rows: [],
    hasMore: false,
    search: "",
    contentType: "questions",
    contentStatus: "",
    pendingAction: null,
    loading: false,
    refreshPromise: null,
    refreshQueued: false,
    workspaceRequestId: 0,
    searchTimer: null,
    toastTimer: null,
  };

  const viewLabels = {
    questions: ["审核队列", "待审问题"],
    answers: ["审核队列", "待审回答"],
    reports: ["风险处置", "未处理举报"],
    content: ["内容运营", "内容管理"],
    history: ["权限审计", "操作记录"],
  };

  const contentStatusOptions = {
    questions: [
      ["", "全部状态"],
      ["pending", "待审核"],
      ["open", "开放中"],
      ["closed", "已关闭"],
      ["hidden", "已隐藏"],
      ["rejected", "已驳回"],
    ],
    answers: [
      ["", "全部状态"],
      ["pending", "待审核"],
      ["published", "已发布"],
      ["hidden", "已隐藏"],
      ["rejected", "已驳回"],
    ],
  };

  function apiHeaders(accessToken = "") {
    const headers = {
      apikey: supabaseAnonKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return headers;
  }

  function moderationRedirectUrl() {
    return new URL("admin.html", window.location.href).href.split(/[?#]/)[0];
  }

  function readSession() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(sessionKey) || "null");
      if (!parsed?.accessToken || !parsed?.refreshToken) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function saveSession(session) {
    state.session = session;
    sessionStorage.setItem(sessionKey, JSON.stringify(session));
  }

  function clearSession() {
    state.session = null;
    state.profile = null;
    sessionStorage.removeItem(sessionKey);
  }

  function parseAuthRedirect() {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const errorDescription = hash.get("error_description");

    if (errorDescription) {
      setLoginStatus(errorDescription, true);
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    if (!accessToken || !refreshToken) return;

    saveSession({
      accessToken,
      refreshToken,
      expiresAt: Date.now() + Number(hash.get("expires_in") || 3600) * 1000,
    });
    window.history.replaceState(null, "", window.location.pathname);
  }

  async function refreshSession(force = false) {
    if (!state.session) throw new Error("登录会话已失效，请重新登录。");
    if (!force && state.session.expiresAt > Date.now() + 60_000) return state.session;
    if (state.refreshPromise) return state.refreshPromise;

    state.refreshPromise = (async () => {
      const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ refresh_token: state.session.refreshToken }),
      });
      if (!response.ok) {
        clearSession();
        throw new Error("登录会话已失效，请重新登录。");
      }

      const payload = await response.json();
      saveSession({
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
        expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
      });
      return state.session;
    })();

    try {
      return await state.refreshPromise;
    } finally {
      state.refreshPromise = null;
    }
  }

  async function rpc(name, body = {}, retry = true) {
    await refreshSession();
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: apiHeaders(state.session.accessToken),
      body: JSON.stringify(body),
    });

    if (response.status === 401 && retry) {
      await refreshSession(true);
      return rpc(name, body, false);
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const message = payload.message || payload.error_description || `请求失败（${response.status}）`;
      const error = new Error(message);
      error.status = response.status;
      error.code = payload.code || "";
      throw error;
    }

    if (response.status === 204) return null;
    return response.json();
  }

  async function requestMagicLink(email) {
    const redirectTo = encodeURIComponent(moderationRedirectUrl());
    const response = await fetch(`${supabaseUrl}/auth/v1/otp?redirect_to=${redirectTo}`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ email, create_user: false }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.msg || payload.message || "登录链接发送失败，请稍后重试。");
    }
  }

  async function signOut() {
    if (state.session?.accessToken) {
      await fetch(`${supabaseUrl}/auth/v1/logout`, {
        method: "POST",
        headers: apiHeaders(state.session.accessToken),
      }).catch(() => null);
    }
    clearSession();
    showLogin();
  }

  function setLoginStatus(message, isError = false) {
    elements.loginStatus.textContent = message;
    elements.loginStatus.classList.toggle("is-error", isError);
  }

  function showLogin() {
    elements.dashboardView.hidden = true;
    elements.loginView.hidden = false;
    elements.loginForm.querySelector("button").disabled = false;
  }

  function showDashboard() {
    elements.loginView.hidden = true;
    elements.dashboardView.hidden = false;
    elements.adminIdentity.textContent = state.profile?.email || "管理员";
  }

  function showToast(message, isError = false) {
    window.clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle("is-error", isError);
    elements.toast.classList.add("is-visible");
    state.toastTimer = window.setTimeout(() => {
      elements.toast.classList.remove("is-visible", "is-error");
    }, 2800);
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : dateFormatter.format(date);
  }

  function roleLabel(role) {
    return role === "adult" ? "大人" : "小朋友";
  }

  function directionLabel(direction) {
    return direction === "adult_to_child" ? "大人问 · 小朋友答" : "小朋友问 · 大人答";
  }

  function statusLabel(status) {
    return {
      pending: "待审核",
      open: "开放中",
      closed: "已关闭",
      published: "已发布",
      hidden: "已隐藏",
      rejected: "已驳回",
      resolved: "已解决",
      dismissed: "已忽略",
    }[status] || status;
  }

  function createElement(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function rebuildContentStatusOptions() {
    const options = contentStatusOptions[state.contentType] || contentStatusOptions.questions;
    const allowedValues = new Set(options.map(([value]) => value));
    if (!allowedValues.has(state.contentStatus)) state.contentStatus = "";

    elements.contentStatus.replaceChildren(
      ...options.map(([value, label]) => {
        const option = createElement("option", "", label);
        option.value = value;
        return option;
      }),
    );
    elements.contentStatus.value = state.contentStatus;
  }

  function metaText(container, text) {
    if (text) container.append(createElement("span", "", text));
  }

  function statusBadge(status) {
    return createElement("span", `status-badge status-${status}`, statusLabel(status));
  }

  function directionBadge(direction) {
    return createElement("span", "direction-badge", directionLabel(direction));
  }

  function actionButton(label, action, options = {}) {
    const button = createElement("button", `action-button ${options.className || ""}`, label);
    button.type = "button";
    button.dataset.action = action;
    if (options.entityType) button.dataset.entityType = options.entityType;
    if (options.entityId) button.dataset.entityId = options.entityId;
    if (options.answerId) button.dataset.answerId = options.answerId;
    if (options.answerStatus) button.dataset.answerStatus = options.answerStatus;
    return button;
  }

  function appendQuestionActions(container, row, queueMode) {
    const options = { entityType: "question", entityId: row.id };
    if (row.status === "pending") {
      container.append(
        actionButton("通过", "approve", { ...options, className: "is-approve" }),
        actionButton("驳回", "reject", { ...options, className: "is-danger" }),
      );
      return;
    }
    if (queueMode) return;
    if (row.status === "open") {
      container.append(actionButton("关闭回答", "close", options), actionButton("隐藏", "hide", { ...options, className: "is-danger" }));
    } else if (["closed", "hidden", "rejected"].includes(row.status)) {
      container.append(actionButton("重新开放", "reopen", { ...options, className: "is-approve" }));
    }
  }

  function appendAnswerActions(container, row, queueMode) {
    const options = { entityType: "answer", entityId: row.id };
    if (row.status === "pending") {
      container.append(
        actionButton("通过", "approve", { ...options, className: "is-approve" }),
        actionButton("驳回", "reject", { ...options, className: "is-danger" }),
      );
      return;
    }
    if (queueMode) return;
    if (row.status === "published") {
      container.append(
        actionButton(row.featured ? "取消精选" : "设为精选", row.featured ? "unfeature" : "feature", options),
        actionButton("隐藏", "hide", { ...options, className: "is-danger" }),
      );
    } else if (["hidden", "rejected"].includes(row.status)) {
      container.append(actionButton("重新发布", "publish", { ...options, className: "is-approve" }));
    }
  }

  function renderQuestion(row, queueMode = true) {
    const item = createElement("article", "review-item");
    const main = createElement("div", "review-item-main");
    const meta = createElement("div", "review-meta");
    metaText(meta, formatDate(row.createdAt));
    metaText(meta, `${roleLabel(row.authorRole)}提问`);
    metaText(meta, row.anonymous ? "匿名" : "公开身份");
    metaText(meta, `${Number(row.answerCount || 0)} 个公开回答`);
    const title = createElement("p", "review-title", row.body);
    const tags = createElement("div", "review-tags");
    tags.append(statusBadge(row.status), directionBadge(row.direction));
    main.append(meta, title, tags);

    const actions = createElement("div", "review-actions");
    appendQuestionActions(actions, row, queueMode);
    item.append(main, actions);
    return item;
  }

  function renderAnswer(row, queueMode = true) {
    const item = createElement("article", "review-item");
    const main = createElement("div", "review-item-main");
    const meta = createElement("div", "review-meta");
    metaText(meta, formatDate(row.createdAt));
    metaText(meta, `${roleLabel(row.authorRole)}回答`);
    metaText(meta, row.anonymous ? "匿名" : "公开身份");
    if (row.featured) metaText(meta, "精选内容");
    const question = createElement("p", "review-question", `问题：${row.questionBody}`);
    const answer = createElement("p", "review-answer", row.body);
    const tags = createElement("div", "review-tags");
    tags.append(statusBadge(row.status), directionBadge(row.direction));
    main.append(meta, question, answer, tags);

    const actions = createElement("div", "review-actions");
    appendAnswerActions(actions, row, queueMode);
    item.append(main, actions);
    return item;
  }

  function renderReport(row) {
    const item = createElement("article", "review-item");
    const main = createElement("div", "review-item-main");
    const meta = createElement("div", "review-meta");
    metaText(meta, formatDate(row.createdAt));
    metaText(meta, `举报原因：${row.reason}`);
    metaText(meta, `便签状态：${statusLabel(row.answerStatus)}`);
    const question = createElement("p", "review-question", `问题：${row.questionBody}`);
    const answer = createElement("p", "review-answer", row.answerBody);
    const tags = createElement("div", "review-tags");
    tags.append(statusBadge(row.status), directionBadge(row.direction));
    main.append(meta, question, answer, tags);

    const actions = createElement("div", "review-actions");
    const options = {
      entityType: "report",
      entityId: row.id,
      answerId: row.answerId,
      answerStatus: row.answerStatus,
    };
    if (row.answerStatus === "published") {
      actions.append(actionButton("下架并解决", "hide_and_resolve", { ...options, className: "is-danger" }));
    }
    actions.append(
      actionButton("标记已解决", "resolve", { ...options, className: "is-approve" }),
      actionButton("忽略", "dismiss", options),
    );
    item.append(main, actions);
    return item;
  }

  function renderHistory(row) {
    const item = createElement("article", "review-item history-item");
    const main = createElement("div", "review-item-main");
    const meta = createElement("div", "review-meta");
    metaText(meta, formatDate(row.createdAt));
    metaText(meta, `${row.entityType} · ${row.action}`);
    const title = createElement("p", "review-title", row.snapshot?.body || row.reason || "状态处理");
    const change = createElement("div", "history-change");
    change.append(
      createElement("span", "", statusLabel(row.previousStatus || "-")),
      createElement("span", "history-arrow", "→"),
      createElement("span", "", statusLabel(row.nextStatus || "-")),
    );
    if (row.reason) change.append(createElement("span", "", `说明：${row.reason}`));
    main.append(meta, title, change);
    item.append(main);
    return item;
  }

  function renderRows() {
    elements.contentList.replaceChildren();
    elements.workspaceLoading.hidden = true;
    elements.workspaceError.hidden = true;
    elements.workspaceEmpty.hidden = state.rows.length > 0;
    elements.loadMoreButton.hidden = !state.hasMore || !state.rows.length;
    if (!state.rows.length) return;

    const fragment = document.createDocumentFragment();
    state.rows.forEach((row) => {
      if (state.view === "questions") fragment.append(renderQuestion(row, true));
      else if (state.view === "answers") fragment.append(renderAnswer(row, true));
      else if (state.view === "reports") fragment.append(renderReport(row));
      else if (state.view === "history") fragment.append(renderHistory(row));
      else if (state.contentType === "questions") fragment.append(renderQuestion(row, false));
      else fragment.append(renderAnswer(row, false));
    });
    elements.contentList.append(fragment);
  }

  function renderSummary() {
    const summary = state.summary || {};
    elements.summaryQuestions.textContent = String(summary.pendingQuestions || 0);
    elements.summaryAnswers.textContent = String(summary.pendingAnswers || 0);
    elements.summaryReports.textContent = String(summary.openReports || 0);
    elements.summaryPublished.textContent = String(summary.publishedNotes || 0);
    elements.tabCountQuestions.textContent = String(summary.pendingQuestions || 0);
    elements.tabCountAnswers.textContent = String(summary.pendingAnswers || 0);
    elements.tabCountReports.textContent = String(summary.openReports || 0);
  }

  function updateViewChrome() {
    const [eyebrow, title] = viewLabels[state.view];
    elements.workspaceEyebrow.textContent = eyebrow;
    elements.workspaceTitle.textContent = title;
    elements.tabs.forEach((tab) => {
      if (tab.dataset.view === state.view) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });

    const showSearch = state.view !== "reports" && state.view !== "history";
    elements.contentSearch.closest("label").hidden = !showSearch;
    elements.contentTypeField.hidden = state.view !== "content";
    elements.contentStatusField.hidden = state.view !== "content";
    if (state.view === "content") rebuildContentStatusOptions();
  }

  async function loadSummary() {
    return rpc("admin_dashboard");
  }

  async function loadCurrentView(viewState, offset = 0) {
    const search = viewState.search || null;
    if (viewState.view === "questions") {
      return rpc("admin_list_questions", { p_status: "pending", p_search: search, p_limit: pageSize, p_offset: offset });
    } else if (viewState.view === "answers") {
      return rpc("admin_list_answers", { p_status: "pending", p_search: search, p_limit: pageSize, p_offset: offset });
    } else if (viewState.view === "reports") {
      return rpc("admin_list_reports", { p_status: "open", p_limit: pageSize, p_offset: offset });
    } else if (viewState.view === "history") {
      return rpc("admin_list_actions", { p_limit: pageSize, p_offset: offset });
    } else if (viewState.contentType === "questions") {
      return rpc("admin_list_questions", { p_status: viewState.contentStatus || null, p_search: search, p_limit: pageSize, p_offset: offset });
    } else {
      return rpc("admin_list_answers", { p_status: viewState.contentStatus || null, p_search: search, p_limit: pageSize, p_offset: offset });
    }
  }

  async function refreshWorkspace() {
    const requestId = ++state.workspaceRequestId;
    if (state.loading) {
      state.refreshQueued = true;
      return;
    }

    state.loading = true;
    const viewState = {
      view: state.view,
      search: state.search,
      contentType: state.contentType,
      contentStatus: state.contentStatus,
    };
    elements.refreshButton.disabled = true;
    elements.workspaceLoading.hidden = false;
    elements.workspaceEmpty.hidden = true;
    elements.workspaceError.hidden = true;
    elements.loadMoreButton.hidden = true;
    elements.contentList.replaceChildren();

    try {
      const [summary, rows] = await Promise.all([loadSummary(), loadCurrentView(viewState)]);
      if (requestId !== state.workspaceRequestId) return;
      state.summary = summary;
      state.rows = rows;
      state.hasMore = rows.length === pageSize;
      renderSummary();
      renderRows();
    } catch (error) {
      if (requestId !== state.workspaceRequestId) return;
      elements.workspaceLoading.hidden = true;
      elements.workspaceError.hidden = false;
      elements.workspaceError.textContent = error.message || "审核数据读取失败。";
      if (error.status === 401 || error.status === 403) {
        clearSession();
        showLogin();
        setLoginStatus("当前账号没有审核权限。", true);
      }
    } finally {
      state.loading = false;
      elements.refreshButton.disabled = false;
      if (state.refreshQueued) {
        state.refreshQueued = false;
        void refreshWorkspace();
      }
    }
  }

  async function loadMoreRows() {
    if (state.loading || !state.hasMore) return;
    const requestId = ++state.workspaceRequestId;
    const viewState = {
      view: state.view,
      search: state.search,
      contentType: state.contentType,
      contentStatus: state.contentStatus,
    };

    state.loading = true;
    elements.loadMoreButton.disabled = true;
    elements.loadMoreButton.textContent = "正在加载…";
    try {
      const rows = await loadCurrentView(viewState, state.rows.length);
      if (requestId !== state.workspaceRequestId) return;
      state.rows.push(...rows);
      state.hasMore = rows.length === pageSize;
      renderRows();
    } catch (error) {
      if (requestId === state.workspaceRequestId) {
        showToast(error.message || "更多内容加载失败。", true);
      }
    } finally {
      state.loading = false;
      elements.loadMoreButton.disabled = false;
      elements.loadMoreButton.textContent = "加载更多";
      if (state.refreshQueued) {
        state.refreshQueued = false;
        void refreshWorkspace();
      }
    }
  }

  function actionNeedsReason(action) {
    return ["reject", "hide", "resolve", "dismiss", "hide_and_resolve"].includes(action);
  }

  function openReasonDialog(action) {
    state.pendingAction = action;
    const label = {
      reject: "驳回内容",
      hide: "隐藏内容",
      resolve: "解决举报",
      dismiss: "忽略举报",
      hide_and_resolve: "下架便签并解决举报",
    }[action.action] || "确认处理";
    elements.reasonEyebrow.textContent = action.entityType === "report" ? "举报处置" : "内容审核";
    elements.reasonTitle.textContent = label;
    elements.reasonConfirm.textContent = label;
    elements.reasonInput.value = "";
    elements.reasonDialog.showModal();
    window.setTimeout(() => elements.reasonInput.focus(), 30);
  }

  async function executeAction(action, reason = "") {
    const buttons = [...elements.contentList.querySelectorAll("button")];
    buttons.forEach((button) => { button.disabled = true; });
    try {
      if (action.entityType === "question") {
        await rpc("admin_moderate_question", { p_id: action.entityId, p_action: action.action, p_reason: reason || null });
      } else if (action.entityType === "answer") {
        await rpc("admin_moderate_answer", { p_id: action.entityId, p_action: action.action, p_reason: reason || null });
      } else {
        await rpc("admin_resolve_report", { p_id: action.entityId, p_action: action.action, p_note: reason || null });
      }
      showToast("处理已保存并写入操作记录。");
      await refreshWorkspace();
    } catch (error) {
      if (["23514", "P0002"].includes(error.code)) {
        showToast("内容状态已经变化，列表已刷新。", true);
        await refreshWorkspace();
      } else {
        showToast(error.message || "处理失败，请刷新后重试。", true);
        buttons.forEach((button) => { button.disabled = false; });
      }
    }
  }

  function handleReviewAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = {
      action: button.dataset.action,
      entityType: button.dataset.entityType,
      entityId: button.dataset.entityId,
      answerId: button.dataset.answerId || "",
      answerStatus: button.dataset.answerStatus || "",
    };
    if (actionNeedsReason(action.action)) openReasonDialog(action);
    else executeAction(action);
  }

  async function initializeAuthenticatedView() {
    try {
      await refreshSession();
      state.profile = await rpc("admin_whoami");
      showDashboard();
      updateViewChrome();
      await refreshWorkspace();
    } catch (error) {
      clearSession();
      showLogin();
      setLoginStatus(error.status === 403 ? "当前账号没有审核权限。" : error.message, true);
    }
  }

  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(elements.loginForm);
    const email = String(formData.get("email") || "").trim().toLowerCase();
    const button = elements.loginForm.querySelector("button");
    button.disabled = true;
    setLoginStatus("正在发送一次性登录链接…");
    try {
      await requestMagicLink(email);
      setLoginStatus("登录链接已发送，请在邮箱中打开。链接仅可使用一次。");
    } catch (error) {
      setLoginStatus(error.message, true);
      button.disabled = false;
    }
  });

  elements.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      if (state.view === tab.dataset.view) return;
      state.view = tab.dataset.view;
      state.search = "";
      elements.contentSearch.value = "";
      updateViewChrome();
      refreshWorkspace();
    });
  });

  elements.contentSearch.addEventListener("input", () => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      state.search = elements.contentSearch.value.trim();
      refreshWorkspace();
    }, 350);
  });

  elements.contentType.addEventListener("change", () => {
    state.contentType = elements.contentType.value;
    state.contentStatus = "";
    rebuildContentStatusOptions();
    refreshWorkspace();
  });

  elements.contentStatus.addEventListener("change", () => {
    state.contentStatus = elements.contentStatus.value;
    refreshWorkspace();
  });

  elements.refreshButton.addEventListener("click", refreshWorkspace);
  elements.loadMoreButton.addEventListener("click", loadMoreRows);
  elements.logoutButton.addEventListener("click", signOut);
  elements.contentList.addEventListener("click", handleReviewAction);

  document.querySelector("[data-dialog-cancel]").addEventListener("click", () => {
    state.pendingAction = null;
    elements.reasonDialog.close();
  });

  elements.reasonForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const action = state.pendingAction;
    const reason = elements.reasonInput.value.trim();
    state.pendingAction = null;
    elements.reasonDialog.close();
    if (action) executeAction(action, reason);
  });

  async function start() {
    if (!supabaseUrl || !supabaseAnonKey) {
      showLogin();
      elements.loginForm.querySelector("button").disabled = true;
      setLoginStatus("管理后台尚未配置 Supabase 连接。", true);
      return;
    }

    parseAuthRedirect();
    state.session = state.session || readSession();
    if (state.session) await initializeAuthenticatedView();
    else showLogin();
  }

  start();
})();
