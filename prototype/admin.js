(function initializeModerationConsole() {
  "use strict";

  const config = globalThis.QUESTION_WALL_CONFIG || {};
  const supabaseUrl = String(config.supabaseUrl || "").replace(/\/$/, "");
  const supabaseAnonKey = String(config.supabaseAnonKey || "");
  const sessionKey = "question-wall-admin-session";
  const pageSize = 50;
  const maxPhotoBytes = 20 * 1024 * 1024;
  const maxPhotoDimension = 2048;
  const maxEncodedPhotoBytes = 7.5 * 1024 * 1024;
  const photoOutputQuality = 0.84;
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
    adminRole: document.getElementById("admin-role"),
    runtimeIndicator: document.getElementById("runtime-indicator"),
    runtimeBanner: document.getElementById("runtime-banner"),
    runtimeBannerTitle: document.getElementById("runtime-banner-title"),
    runtimeBannerMessage: document.getElementById("runtime-banner-message"),
    runtimeOpenButton: document.getElementById("runtime-open-button"),
    runtimeTab: document.getElementById("runtime-tab"),
    refreshButton: document.getElementById("refresh-button"),
    logoutButton: document.getElementById("logout-button"),
    summaryQuestions: document.getElementById("summary-questions"),
    summaryAnswers: document.getElementById("summary-answers"),
    summaryReports: document.getElementById("summary-reports"),
    summaryPublished: document.getElementById("summary-published"),
    summaryPhotoNotes: document.getElementById("summary-photo-notes"),
    tabCountQuestions: document.getElementById("tab-count-questions"),
    tabCountAnswers: document.getElementById("tab-count-answers"),
    tabCountReports: document.getElementById("tab-count-reports"),
    tabCountPhotoNotes: document.getElementById("tab-count-photo-notes"),
    tabs: [...document.querySelectorAll(".queue-tab")],
    workspace: document.querySelector(".workspace"),
    workspaceEyebrow: document.getElementById("workspace-eyebrow"),
    workspaceTitle: document.getElementById("workspace-title"),
    contentSearch: document.getElementById("content-search"),
    contentTypeField: document.getElementById("content-type-field"),
    contentType: document.getElementById("content-type"),
    contentStatusField: document.getElementById("content-status-field"),
    contentStatus: document.getElementById("content-status"),
    photoStatusField: document.getElementById("photo-status-field"),
    photoStatus: document.getElementById("photo-status"),
    workspaceLoading: document.getElementById("workspace-loading"),
    workspaceEmpty: document.getElementById("workspace-empty"),
    workspaceError: document.getElementById("workspace-error"),
    contentList: document.getElementById("content-list"),
    loadMoreButton: document.getElementById("load-more-button"),
    photoCapturePanel: document.getElementById("photo-capture-panel"),
    photoCaptureStage: document.getElementById("photo-capture-stage"),
    photoEmptyState: document.getElementById("photo-empty-state"),
    photoPreview: document.getElementById("photo-preview"),
    photoProcessing: document.getElementById("photo-processing"),
    photoCameraInput: document.getElementById("photo-camera-input"),
    photoGalleryInput: document.getElementById("photo-gallery-input"),
    photoCameraButton: document.getElementById("photo-camera-button"),
    photoGalleryButton: document.getElementById("photo-gallery-button"),
    photoEditActions: document.getElementById("photo-edit-actions"),
    photoFileMeta: document.getElementById("photo-file-meta"),
    photoMetadataForm: document.getElementById("photo-metadata-form"),
    photoDirection: document.getElementById("photo-direction"),
    photoQuestionText: document.getElementById("photo-question-text"),
    photoAnswerText: document.getElementById("photo-answer-text"),
    photoAltText: document.getElementById("photo-alt-text"),
    photoInternalNote: document.getElementById("photo-internal-note"),
    photoSafetyCheck: document.getElementById("photo-safety-check"),
    photoQuestionCount: document.getElementById("photo-question-count"),
    photoAnswerCount: document.getElementById("photo-answer-count"),
    photoAltCount: document.getElementById("photo-alt-count"),
    photoNoteCount: document.getElementById("photo-note-count"),
    photoCaptureStatus: document.getElementById("photo-capture-status"),
    photoSubmitButton: document.getElementById("photo-submit-button"),
    runtimePanel: document.getElementById("runtime-panel"),
    runtimeForm: document.getElementById("runtime-form"),
    runtimeSubmissionsPaused: document.getElementById("runtime-submissions-paused"),
    runtimeReadOnly: document.getElementById("runtime-read-only"),
    runtimeEmergencyLockdown: document.getElementById("runtime-emergency-lockdown"),
    runtimePublicMessage: document.getElementById("runtime-public-message"),
    runtimeMessageCount: document.getElementById("runtime-message-count"),
    runtimeUpdatedAt: document.getElementById("runtime-updated-at"),
    runtimeFormStatus: document.getElementById("runtime-form-status"),
    runtimeSaveButton: document.getElementById("runtime-save-button"),
    reasonDialog: document.getElementById("reason-dialog"),
    reasonForm: document.getElementById("reason-form"),
    reasonEyebrow: document.getElementById("reason-eyebrow"),
    reasonTitle: document.getElementById("reason-title"),
    reasonLabel: document.getElementById("reason-label"),
    reasonInput: document.getElementById("reason-input"),
    reasonHint: document.getElementById("reason-hint"),
    reasonCount: document.getElementById("reason-count"),
    reasonError: document.getElementById("reason-error"),
    reasonConfirm: document.getElementById("reason-confirm"),
    photoEditDialog: document.getElementById("photo-edit-dialog"),
    photoEditForm: document.getElementById("photo-edit-form"),
    photoEditDirection: document.getElementById("photo-edit-direction"),
    photoEditQuestion: document.getElementById("photo-edit-question"),
    photoEditAnswer: document.getElementById("photo-edit-answer"),
    photoEditAlt: document.getElementById("photo-edit-alt"),
    photoEditNote: document.getElementById("photo-edit-note"),
    photoEditError: document.getElementById("photo-edit-error"),
    photoEditSave: document.getElementById("photo-edit-save"),
    emergencyDialog: document.getElementById("emergency-dialog"),
    emergencyForm: document.getElementById("emergency-form"),
    emergencyAck: document.getElementById("emergency-ack"),
    toast: document.getElementById("admin-toast"),
  };

  const state = {
    session: null,
    profile: null,
    summary: {},
    runtimeSettings: null,
    view: "questions",
    rows: [],
    hasMore: false,
    search: "",
    contentType: "questions",
    contentStatus: "",
    photoStatus: "pending",
    photoFile: null,
    photoSource: "",
    photoPreviewUrl: "",
    photoRotation: 0,
    photoDraft: null,
    photoSubmitting: false,
    photoNotesAvailable: false,
    photoPreviewUrls: new Map(),
    pendingPhotoEdit: null,
    pendingAction: null,
    pendingRuntimeSettings: null,
    sessionRefreshPromise: null,
    workspaceRefreshPromise: null,
    workspaceRefreshQueued: false,
    loadMorePromise: null,
    settingsSavePromise: null,
    workspaceRequestId: 0,
    sessionEpoch: 0,
    sessionAbortController: typeof AbortController === "function" ? new AbortController() : null,
    searchTimer: null,
    toastTimer: null,
  };

  const viewLabels = {
    questions: ["审核队列", "待审问题"],
    answers: ["审核队列", "待审回答"],
    reports: ["风险处置", "未处理举报"],
    content: ["内容运营", "内容管理"],
    photo_capture: ["实体便签", "照片采集"],
    photo_notes: ["实体便签", "照片审核"],
    history: ["权限审计", "操作记录"],
    runtime: ["站点安全", "运营开关"],
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

  function sessionRequestSignal() {
    return state.sessionAbortController?.signal;
  }

  function assertSessionEpoch(epoch) {
    if (epoch !== state.sessionEpoch || !state.session) {
      const error = new Error("登录会话已结束。");
      error.code = "session_ended";
      throw error;
    }
  }

  function clearSession() {
    state.sessionEpoch += 1;
    state.sessionAbortController?.abort();
    state.sessionAbortController = typeof AbortController === "function" ? new AbortController() : null;
    state.session = null;
    state.profile = null;
    state.summary = {};
    state.runtimeSettings = null;
    state.rows = [];
    state.hasMore = false;
    state.photoNotesAvailable = false;
    state.photoPreviewUrls.clear();
    state.pendingPhotoEdit = null;
    state.pendingAction = null;
    state.pendingRuntimeSettings = null;
    setPhotoCaptureBusy(false);
    state.workspaceRequestId += 1;
    state.workspaceRefreshQueued = false;
    state.workspaceRefreshPromise = null;
    state.loadMorePromise = null;
    state.sessionRefreshPromise = null;
    state.settingsSavePromise = null;
    resetPhotoSelection({ resetForm: true });
    elements.contentList.replaceChildren();
    [elements.reasonDialog, elements.photoEditDialog, elements.emergencyDialog].forEach((modal) => {
      if (modal?.open) modal.close();
    });
    elements.adminIdentity.textContent = "";
    elements.adminRole.textContent = "";
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
    if (state.sessionRefreshPromise) return state.sessionRefreshPromise;
    const sessionEpoch = state.sessionEpoch;

    state.sessionRefreshPromise = (async () => {
      const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ refresh_token: state.session.refreshToken }),
        signal: sessionRequestSignal(),
      });
      assertSessionEpoch(sessionEpoch);
      if (!response.ok) {
        clearSession();
        throw new Error("登录会话已失效，请重新登录。");
      }

      const payload = await response.json();
      assertSessionEpoch(sessionEpoch);
      saveSession({
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token,
        expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000,
      });
      return state.session;
    })();

    try {
      return await state.sessionRefreshPromise;
    } finally {
      state.sessionRefreshPromise = null;
    }
  }

  async function rpc(name, body = {}, retry = true) {
    const sessionEpoch = state.sessionEpoch;
    await refreshSession();
    assertSessionEpoch(sessionEpoch);
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: apiHeaders(state.session.accessToken),
      body: JSON.stringify(body),
      signal: sessionRequestSignal(),
    });
    assertSessionEpoch(sessionEpoch);

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

  async function photoMediaRequest(body, retry = true) {
    const sessionEpoch = state.sessionEpoch;
    await refreshSession();
    assertSessionEpoch(sessionEpoch);
    const response = await fetch(`${supabaseUrl}/functions/v1/photo-note-media`, {
      method: "POST",
      headers: apiHeaders(state.session.accessToken),
      body: JSON.stringify(body),
      signal: sessionRequestSignal(),
    });
    assertSessionEpoch(sessionEpoch);

    if (response.status === 401 && retry) {
      await refreshSession(true);
      return photoMediaRequest(body, false);
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      const error = new Error(payload.message || `照片服务请求失败（${response.status}）`);
      error.status = response.status;
      error.code = payload.error || payload.code || "photo_media_error";
      throw error;
    }
    return payload;
  }

  function normalizePhotoNote(row) {
    if (!row || typeof row !== "object") return null;
    return {
      id: row.id,
      status: row.status || "draft",
      direction: row.direction || "",
      questionText: row.questionText ?? row.question_text ?? "",
      answerText: row.answerText ?? row.answer_text ?? "",
      altText: row.altText ?? row.alt_text ?? "",
      internalNote: row.internalNote ?? row.internal_note ?? "",
      rotationDegrees: Number(row.rotationDegrees ?? row.rotation_degrees ?? 0),
      stagingObjectPath: row.stagingObjectPath ?? row.staging_object_path ?? "",
      publicObjectPath: row.publicObjectPath ?? row.public_object_path ?? "",
      publicUrl: row.publicUrl ?? row.public_url ?? row.mediaUrl ?? row.media_url ?? "",
      mimeType: row.mimeType ?? row.mime_type ?? "",
      fileSizeBytes: Number(row.fileSizeBytes ?? row.file_size_bytes ?? 0),
      width: Number(row.width || 0),
      height: Number(row.height || 0),
      featured: Boolean(row.featured),
      createdAt: row.createdAt ?? row.created_at ?? null,
      updatedAt: row.updatedAt ?? row.updated_at ?? null,
      moderatedAt: row.moderatedAt ?? row.moderated_at ?? null,
      moderationReason: row.moderationReason ?? row.moderation_reason ?? "",
      publishedAt: row.publishedAt ?? row.published_at ?? null,
    };
  }

  function encodeStoragePath(path) {
    return String(path || "")
      .split("/")
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join("/");
  }

  function publicPhotoUrl(path) {
    const encodedPath = encodeStoragePath(path);
    return encodedPath ? `${supabaseUrl}/storage/v1/object/public/photo-note-public/${encodedPath}` : "";
  }

  const photoNoteBackend = Object.freeze({
    async list({ status = null, search = null, limit = pageSize, offset = 0 } = {}) {
      const rows = await rpc("admin_list_photo_notes", {
        p_status: status || null,
        p_search: search || null,
        p_limit: limit,
        p_offset: offset,
      });
      return (Array.isArray(rows) ? rows : []).map(normalizePhotoNote).filter(Boolean);
    },
    async createDraft(metadata) {
      const payload = await photoMediaRequest({ action: "createDraft", ...metadata });
      return { note: normalizePhotoNote(payload.note), upload: payload.upload || null };
    },
    async upload(upload, blob) {
      if (!upload?.signedUrl) throw new Error("没有取得安全上传地址，请重新提交。");
      let uploadUrl;
      try {
        uploadUrl = new URL(upload.signedUrl, `${supabaseUrl}/`);
      } catch {
        throw new Error("安全上传地址无效，请重新提交。");
      }
      if (uploadUrl.origin !== new URL(supabaseUrl).origin) {
        throw new Error("安全上传地址与当前项目不匹配，已停止上传。");
      }
      const response = await fetch(uploadUrl.href, {
        method: "PUT",
        headers: { "Content-Type": blob.type || "image/jpeg" },
        body: blob,
        signal: sessionRequestSignal(),
      });
      if (!response.ok) throw new Error(`照片上传失败（${response.status}），请重试。`);
    },
    async completeDraft(id, dimensions, metadata) {
      const payload = await photoMediaRequest({
        action: "completeDraft",
        id,
        width: dimensions.width,
        height: dimensions.height,
        ...metadata,
      });
      return normalizePhotoNote(payload.note);
    },
    async preview(id) {
      const payload = await photoMediaRequest({ action: "preview", id });
      return payload.preview || null;
    },
    async get(id) {
      return normalizePhotoNote(await rpc("admin_get_photo_note", { p_id: id }));
    },
    async refreshUpload(id) {
      const payload = await photoMediaRequest({ action: "refreshUpload", id });
      return payload.upload || null;
    },
    async update(id, patch) {
      const row = await rpc("admin_update_photo_note", { p_id: id, p_patch: patch });
      return normalizePhotoNote(Array.isArray(row) ? row[0] : row);
    },
    async moderate(id, action, reason = "") {
      if (action === "approve" || action === "publish") {
        const payload = await photoMediaRequest({ action: "publish", id });
        return normalizePhotoNote(payload.note);
      }
      if (action === "hide") {
        const payload = await photoMediaRequest({ action: "hide", id, reason: reason || null });
        if (payload.mediaRemoved === false) {
          const error = new Error("内容已下架，但公开图片清理尚未完成，请稍后复核。");
          error.code = "media_cleanup_pending";
          error.stateChanged = true;
          throw error;
        }
        return normalizePhotoNote(payload.note);
      }
      const row = await rpc("admin_moderate_photo_note", {
        p_id: id,
        p_action: action,
        p_reason: reason || null,
        p_public_object_path: null,
      });
      return normalizePhotoNote(Array.isArray(row) ? row[0] : row);
    },
    async cleanupHiddenMedia(id) {
      return photoMediaRequest({ action: "removeHiddenPublicMedia", id });
    },
    async hideReportedPhoto(reportId, reason = "") {
      return photoMediaRequest({
        action: "hideReportedPhoto",
        reportId,
        reason: reason || null,
      });
    },
  });

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
    const accessToken = state.session?.accessToken || "";
    clearSession();
    showLogin();
    if (accessToken) {
      await fetch(`${supabaseUrl}/auth/v1/logout`, {
        method: "POST",
        headers: apiHeaders(accessToken),
      }).catch(() => null);
    }
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

  function isOwner() {
    return state.profile?.role === "owner";
  }

  function moderatorRoleLabel(role) {
    return role === "owner" ? "所有者" : "审核员";
  }

  function showDashboard() {
    elements.loginView.hidden = true;
    elements.dashboardView.hidden = false;
    elements.adminIdentity.textContent = state.profile?.email || "管理员";
    elements.adminRole.textContent = moderatorRoleLabel(state.profile?.role);
    elements.adminRole.dataset.role = state.profile?.role || "reviewer";
    elements.runtimeTab.hidden = !isOwner();
    elements.runtimeOpenButton.hidden = !isOwner();
    if (!isOwner() && state.view === "runtime") state.view = "questions";
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
    return role === "adult" ? "大朋友" : "小朋友";
  }

  function directionLabel(direction) {
    if (direction === "adult_to_child") return "大朋友问 · 小朋友答";
    if (direction === "child_to_adult") return "小朋友问 · 大朋友答";
    return "方向待补充";
  }

  function normalizeRuntimeSettings(value) {
    if (!value || typeof value !== "object") return null;
    return {
      submissionsPaused: Boolean(value.submissionsPaused),
      readOnly: Boolean(value.readOnly),
      emergencyLockdown: Boolean(value.emergencyLockdown),
      publicMessage: typeof value.publicMessage === "string" ? value.publicMessage : "",
      updatedAt: value.updatedAt || null,
    };
  }

  function runtimeDisplayState(settings = state.runtimeSettings) {
    if (!settings) {
      return {
        key: "unknown",
        shortLabel: "状态未知",
        title: "站点状态暂不可用",
        message: "刷新后仍无法读取时，请检查运营控制迁移。",
      };
    }
    if (settings.emergencyLockdown) {
      return {
        key: "emergency",
        shortLabel: "应急隐藏",
        title: "维护 / 应急隐藏已启用",
        message: settings.publicMessage || "公开内容和参与入口当前均已关闭。",
      };
    }
    if (settings.readOnly) {
      return {
        key: "readonly",
        shortLabel: "全站只读",
        title: "全站只读已启用",
        message: settings.publicMessage || "访客可以浏览，但不能提交内容。",
      };
    }
    if (settings.submissionsPaused) {
      return {
        key: "paused",
        shortLabel: "投稿暂停",
        title: "新投稿已暂停",
        message: settings.publicMessage || "浏览与举报保持可用，问题和回答暂不可提交。",
      };
    }
    return {
      key: "normal",
      shortLabel: "运行正常",
      title: "站点运行正常",
      message: settings.publicMessage || "公开浏览和投稿入口均可使用。",
    };
  }

  function setRuntimeFormDisabled(disabled) {
    [
      elements.runtimeSubmissionsPaused,
      elements.runtimeReadOnly,
      elements.runtimeEmergencyLockdown,
      elements.runtimePublicMessage,
      elements.runtimeSaveButton,
    ].forEach((control) => {
      control.disabled = disabled;
    });
  }

  function renderRuntimeSettings() {
    const settings = state.runtimeSettings;
    const display = runtimeDisplayState(settings);
    elements.runtimeIndicator.dataset.state = display.key;
    elements.runtimeIndicator.textContent = display.shortLabel;
    elements.runtimeBanner.dataset.state = display.key;
    elements.runtimeBannerTitle.textContent = display.title;
    elements.runtimeBannerMessage.textContent = display.message;

    if (!settings) {
      elements.runtimeUpdatedAt.textContent = "尚未读取到运行设置";
      setRuntimeFormDisabled(true);
      return;
    }

    elements.runtimeSubmissionsPaused.checked = settings.submissionsPaused;
    elements.runtimeReadOnly.checked = settings.readOnly;
    elements.runtimeEmergencyLockdown.checked = settings.emergencyLockdown;
    elements.runtimePublicMessage.value = settings.publicMessage;
    elements.runtimeMessageCount.textContent = String(settings.publicMessage.length);
    elements.runtimeUpdatedAt.textContent = settings.updatedAt
      ? `最近更新 ${formatDate(settings.updatedAt)}`
      : "尚无更新时间";
    setRuntimeFormDisabled(!isOwner() || Boolean(state.settingsSavePromise));
  }

  function statusLabel(status) {
    return {
      pending: "待审核",
      draft: "未提交",
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
    if (options.photoNoteId) button.dataset.photoNoteId = options.photoNoteId;
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
      container.append(actionButton("关闭回答", "close", options), actionButton("应急隐藏", "hide", { ...options, className: "is-danger" }));
    } else if (row.status === "closed") {
      container.append(
        actionButton("重新开放", "reopen", { ...options, className: "is-approve" }),
        actionButton("应急隐藏", "hide", { ...options, className: "is-danger" }),
      );
    } else if (["hidden", "rejected"].includes(row.status)) {
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
        actionButton("应急隐藏", "hide", { ...options, className: "is-danger" }),
      );
    } else if (["hidden", "rejected"].includes(row.status)) {
      container.append(actionButton("重新发布", "publish", { ...options, className: "is-approve" }));
    }
  }

  function appendPhotoNoteActions(container, row) {
    const options = { entityType: "photo_note", entityId: row.id };
    container.append(actionButton("核对文字", "edit_photo", options));
    if (row.status === "pending") {
      container.append(
        actionButton("通过并发布", "approve", { ...options, className: "is-approve" }),
        actionButton("驳回", "reject", { ...options, className: "is-danger" }),
      );
    } else if (row.status === "published") {
      container.append(
        actionButton(row.featured ? "取消精选" : "设为精选", row.featured ? "unfeature" : "feature", options),
        actionButton("下架", "hide", { ...options, className: "is-danger" }),
      );
    } else if (row.status === "hidden") {
      if (row.publicObjectPath) {
        container.append(actionButton("重试清理公开图片", "cleanup_media", { ...options, className: "is-danger" }));
      }
      container.append(actionButton("重新发布", "publish", { ...options, className: "is-approve" }));
    }
  }

  function formatFileSize(value) {
    const bytes = Number(value || 0);
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  async function resolvePhotoPreviewUrl(row) {
    if (row.publicUrl) return row.publicUrl;
    if (row.status === "published" && row.publicObjectPath) return publicPhotoUrl(row.publicObjectPath);
    const cached = state.photoPreviewUrls.get(row.id);
    if (cached?.url && cached.expiresAt > Date.now() + 15_000) return cached.url;
    if (cached?.promise) return cached.promise;

    const sessionEpoch = state.sessionEpoch;
    const promise = photoNoteBackend.preview(row.id).then((preview) => {
      assertSessionEpoch(sessionEpoch);
      if (!preview?.url) throw new Error("没有可用的照片预览。");
      const entry = {
        url: preview.url,
        expiresAt: Date.now() + Math.max(30, Number(preview.expiresIn || 600)) * 1000,
      };
      state.photoPreviewUrls.set(row.id, entry);
      return entry.url;
    }).catch((error) => {
      if (state.photoPreviewUrls.get(row.id)?.promise === promise) {
        state.photoPreviewUrls.delete(row.id);
      }
      throw error;
    });
    state.photoPreviewUrls.set(row.id, { promise });
    return promise;
  }

  function loadPhotoPreview(row, frame, image, fallback) {
    resolvePhotoPreviewUrl(row).then((url) => {
      if (!frame.isConnected) return;
      image.addEventListener("load", () => {
        frame.classList.remove("is-loading", "is-error");
        fallback.hidden = true;
        image.hidden = false;
      }, { once: true });
      image.addEventListener("error", () => {
        frame.classList.remove("is-loading");
        frame.classList.add("is-error");
        image.hidden = true;
        fallback.hidden = false;
        fallback.textContent = "照片暂时无法显示，可刷新后重试";
      }, { once: true });
      image.src = url;
    }).catch(() => {
      if (!frame.isConnected) return;
      frame.classList.remove("is-loading");
      frame.classList.add("is-error");
      fallback.textContent = "预览读取失败，可刷新后重试";
    });
  }

  function renderPhotoNote(row) {
    const item = createElement("article", "review-item photo-review-item");
    const media = createElement("div", "photo-review-media is-loading");
    const image = document.createElement("img");
    image.alt = row.altText || "实体便签照片";
    image.loading = "lazy";
    image.hidden = true;
    const fallback = createElement("span", "", "正在取得安全预览…");
    media.append(image, fallback);
    loadPhotoPreview(row, media, image, fallback);

    const main = createElement("div", "review-item-main");
    const meta = createElement("div", "review-meta");
    metaText(meta, formatDate(row.createdAt));
    metaText(meta, formatFileSize(row.fileSizeBytes));
    if (row.width && row.height) metaText(meta, `${row.width} × ${row.height}`);
    if (row.featured) metaText(meta, "精选内容");
    const tags = createElement("div", "review-tags");
    tags.append(statusBadge(row.status), directionBadge(row.direction));
    const transcript = createElement("div", "photo-transcript-grid");
    const question = createElement("p");
    question.append(createElement("strong", "", "问"), document.createTextNode(row.questionText || "未录入"));
    const answer = createElement("p");
    answer.append(createElement("strong", "", "答"), document.createTextNode(row.answerText || "未录入"));
    transcript.append(question, answer);
    const altText = createElement("p", "photo-alt-text", `图片描述：${row.altText || "未录入"}`);
    main.append(meta, tags, transcript, altText);
    if (row.internalNote) main.append(createElement("p", "photo-alt-text", `内部备注：${row.internalNote}`));
    if (row.moderationReason) {
      const note = createElement("p", "moderation-note");
      note.append(createElement("strong", "", "处理原因"), document.createTextNode(row.moderationReason));
      main.append(note);
    }

    const actions = createElement("div", "review-actions");
    appendPhotoNoteActions(actions, row);
    item.append(media, main, actions);
    return item;
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
    if (row.moderationReason) {
      const note = createElement("p", "moderation-note");
      note.append(createElement("strong", "", "处理原因"), document.createTextNode(row.moderationReason));
      main.append(note);
    }

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
    if (row.moderationReason) {
      const note = createElement("p", "moderation-note");
      note.append(createElement("strong", "", "处理原因"), document.createTextNode(row.moderationReason));
      main.append(note);
    }

    const actions = createElement("div", "review-actions");
    appendAnswerActions(actions, row, queueMode);
    item.append(main, actions);
    return item;
  }

  function renderReport(row) {
    const isPhoto = row.noteKind === "photo";
    const item = createElement("article", `review-item${isPhoto ? " photo-review-item" : ""}`);
    if (isPhoto) {
      const media = createElement("div", "photo-review-media is-loading");
      const image = document.createElement("img");
      image.alt = row.altText || "被举报的实体便签照片";
      image.loading = "lazy";
      image.hidden = true;
      const fallback = createElement("span", "", "正在取得安全预览…");
      media.append(image, fallback);
      loadPhotoPreview({
        id: row.photoNoteId,
        status: row.answerStatus,
        publicObjectPath: row.publicObjectPath,
      }, media, image, fallback);
      item.append(media);
    }
    const main = createElement("div", "review-item-main");
    const meta = createElement("div", "review-meta");
    metaText(meta, formatDate(row.createdAt));
    metaText(meta, isPhoto ? "实体便签照片" : "文字便签");
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
      photoNoteId: row.photoNoteId || "",
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
    const settingsSnapshot = row.entityType === "settings" ? row.snapshot?.next : null;
    const settingsSummary = settingsSnapshot
      ? [
          settingsSnapshot.emergencyLockdown ? "应急隐藏" : "",
          settingsSnapshot.readOnly ? "全站只读" : "",
          settingsSnapshot.submissionsPaused ? "暂停投稿" : "",
        ].filter(Boolean).join("、") || "正常运行"
      : "";
    const title = createElement(
      "p",
      "review-title",
      settingsSummary ? `运行设置：${settingsSummary}` : row.snapshot?.body || row.reason || "状态处理",
    );
    const change = createElement("div", "history-change");
    if (!settingsSummary) {
      change.append(
        createElement("span", "", statusLabel(row.previousStatus || "-")),
        createElement("span", "history-arrow", "→"),
        createElement("span", "", statusLabel(row.nextStatus || "-")),
      );
    }
    if (row.reason) change.append(createElement("span", "", `说明：${row.reason}`));
    main.append(meta, title);
    if (change.childNodes.length) main.append(change);
    item.append(main);
    return item;
  }

  function renderRows() {
    elements.contentList.replaceChildren();
    elements.workspaceLoading.hidden = true;
    elements.workspaceError.hidden = true;
    elements.photoCapturePanel.hidden = state.view !== "photo_capture";
    if (state.view === "photo_capture") {
      elements.runtimePanel.hidden = true;
      elements.contentList.hidden = true;
      elements.workspaceEmpty.hidden = true;
      elements.loadMoreButton.hidden = true;
      return;
    }
    if (state.view === "runtime") {
      elements.runtimePanel.hidden = false;
      elements.contentList.hidden = true;
      elements.workspaceEmpty.hidden = true;
      elements.loadMoreButton.hidden = true;
      renderRuntimeSettings();
      return;
    }

    elements.runtimePanel.hidden = true;
    elements.contentList.hidden = false;
    elements.workspaceEmpty.hidden = state.rows.length > 0;
    elements.loadMoreButton.hidden = !state.hasMore || !state.rows.length;
    if (!state.rows.length) return;

    const fragment = document.createDocumentFragment();
    state.rows.forEach((row) => {
      if (state.view === "questions") fragment.append(renderQuestion(row, true));
      else if (state.view === "answers") fragment.append(renderAnswer(row, true));
      else if (state.view === "reports") fragment.append(renderReport(row));
      else if (state.view === "photo_notes") fragment.append(renderPhotoNote(row));
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
    const pendingPhotoNotes = summary.pendingPhotoNotes ?? summary.pending_photo_notes ?? 0;
    elements.summaryPhotoNotes.textContent = String(pendingPhotoNotes);
    elements.tabCountQuestions.textContent = String(summary.pendingQuestions || 0);
    elements.tabCountAnswers.textContent = String(summary.pendingAnswers || 0);
    elements.tabCountReports.textContent = String(summary.openReports || 0);
    elements.tabCountPhotoNotes.textContent = String(pendingPhotoNotes);
  }

  function updateViewChrome() {
    const [eyebrow, title] = viewLabels[state.view];
    elements.workspaceEyebrow.textContent = eyebrow;
    elements.workspaceTitle.textContent = title;
    elements.tabs.forEach((tab) => {
      if (["photo_capture", "photo_notes"].includes(tab.dataset.view)) {
        tab.hidden = !state.photoNotesAvailable;
      }
      if (tab.dataset.view === state.view) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });

    const showSearch = !["reports", "history", "runtime", "photo_capture"].includes(state.view);
    elements.contentSearch.closest("label").hidden = !showSearch;
    elements.contentSearch.placeholder = state.view === "photo_notes" ? "搜索照片转写" : "搜索问题或回答";
    elements.contentTypeField.hidden = state.view !== "content";
    elements.contentStatusField.hidden = state.view !== "content";
    elements.photoStatusField.hidden = state.view !== "photo_notes";
    if (state.view === "content") rebuildContentStatusOptions();
    elements.runtimePanel.hidden = state.view !== "runtime";
    elements.photoCapturePanel.hidden = state.view !== "photo_capture";
    if (!["runtime", "photo_capture"].includes(state.view)) elements.contentList.hidden = false;
  }

  async function loadSummary() {
    return rpc("admin_dashboard");
  }

  async function loadRuntimeSettings() {
    return normalizeRuntimeSettings(await rpc("admin_get_runtime_settings"));
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
    } else if (viewState.view === "photo_notes") {
      return photoNoteBackend.list({
        status: viewState.photoStatus || null,
        search,
        limit: pageSize,
        offset,
      });
    } else if (["runtime", "photo_capture"].includes(viewState.view)) {
      return [];
    } else if (viewState.contentType === "questions") {
      return rpc("admin_list_questions", { p_status: viewState.contentStatus || null, p_search: search, p_limit: pageSize, p_offset: offset });
    } else {
      return rpc("admin_list_answers", { p_status: viewState.contentStatus || null, p_search: search, p_limit: pageSize, p_offset: offset });
    }
  }

  function snapshotViewState() {
    return {
      view: state.view,
      search: state.search,
      contentType: state.contentType,
      contentStatus: state.contentStatus,
      photoStatus: state.photoStatus,
    };
  }

  function setWorkspaceBusy(isBusy) {
    elements.refreshButton.disabled = isBusy;
    elements.refreshButton.textContent = isBusy ? "刷新中…" : "刷新";
    elements.workspace.setAttribute("aria-busy", String(isBusy));
  }

  function handleWorkspaceError(error) {
    elements.workspaceLoading.hidden = true;
    elements.workspaceError.hidden = false;
    elements.workspaceError.textContent = error.message || "审核数据读取失败。";
    if (error.status === 401 || error.status === 403) {
      state.workspaceRefreshQueued = false;
      clearSession();
      showLogin();
      setLoginStatus("当前账号没有审核权限。", true);
    }
  }

  async function performWorkspaceRefresh(requestId) {
    const viewState = snapshotViewState();
    try {
      const [summary, rows, runtimeSettings] = await Promise.all([
        loadSummary(),
        loadCurrentView(viewState),
        loadRuntimeSettings(),
      ]);
      if (requestId !== state.workspaceRequestId) return;

      state.summary = summary || {};
      state.photoNotesAvailable = Object.hasOwn(state.summary, "pendingPhotoNotes") ||
        Object.hasOwn(state.summary, "pending_photo_notes");
      state.rows = Array.isArray(rows) ? rows : [];
      state.hasMore = state.rows.length === pageSize && !["runtime", "photo_capture"].includes(viewState.view);
      state.runtimeSettings = runtimeSettings;
      updateViewChrome();
      renderSummary();
      renderRuntimeSettings();
      renderRows();
    } catch (error) {
      if (requestId !== state.workspaceRequestId) return;
      handleWorkspaceError(error);
    }
  }

  function refreshWorkspace() {
    state.workspaceRequestId += 1;
    state.workspaceRefreshQueued = true;
    elements.workspaceError.hidden = true;
    elements.workspaceEmpty.hidden = true;
    elements.loadMoreButton.hidden = true;
    if (!["runtime", "photo_capture"].includes(state.view)) {
      elements.runtimePanel.hidden = true;
      elements.photoCapturePanel.hidden = true;
      elements.contentList.hidden = false;
      elements.contentList.replaceChildren();
      elements.workspaceLoading.hidden = false;
    } else if (state.view === "photo_capture") {
      elements.runtimePanel.hidden = true;
      elements.photoCapturePanel.hidden = false;
      elements.contentList.hidden = true;
      elements.workspaceLoading.hidden = true;
    } else {
      elements.contentList.hidden = true;
      elements.workspaceLoading.hidden = true;
      elements.runtimePanel.hidden = false;
      elements.photoCapturePanel.hidden = true;
    }

    if (state.workspaceRefreshPromise) return state.workspaceRefreshPromise;

    setWorkspaceBusy(true);
    state.workspaceRefreshPromise = (async () => {
      while (state.workspaceRefreshQueued && state.session) {
        state.workspaceRefreshQueued = false;
        const requestId = state.workspaceRequestId;
        await performWorkspaceRefresh(requestId);
      }
    })().finally(() => {
      state.workspaceRefreshPromise = null;
      setWorkspaceBusy(false);
    });

    return state.workspaceRefreshPromise;
  }

  function loadMoreRows() {
    if (state.workspaceRefreshPromise || state.loadMorePromise || !state.hasMore || ["runtime", "photo_capture"].includes(state.view)) {
      return state.loadMorePromise || state.workspaceRefreshPromise || Promise.resolve();
    }

    const requestId = ++state.workspaceRequestId;
    const viewState = snapshotViewState();
    const offset = state.rows.length;
    elements.loadMoreButton.disabled = true;
    elements.loadMoreButton.textContent = "正在加载…";

    state.loadMorePromise = (async () => {
      try {
        const rows = await loadCurrentView(viewState, offset);
        if (requestId !== state.workspaceRequestId) return;
        const nextRows = Array.isArray(rows) ? rows : [];
        state.rows.push(...nextRows);
        state.hasMore = nextRows.length === pageSize;
        renderRows();
      } catch (error) {
        if (requestId === state.workspaceRequestId) {
          showToast(error.message || "更多内容加载失败。", true);
        }
      }
    })().finally(() => {
      state.loadMorePromise = null;
      elements.loadMoreButton.disabled = false;
      elements.loadMoreButton.textContent = "加载更多";
    });

    return state.loadMorePromise;
  }

  function actionNeedsReason(action) {
    return ["reject", "hide", "resolve", "dismiss", "hide_and_resolve"].includes(action);
  }

  function actionRequiresReason(action) {
    return action === "reject";
  }

  function openReasonDialog(action) {
    state.pendingAction = action;
    const label = {
      reject: "驳回内容",
      hide: "应急隐藏内容",
      resolve: "解决举报",
      dismiss: "忽略举报",
      hide_and_resolve: "下架便签并解决举报",
    }[action.action] || "确认处理";
    const required = actionRequiresReason(action.action);
    elements.reasonEyebrow.textContent = action.entityType === "report"
      ? "举报处置"
      : action.entityType === "photo_note" ? "照片审核" : "内容审核";
    elements.reasonTitle.textContent = label;
    elements.reasonConfirm.textContent = label;
    elements.reasonLabel.textContent = required ? "驳回原因（必填）" : "处理说明（建议填写）";
    elements.reasonHint.textContent = required
      ? "原因会反馈给提交者，并写入操作日志。"
      : "建议记录判断依据，内容会写入操作日志。";
    elements.reasonInput.placeholder = required ? "请说明未通过的具体原因和修改方向" : "记录风险、判断依据或后续动作";
    elements.reasonInput.required = required;
    elements.reasonInput.setCustomValidity("");
    elements.reasonInput.value = "";
    elements.reasonCount.textContent = "0";
    elements.reasonError.textContent = "";
    elements.reasonDialog.showModal();
    window.setTimeout(() => elements.reasonInput.focus(), 30);
  }

  async function executeAction(action, reason = "") {
    const item = action.sourceItem?.isConnected ? action.sourceItem : null;
    const buttons = item ? [...item.querySelectorAll("button")] : [];
    item?.setAttribute("aria-busy", "true");
    buttons.forEach((button) => { button.disabled = true; });
    try {
      if (action.entityType === "question") {
        await rpc("admin_moderate_question", { p_id: action.entityId, p_action: action.action, p_reason: reason || null });
      } else if (action.entityType === "answer") {
        await rpc("admin_moderate_answer", { p_id: action.entityId, p_action: action.action, p_reason: reason || null });
      } else if (action.entityType === "photo_note") {
        if (action.action === "cleanup_media") {
          await photoNoteBackend.cleanupHiddenMedia(action.entityId);
        } else {
          await photoNoteBackend.moderate(action.entityId, action.action, reason);
        }
      } else {
        if (action.action === "hide_and_resolve" && action.photoNoteId) {
          const result = await photoNoteBackend.hideReportedPhoto(action.entityId, reason);
          if (result?.mediaRemoved === false) {
            showToast("内容已下架，但公开图片清理未确认，请在照片审核中复核。", true);
            await refreshWorkspace();
            return;
          }
        } else {
          await rpc("admin_resolve_report", { p_id: action.entityId, p_action: action.action, p_note: reason || null });
        }
      }
      showToast("处理已保存并写入操作记录。");
      await refreshWorkspace();
    } catch (error) {
      if (error.stateChanged) {
        showToast(error.message, true);
        await refreshWorkspace();
      } else if (["23514", "P0002", "40001", "PGRST116"].includes(error.code) || error.status === 409) {
        showToast("内容状态已经变化，列表已刷新。", true);
        await refreshWorkspace();
      } else {
        showToast(error.message || "处理失败，请刷新后重试。", true);
        buttons.forEach((button) => { button.disabled = false; });
      }
    } finally {
      item?.removeAttribute("aria-busy");
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
      photoNoteId: button.dataset.photoNoteId || "",
      sourceItem: button.closest(".review-item"),
    };
    if (action.entityType === "photo_note" && action.action === "edit_photo") {
      openPhotoEditDialog(action);
      return;
    }
    if (actionNeedsReason(action.action)) openReasonDialog(action);
    else executeAction(action);
  }

  function openPhotoEditDialog(action) {
    const row = state.rows.find((candidate) => candidate.id === action.entityId);
    if (!row) {
      showToast("这张照片已不在当前列表，请刷新后重试。", true);
      return;
    }
    state.pendingPhotoEdit = { action, row };
    elements.photoEditDirection.value = row.direction;
    elements.photoEditQuestion.value = row.questionText;
    elements.photoEditAnswer.value = row.answerText;
    elements.photoEditAlt.value = row.altText;
    elements.photoEditNote.value = row.internalNote;
    elements.photoEditError.textContent = "";
    elements.photoEditSave.disabled = false;
    elements.photoEditDialog.showModal();
    window.setTimeout(() => elements.photoEditQuestion.focus(), 30);
  }

  function readPhotoEditForm() {
    return {
      direction: elements.photoEditDirection.value,
      questionText: elements.photoEditQuestion.value.trim(),
      answerText: elements.photoEditAnswer.value.trim(),
      altText: elements.photoEditAlt.value.trim(),
      internalNote: elements.photoEditNote.value.trim(),
    };
  }

  async function savePhotoEdit() {
    const pending = state.pendingPhotoEdit;
    if (!pending || !elements.photoEditForm.reportValidity()) return;
    const patch = readPhotoEditForm();
    if (!patch.questionText || !patch.answerText || !patch.altText) {
      elements.photoEditError.textContent = "问题、回答和图片描述都需要填写。";
      return;
    }

    elements.photoEditSave.disabled = true;
    elements.photoEditSave.textContent = "保存中…";
    elements.photoEditError.textContent = "";
    try {
      const updated = await photoNoteBackend.update(pending.row.id, patch);
      const rowIndex = state.rows.findIndex((row) => row.id === pending.row.id);
      if (rowIndex >= 0) state.rows[rowIndex] = updated || { ...state.rows[rowIndex], ...patch };
      state.pendingPhotoEdit = null;
      elements.photoEditDialog.close();
      renderRows();
      showToast("照片转写信息已保存。请确认无误后再发布。");
    } catch (error) {
      elements.photoEditError.textContent = error.message || "照片信息保存失败，请重试。";
    } finally {
      elements.photoEditSave.disabled = false;
      elements.photoEditSave.textContent = "保存信息";
    }
  }

  function setPhotoCaptureStatus(message, isError = false) {
    elements.photoCaptureStatus.textContent = message;
    elements.photoCaptureStatus.classList.toggle("is-error", isError);
  }

  function updatePhotoPreviewTransform() {
    const rotation = ((state.photoRotation % 360) + 360) % 360;
    const quarterTurn = rotation === 90 || rotation === 270;
    elements.photoPreview.style.transform = `rotate(${rotation}deg) scale(${quarterTurn ? 0.75 : 1})`;
  }

  function resetPhotoSelection({ resetForm = false } = {}) {
    if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl);
    state.photoFile = null;
    state.photoSource = "";
    state.photoPreviewUrl = "";
    state.photoRotation = 0;
    state.photoDraft = null;
    elements.photoCameraInput.value = "";
    elements.photoGalleryInput.value = "";
    elements.photoPreview.removeAttribute("src");
    elements.photoPreview.hidden = true;
    elements.photoPreview.style.transform = "";
    elements.photoEmptyState.hidden = false;
    elements.photoEditActions.hidden = true;
    elements.photoCaptureStage.dataset.state = "empty";
    elements.photoFileMeta.textContent = "";
    setPhotoCaptureStatus("");
    if (resetForm) {
      elements.photoMetadataForm.reset();
      [elements.photoQuestionCount, elements.photoAnswerCount, elements.photoAltCount, elements.photoNoteCount]
        .forEach((counter) => { counter.textContent = "0"; });
    }
  }

  function usePhotoFile(file, source) {
    if (!file) return;
    if (file.type && !file.type.startsWith("image/")) {
      setPhotoCaptureStatus("请选择照片文件。", true);
      return;
    }
    if (file.size > maxPhotoBytes) {
      setPhotoCaptureStatus("照片不能超过 20 MB，请在系统相册中缩小后重试。", true);
      return;
    }
    if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl);
    state.photoFile = file;
    state.photoSource = source;
    state.photoRotation = 0;
    state.photoDraft = null;
    state.photoPreviewUrl = URL.createObjectURL(file);
    elements.photoPreview.src = state.photoPreviewUrl;
    elements.photoPreview.hidden = false;
    elements.photoEmptyState.hidden = true;
    elements.photoEditActions.hidden = false;
    elements.photoCaptureStage.dataset.state = "filled";
    elements.photoFileMeta.textContent = `${source === "camera" ? "相机拍摄" : "相册选择"} · ${formatFileSize(file.size)} · 上传前会自动压缩并清除拍摄信息`;
    updatePhotoPreviewTransform();
    setPhotoCaptureStatus("");
  }

  function loadImageForEncoding(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("这张照片暂时无法读取，请换一张 JPG、PNG 或系统相机照片。"));
      };
      image.src = url;
    });
  }

  function canvasToJpeg(canvas, quality = photoOutputQuality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("照片处理失败，请释放一些设备存储后重试。"));
      }, "image/jpeg", quality);
    });
  }

  async function encodeSelectedPhoto() {
    if (!state.photoFile) throw new Error("请先拍照或从相册选择一张照片。");
    const image = await loadImageForEncoding(state.photoFile);
    const rotation = ((state.photoRotation % 360) + 360) % 360;
    const quarterTurn = rotation === 90 || rotation === 270;
    const rotatedWidth = quarterTurn ? image.naturalHeight : image.naturalWidth;
    const rotatedHeight = quarterTurn ? image.naturalWidth : image.naturalHeight;
    const scale = Math.min(1, maxPhotoDimension / Math.max(rotatedWidth, rotatedHeight));
    const drawWidth = Math.max(1, Math.round(image.naturalWidth * scale));
    const drawHeight = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = quarterTurn ? drawHeight : drawWidth;
    canvas.height = quarterTurn ? drawWidth : drawHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("当前浏览器无法处理照片，请更新浏览器后重试。");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    if (rotation === 90) {
      context.translate(canvas.width, 0);
      context.rotate(Math.PI / 2);
    } else if (rotation === 180) {
      context.translate(canvas.width, canvas.height);
      context.rotate(Math.PI);
    } else if (rotation === 270) {
      context.translate(0, canvas.height);
      context.rotate(-Math.PI / 2);
    }
    context.drawImage(image, 0, 0, drawWidth, drawHeight);
    let blob = await canvasToJpeg(canvas);
    if (blob.size > maxEncodedPhotoBytes) blob = await canvasToJpeg(canvas, 0.68);
    if (blob.size > maxEncodedPhotoBytes) {
      throw new Error("照片处理后仍然过大，请在系统相册中适当裁剪后重试。");
    }
    canvas.width = 1;
    canvas.height = 1;
    return { blob, width: quarterTurn ? drawHeight : drawWidth, height: quarterTurn ? drawWidth : drawHeight };
  }

  function readPhotoMetadata() {
    return {
      direction: elements.photoDirection.value,
      questionText: elements.photoQuestionText.value.trim(),
      answerText: elements.photoAnswerText.value.trim(),
      altText: elements.photoAltText.value.trim(),
      internalNote: elements.photoInternalNote.value.trim(),
      rotationDegrees: 0,
    };
  }

  function setPhotoCaptureBusy(isBusy, label = "确认并提交待审") {
    state.photoSubmitting = isBusy;
    elements.photoSubmitButton.disabled = isBusy;
    elements.photoCameraButton.disabled = isBusy;
    elements.photoGalleryButton.disabled = isBusy;
    elements.photoEditActions.querySelectorAll("button").forEach((button) => { button.disabled = isBusy; });
    elements.photoProcessing.hidden = !isBusy;
    elements.photoSubmitButton.textContent = isBusy ? label : "确认并提交待审";
  }

  async function submitPhotoNote() {
    if (state.photoSubmitting) return;
    if (!state.photoFile) {
      setPhotoCaptureStatus("请先拍下或选择实体便签照片。", true);
      elements.photoCameraButton.focus();
      return;
    }
    if (!elements.photoMetadataForm.reportValidity()) {
      setPhotoCaptureStatus("请补全转写、图片描述和隐私确认。", true);
      return;
    }
    const metadata = readPhotoMetadata();
    if (!metadata.questionText || !metadata.answerText || !metadata.altText) {
      setPhotoCaptureStatus("问题、回答和图片描述都需要填写。", true);
      return;
    }
    const sessionEpoch = state.sessionEpoch;

    setPhotoCaptureBusy(true, "正在处理照片…");
    setPhotoCaptureStatus("正在压缩照片并清除拍摄信息，请不要关闭页面。");
    try {
      let draft = state.photoDraft;
      if (!draft) {
        const encoded = await encodeSelectedPhoto();
        assertSessionEpoch(sessionEpoch);
        const created = await photoNoteBackend.createDraft(metadata);
        assertSessionEpoch(sessionEpoch);
        if (!created.note?.id || !created.upload) throw new Error("待审记录创建失败，请重试。");
        draft = {
          id: created.note.id,
          blob: encoded.blob,
          width: encoded.width,
          height: encoded.height,
          upload: created.upload,
          uploaded: false,
        };
        state.photoDraft = draft;
      }

      if (!draft.uploaded) {
        setPhotoCaptureBusy(true, "正在安全上传…");
        setPhotoCaptureStatus(`正在上传处理后的照片（${formatFileSize(draft.blob.size)}）…`);
        if (!draft.upload?.signedUrl) draft.upload = await photoNoteBackend.refreshUpload(draft.id);
        assertSessionEpoch(sessionEpoch);
        try {
          await photoNoteBackend.upload(draft.upload, draft.blob);
          assertSessionEpoch(sessionEpoch);
        } catch (uploadError) {
          if (sessionEpoch === state.sessionEpoch) draft.upload = null;
          throw uploadError;
        }
        draft.uploaded = true;
        draft.upload = null;
      }

      setPhotoCaptureBusy(true, "正在进入待审队列…");
      setPhotoCaptureStatus("照片已安全上传，正在写入待审队列…");
      let note;
      try {
        note = await photoNoteBackend.completeDraft(
          draft.id,
          { width: draft.width, height: draft.height },
          metadata,
        );
        assertSessionEpoch(sessionEpoch);
      } catch (completeError) {
        const actual = await photoNoteBackend.get(draft.id).catch(() => null);
        assertSessionEpoch(sessionEpoch);
        if (actual?.status !== "pending") throw completeError;
        note = actual;
      }
      if (note?.status !== "pending") throw new Error("照片已保存，但待审状态尚未确认，请刷新审核队列。");
      state.photoDraft = null;
      setPhotoCaptureStatus("已提交，正在打开照片审核队列。");
      showToast("实体便签已进入私有待审队列。");
      resetPhotoSelection({ resetForm: true });
      state.photoStatus = "pending";
      elements.photoStatus.value = "pending";
      selectView("photo_notes");
    } catch (error) {
      if (sessionEpoch !== state.sessionEpoch) return;
      const uploadedHint = state.photoDraft?.uploaded ? "照片已安全上传；再次点提交会继续入审，不会重复上传。" : "照片和已填写文字仍保留在本页。";
      setPhotoCaptureStatus(`${error.message || "提交失败，请重试。"} ${uploadedHint}`, true);
    } finally {
      if (sessionEpoch === state.sessionEpoch) setPhotoCaptureBusy(false);
    }
  }

  function setRuntimeFormStatus(message, isError = false) {
    elements.runtimeFormStatus.textContent = message;
    elements.runtimeFormStatus.classList.toggle("is-error", isError);
  }

  function readRuntimeForm() {
    return {
      submissionsPaused: elements.runtimeSubmissionsPaused.checked,
      readOnly: elements.runtimeReadOnly.checked,
      emergencyLockdown: elements.runtimeEmergencyLockdown.checked,
      publicMessage: elements.runtimePublicMessage.value.trim(),
    };
  }

  function runtimeSettingsEqual(left, right) {
    if (!left || !right) return false;
    return ["submissionsPaused", "readOnly", "emergencyLockdown", "publicMessage"]
      .every((key) => left[key] === right[key]);
  }

  async function saveRuntimeSettings(nextSettings) {
    if (!isOwner()) {
      renderRuntimeSettings();
      showToast("只有所有者可以修改运营开关。", true);
      return;
    }
    if (state.settingsSavePromise) return state.settingsSavePromise;

    state.settingsSavePromise = (async () => {
      setRuntimeFormDisabled(true);
      setRuntimeFormStatus("正在保存并写入操作记录…");
      try {
        const result = await rpc("admin_update_runtime_settings", {
          p_submissions_paused: nextSettings.submissionsPaused,
          p_read_only: nextSettings.readOnly,
          p_emergency_lockdown: nextSettings.emergencyLockdown,
          p_public_message: nextSettings.publicMessage || null,
        });
        state.runtimeSettings = normalizeRuntimeSettings(result);
        renderRuntimeSettings();
        setRuntimeFormStatus("运行设置已保存。即将同步最新状态。");
        showToast(nextSettings.emergencyLockdown ? "应急隐藏已启用。" : "运行设置已更新。");
        await refreshWorkspace();
      } catch (error) {
        const definiteRejection = error.status >= 400 && error.status < 500;
        const authenticationFailure = error.status === 401 || error.status === 403 || error.code === "42501";

        if (definiteRejection) {
          renderRuntimeSettings();
          setRuntimeFormStatus(error.message || "运行设置保存失败。", true);
          showToast(error.message || "运行设置保存失败。", true);
        } else {
          state.runtimeSettings = null;
          renderRuntimeSettings();
          setRuntimeFormStatus("保存结果尚未确认，正在重新读取实际状态…", true);
          showToast("保存结果未知，正在核对实际运行状态。", true);

          try {
            const refreshedSettings = await loadRuntimeSettings();
            if (!refreshedSettings) throw new Error("运行状态响应无效。");
            state.runtimeSettings = refreshedSettings;
            renderRuntimeSettings();
            setRuntimeFormStatus("已重新读取数据库中的实际状态。");
            showToast("已重新读取实际运行状态。");
          } catch (refreshError) {
            state.runtimeSettings = null;
            renderRuntimeSettings();
            setRuntimeFormStatus("保存结果未知，且暂时无法读取实际状态。请恢复网络后刷新。", true);
            showToast("当前状态无法确认，运营开关已锁定。", true);
            if (refreshError.status === 401 || refreshError.status === 403 || refreshError.code === "42501") {
              await refreshWorkspace();
            }
          }
        }

        if (authenticationFailure) {
          await refreshWorkspace();
        }
      }
    })().finally(() => {
      state.settingsSavePromise = null;
      setRuntimeFormDisabled(!isOwner() || !state.runtimeSettings);
    });

    return state.settingsSavePromise;
  }

  function requestRuntimeSave(nextSettings) {
    if (!state.runtimeSettings) {
      setRuntimeFormStatus("尚未读取到当前设置，请先刷新。", true);
      return;
    }
    if (runtimeSettingsEqual(nextSettings, state.runtimeSettings)) {
      setRuntimeFormStatus("没有需要保存的更改。", false);
      return;
    }
    if (nextSettings.emergencyLockdown && !state.runtimeSettings.emergencyLockdown) {
      if (!nextSettings.publicMessage) {
        setRuntimeFormStatus("启用应急隐藏前，请填写面向访客的前台提示。", true);
        elements.runtimePublicMessage.focus();
        return;
      }
      state.pendingRuntimeSettings = nextSettings;
      elements.emergencyAck.checked = false;
      elements.emergencyDialog.showModal();
      window.setTimeout(() => elements.emergencyAck.focus(), 30);
      return;
    }
    void saveRuntimeSettings(nextSettings);
  }

  function selectView(nextView) {
    if (!viewLabels[nextView] || (nextView === "runtime" && !isOwner())) return;
    if (["photo_capture", "photo_notes"].includes(nextView) && !state.photoNotesAvailable) return;
    if (state.view === nextView) return;
    state.view = nextView;
    state.search = "";
    state.rows = [];
    state.hasMore = false;
    elements.contentSearch.value = "";
    updateViewChrome();
    void refreshWorkspace();
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
      selectView(tab.dataset.view);
    });
  });

  elements.contentSearch.addEventListener("input", () => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      state.search = elements.contentSearch.value.trim();
      void refreshWorkspace();
    }, 350);
  });

  elements.contentType.addEventListener("change", () => {
    state.contentType = elements.contentType.value;
    state.contentStatus = "";
    rebuildContentStatusOptions();
    void refreshWorkspace();
  });

  elements.contentStatus.addEventListener("change", () => {
    state.contentStatus = elements.contentStatus.value;
    void refreshWorkspace();
  });

  elements.photoStatus.addEventListener("change", () => {
    state.photoStatus = elements.photoStatus.value;
    void refreshWorkspace();
  });

  elements.photoCameraButton.addEventListener("click", () => {
    if (!state.photoSubmitting) elements.photoCameraInput.click();
  });

  elements.photoGalleryButton.addEventListener("click", () => {
    if (!state.photoSubmitting) elements.photoGalleryInput.click();
  });

  elements.photoCameraInput.addEventListener("change", () => {
    usePhotoFile(elements.photoCameraInput.files?.[0], "camera");
  });

  elements.photoGalleryInput.addEventListener("change", () => {
    usePhotoFile(elements.photoGalleryInput.files?.[0], "gallery");
  });

  elements.photoPreview.addEventListener("load", () => {
    if (!state.photoFile) return;
    const dimensions = elements.photoPreview.naturalWidth && elements.photoPreview.naturalHeight
      ? ` · ${elements.photoPreview.naturalWidth} × ${elements.photoPreview.naturalHeight}`
      : "";
    elements.photoFileMeta.textContent = `${state.photoSource === "camera" ? "相机拍摄" : "相册选择"} · ${formatFileSize(state.photoFile.size)}${dimensions} · 上传前会自动压缩并清除拍摄信息`;
  });

  elements.photoPreview.addEventListener("error", () => {
    setPhotoCaptureStatus("照片预览失败，请换一张 JPG、PNG 或系统相机照片。", true);
  });

  elements.photoEditActions.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-photo-edit]");
    if (!button || state.photoSubmitting) return;
    if (button.dataset.photoEdit === "retake") {
      resetPhotoSelection();
      elements.photoCameraButton.focus();
      return;
    }
    const delta = button.dataset.photoEdit === "rotate-left" ? -90 : 90;
    state.photoRotation = (state.photoRotation + delta + 360) % 360;
    state.photoDraft = null;
    updatePhotoPreviewTransform();
    setPhotoCaptureStatus(`已旋转 ${state.photoRotation}°，提交时会按当前方向保存。`);
  });

  [
    [elements.photoQuestionText, elements.photoQuestionCount],
    [elements.photoAnswerText, elements.photoAnswerCount],
    [elements.photoAltText, elements.photoAltCount],
    [elements.photoInternalNote, elements.photoNoteCount],
  ].forEach(([field, counter]) => {
    field.addEventListener("input", () => {
      counter.textContent = String(field.value.length);
      setPhotoCaptureStatus("");
    });
  });

  elements.photoMetadataForm.addEventListener("change", () => setPhotoCaptureStatus(""));
  elements.photoMetadataForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitPhotoNote();
  });

  elements.refreshButton.addEventListener("click", () => { void refreshWorkspace(); });
  elements.loadMoreButton.addEventListener("click", () => { void loadMoreRows(); });
  elements.logoutButton.addEventListener("click", () => { void signOut(); });
  elements.contentList.addEventListener("click", handleReviewAction);
  elements.runtimeOpenButton.addEventListener("click", () => selectView("runtime"));

  elements.runtimePublicMessage.addEventListener("input", () => {
    elements.runtimeMessageCount.textContent = String(elements.runtimePublicMessage.value.length);
    setRuntimeFormStatus("");
  });

  elements.runtimeForm.addEventListener("change", () => {
    setRuntimeFormStatus("");
  });

  elements.runtimeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    requestRuntimeSave(readRuntimeForm());
  });

  document.querySelector("[data-dialog-cancel]").addEventListener("click", () => {
    state.pendingAction = null;
    elements.reasonDialog.close();
  });

  elements.reasonInput.addEventListener("input", () => {
    elements.reasonCount.textContent = String(elements.reasonInput.value.length);
    elements.reasonError.textContent = "";
    elements.reasonInput.setCustomValidity("");
  });

  elements.reasonDialog.addEventListener("cancel", () => {
    state.pendingAction = null;
  });

  document.querySelector("[data-photo-edit-cancel]").addEventListener("click", () => {
    state.pendingPhotoEdit = null;
    elements.photoEditDialog.close();
  });

  elements.photoEditDialog.addEventListener("cancel", () => {
    state.pendingPhotoEdit = null;
  });

  elements.photoEditForm.addEventListener("input", () => {
    elements.photoEditError.textContent = "";
  });

  elements.photoEditForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void savePhotoEdit();
  });

  elements.reasonForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const action = state.pendingAction;
    const reason = elements.reasonInput.value.trim();
    if (action && actionRequiresReason(action.action) && !reason) {
      elements.reasonError.textContent = "驳回内容前必须填写具体原因。";
      elements.reasonInput.setCustomValidity("请填写驳回原因");
      elements.reasonInput.reportValidity();
      elements.reasonInput.focus();
      return;
    }
    elements.reasonInput.setCustomValidity("");
    state.pendingAction = null;
    elements.reasonDialog.close();
    if (action) void executeAction(action, reason);
  });

  document.querySelector("[data-emergency-cancel]").addEventListener("click", () => {
    state.pendingRuntimeSettings = null;
    elements.emergencyDialog.close();
  });

  elements.emergencyDialog.addEventListener("cancel", () => {
    state.pendingRuntimeSettings = null;
  });

  elements.emergencyForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!elements.emergencyAck.checked) {
      elements.emergencyAck.reportValidity();
      return;
    }
    const nextSettings = state.pendingRuntimeSettings;
    state.pendingRuntimeSettings = null;
    elements.emergencyDialog.close();
    if (nextSettings) void saveRuntimeSettings(nextSettings);
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

  window.addEventListener("beforeunload", () => {
    if (state.photoPreviewUrl) URL.revokeObjectURL(state.photoPreviewUrl);
  });

  start();
})();
