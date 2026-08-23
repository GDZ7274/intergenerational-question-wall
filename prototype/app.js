const STORAGE_KEY = "question-wall-prototype-v1";
const SESSION_KEY = "question-wall-prototype-session";
const SEEN_NOTES_COOKIE_KEY = "question-wall-prototype-seen-v1";
const RECENT_VIEWED_STORAGE_KEY = "question-wall-recent-viewed-v1";
const HISTORY_STATE_KEY = "questionWallNavigation";
const SEEN_NOTES_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;
const SEEN_NOTES_COOKIE_LIMIT = 100;
const RECENT_VIEWED_LIMIT = 60;
const SWIPE_HINT_SESSION_KEY = "question-wall-swipe-hint-seen";
const LANDING_OPENING_SESSION_KEY = "question-wall-opening-seen-v1";
const LANDING_OPENING_DELAY_MS = 2_000;
const WHEEL_GESTURE_COOLDOWN_MS = 420;
const UNSAVED_RECEIPT_SESSION_KEY = "question-wall-unsaved-receipt-v1";
const RUNTIME_POLL_INTERVAL_MS = 20_000;
const FAVORITE_LIMIT = 120;
const PUBLIC_NOTE_VERIFICATION_TTL_MS = RUNTIME_POLL_INTERVAL_MS;
const NOTE_SHARE_IMAGE_CACHE_LIMIT = 4;
const PUBLIC_NOTE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const PHOTO_NOTE_MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024;
const PHOTO_NOTE_MIME_EXTENSIONS = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
});
const BRAND_NAME = "解鸭留言墙";
const BRAND_FULL_TITLE = "【躺倒鸭】解鸭留言墙";
const noteTemplateImageCache = new Map();
const noteShareImageCache = new Map();
const noteSharePreparationPromises = new Map();

const noteExportTemplates = {
  adult_to_child: {
    asset: "assets/note-adult-to-child.webp",
    width: 1200,
    height: 1197,
    ink: "#4b2e18",
    question: { x: 0.097, y: 0.232, width: 0.805, height: 0.27, maxFont: 46, minFont: 30 },
    answer: { x: 0.097, y: 0.658, width: 0.455, height: 0.23, maxFont: 38, minFont: 18 },
  },
  child_to_adult: {
    asset: "assets/note-child-to-adult.webp",
    width: 1198,
    height: 1200,
    ink: "#173c68",
    question: { x: 0.078, y: 0.24, width: 0.535, height: 0.295, maxFont: 45, minFont: 27 },
    answer: { x: 0.078, y: 0.682, width: 0.842, height: 0.218, maxFont: 38, minFont: 18 },
  },
};

const seedNotes = [
  {
    id: "note-01",
    questionId: "question-01",
    answerId: "answer-01",
    direction: "adult_to_child",
    question: "如果大人也要上一节课，你最想教他们什么？",
    answer: "学会好好休息，陪我的时候别一直看手机。",
    createdAt: "2026-08-16T09:30:00+08:00",
    featured: true,
    source: "official",
  },
  {
    id: "note-02",
    questionId: "question-02",
    answerId: "answer-02",
    direction: "child_to_adult",
    question: "你小时候做错事，也会不敢告诉爸爸妈妈吗？",
    answer: "会。我还藏过一张没考好的试卷，那时也很希望有人先问我害不害怕。",
    createdAt: "2026-08-15T18:10:00+08:00",
    featured: true,
    source: "user",
  },
  {
    id: "note-03",
    questionId: "question-03",
    answerId: "answer-03",
    direction: "adult_to_child",
    question: "你希望十年后的世界多一个什么东西？",
    answer: "一种不会让小动物害怕的烟花。",
    createdAt: "2026-08-14T12:00:00+08:00",
    featured: true,
    source: "official",
  },
  {
    id: "note-04",
    questionId: "question-04",
    answerId: "answer-04",
    direction: "child_to_adult",
    question: "为什么大人难过的时候总说没事？",
    answer: "有时是不知道怎么开口。大人也在学习把感受说出来。",
    createdAt: "2026-08-13T20:20:00+08:00",
    featured: true,
    source: "user",
  },
  {
    id: "note-05",
    questionId: "question-05",
    answerId: "answer-05",
    direction: "adult_to_child",
    question: "你觉得大人最容易忘记什么？",
    answer: "忘记自己以前也是小朋友，也会怕黑和不想起床。",
    createdAt: "2026-08-12T11:40:00+08:00",
    featured: false,
    source: "user",
  },
  {
    id: "note-06",
    questionId: "question-06",
    answerId: "answer-06",
    direction: "child_to_adult",
    question: "大人为什么一边说要开心，一边又总是很忙？",
    answer: "因为我们常把责任放在开心前面。谢谢你提醒我，它们不该总是排队。",
    createdAt: "2026-08-11T16:50:00+08:00",
    featured: false,
    source: "official",
  },
  {
    id: "note-07",
    questionId: "question-05",
    answerId: "answer-07",
    direction: "adult_to_child",
    question: "你觉得大人最容易忘记什么？",
    answer: "忘记夸奖不用等到我考一百分。",
    createdAt: "2026-08-10T10:25:00+08:00",
    featured: false,
    source: "user",
  },
  {
    id: "note-08",
    questionId: "question-08",
    answerId: "answer-08",
    direction: "child_to_adult",
    question: "大人可以不做自己不喜欢的工作吗？",
    answer: "可以，但有时要先准备好下一步。重要的是别把不喜欢误当成只能忍耐。",
    createdAt: "2026-08-09T14:05:00+08:00",
    featured: false,
    source: "official",
  },
];

const seedQuestions = [
  {
    id: "pool-01",
    direction: "adult_to_child",
    askerRole: "adult",
    targetRole: "child",
    body: "在你看来，怎样才算真正的勇敢？",
    answerCount: 0,
    createdAt: "2026-08-16T13:20:00+08:00",
    status: "open",
    source: "official",
    authorSessionId: "seed",
  },
  {
    id: "pool-02",
    direction: "child_to_adult",
    askerRole: "child",
    targetRole: "adult",
    body: "大人可以不做自己不喜欢的工作吗？",
    answerCount: 1,
    createdAt: "2026-08-15T10:40:00+08:00",
    status: "open",
    source: "official",
    authorSessionId: "seed",
  },
  {
    id: "pool-03",
    direction: "adult_to_child",
    askerRole: "adult",
    targetRole: "child",
    body: "如果可以重新设计一天的课程表，你会怎么排？",
    answerCount: 2,
    createdAt: "2026-08-14T09:10:00+08:00",
    status: "open",
    source: "user",
    authorSessionId: "seed",
  },
  {
    id: "pool-04",
    direction: "child_to_adult",
    askerRole: "child",
    targetRole: "adult",
    body: "你小时候最舍不得丢掉的一件东西是什么？",
    answerCount: 0,
    createdAt: "2026-08-13T17:35:00+08:00",
    status: "open",
    source: "user",
    authorSessionId: "seed",
  },
  {
    id: "pool-05",
    direction: "adult_to_child",
    askerRole: "adult",
    targetRole: "child",
    body: "当你不开心时，希望大人怎么陪你？",
    answerCount: 1,
    createdAt: "2026-08-12T08:50:00+08:00",
    status: "open",
    source: "user",
    authorSessionId: "seed",
  },
  {
    id: "pool-06",
    direction: "child_to_adult",
    askerRole: "child",
    targetRole: "adult",
    body: "为什么回到家以后，大家还是总在看手机？",
    answerCount: 3,
    createdAt: "2026-08-11T19:25:00+08:00",
    status: "open",
    source: "user",
    authorSessionId: "seed",
  },
];

const backend = globalThis.QuestionWallBackend || { enabled: false, experienceMode: false };
let remoteNotes = [];
let remoteQuestions = [];
let remoteAvailable = false;
let remoteLoadFailed = false;
let validatedFavoriteNoteIds = new Set();
const verifiedPublicNotes = new Map();
const verifiedPublicNoteTimestamps = new Map();
let publicNoteVerificationEpoch = 0;
let nativeFileShareUnavailable = false;
let nativeShareUnavailable = false;
let runtimeStatus = {
  schemaVersion: 0,
  submissionsPaused: false,
  readOnly: false,
  emergencyLockdown: false,
  publicMessage: "",
};

const sessionId = getOrCreateSessionId();
const persisted = loadPersistedState();
syncFavoriteNoteSnapshots({ save: false });
savePersistedState();
const seenNoteIds = loadSeenNoteIds();
const recentViewedNoteIds = loadRecentViewedNoteIds();
const pendingReceiptFallback = loadPendingReceiptFallback();

const ui = {
  route: getRouteFromHash(),
  selectedQuestionId: null,
  mineTab: "questions",
  pendingIntent: null,
  openParticipationAfterRender: false,
  recommendationIds: [],
  recommendationIndex: -1,
  recommendationComplete: false,
  feedMotion: "idle",
  showSwipeHint: shouldShowSwipeHint(),
  landingOpeningActive: shouldPlayLandingOpening(),
  statusSyncing: false,
  editingSubmission: null,
  receiptFallback: pendingReceiptFallback,
};

if (pendingReceiptFallback?.submission) {
  ensureSubmissionInMemory(pendingReceiptFallback.type, pendingReceiptFallback.submission);
}

const app = document.getElementById("app");
const dialog = document.getElementById("note-dialog");
const dialogContent = document.getElementById("note-dialog-content");
const participationDialog = document.getElementById("participation-dialog");
const participationDialogContent = document.getElementById("participation-dialog-content");
const shareDialog = document.getElementById("share-dialog");
const shareDialogContent = document.getElementById("share-dialog-content");
const toast = document.getElementById("toast");
let toastTimer = null;
let suppressClickUntil = 0;
let navigationDepth = 0;
let runtimeSyncPromise = null;
let runtimePollTimer = null;
let landingOpeningTimer = null;
let wheelGestureReadyAt = 0;
let sharePreviewObjectUrl = "";
let sharePreviewBlob = null;

document.addEventListener("DOMContentLoaded", async () => {
  app.addEventListener("click", handleClick);
  app.addEventListener("input", handleInput);
  app.addEventListener("submit", handleSubmit);
  app.addEventListener("touchstart", handleTouchStart, { passive: true });
  app.addEventListener("touchmove", handleTouchMove, { passive: false });
  app.addEventListener("touchend", handleTouchEnd, { passive: false });
  app.addEventListener("touchcancel", handleTouchCancel, { passive: true });
  app.addEventListener("wheel", handleWheel, { passive: false });
  document.addEventListener("keydown", handleKeydown);
  dialog.addEventListener("click", handleDialogClick);
  dialog.addEventListener("cancel", handleDialogCancel);
  participationDialog?.addEventListener("click", handleParticipationDialogClick);
  participationDialog?.addEventListener("cancel", handleParticipationDialogCancel);
  shareDialog?.addEventListener("click", handleShareDialogClick);
  shareDialog?.addEventListener("cancel", handleShareDialogCancel);
  window.addEventListener("beforeunload", handleBeforeUnload);
  prepareInitialRoute();
  if (!backend.enabled) restoreRecentViewedHistory();
  const initialOverlayNoteId = initializeNavigationHistory(getSharedNoteIdFromUrl());
  window.addEventListener("popstate", handlePopState);
  render();
  if (ui.openParticipationAfterRender) {
    ui.openParticipationAfterRender = false;
    openParticipationSheet();
  }
  scheduleLandingOpening();
  if (initialOverlayNoteId && !backend.enabled) openNote(initialOverlayNoteId, { fromHistory: true });

  if (backend.enabled) {
    try {
      await refreshRemoteSnapshot({ resetRecommendations: true });
    } catch (error) {
      handleRemoteUnavailable(error);
      showToast("在线内容暂时不可用，请稍后再试。", true, 3200);
    }
    await refreshSubmissionStatuses({ silent: true, renderAfter: false });
    render();
    if (initialOverlayNoteId) {
      const available = await ensureSharedNoteAvailable(initialOverlayNoteId);
      if (available) openNote(initialOverlayNoteId, { fromHistory: true });
      else if (remoteAvailable) showToast("这张便签已不可见或链接无效。", true, 2800);
    }
    startRuntimeStatusPolling();
  }
});

async function refreshRemoteSnapshot({ resetRecommendations = false } = {}) {
  const [nextRuntimeStatus, content] = await Promise.all([
    backend.loadRuntimeStatus(),
    backend.loadContent(),
  ]);
  runtimeStatus = nextRuntimeStatus;
  remoteNotes = content.notes;
  remoteQuestions = content.questions;
  remoteAvailable = true;
  remoteLoadFailed = false;
  replacePublicNoteVerification(remoteNotes);
  await reconcileRemoteFavorites();

  if (resetRecommendations) {
    restoreRecentViewedHistory();
  }
  ui.recommendationComplete = false;
}

async function refreshRemoteContent({ resetRecommendations = false } = {}) {
  const previousSignature = remoteContentSignature(remoteNotes, remoteQuestions);
  const previousNoteIds = new Set(remoteNotes.map((note) => note.id));
  const recommendationWasComplete = ui.recommendationComplete;
  const content = await backend.loadContent();
  const nextSignature = remoteContentSignature(content.notes, content.questions);
  const contentChanged = previousSignature !== nextSignature;
  remoteNotes = content.notes;
  remoteQuestions = content.questions;
  remoteAvailable = true;
  remoteLoadFailed = false;
  const nextNoteIds = new Set(remoteNotes.map((note) => note.id));
  const removedNoteIds = [...previousNoteIds].filter((id) => !nextNoteIds.has(id));
  purgeUnavailablePublicNotes(removedNoteIds);
  replacePublicNoteVerification(remoteNotes);
  await reconcileRemoteFavorites();

  if (resetRecommendations) {
    restoreRecentViewedHistory();
  } else {
    reconcileRecommendationHistory();
    if (!contentChanged) {
      ui.recommendationComplete = recommendationWasComplete;
    } else if (recommendationWasComplete) {
      loadSeenNoteIds().forEach((id) => seenNoteIds.add(id));
      const newlyAvailableNote = getRecommendedNotes().find(
        (note) =>
          !previousNoteIds.has(note.id) &&
          !seenNoteIds.has(note.id) &&
          !ui.recommendationIds.includes(note.id),
      );
      if (newlyAvailableNote) {
        ui.recommendationIds.push(newlyAvailableNote.id);
        ui.recommendationIndex = ui.recommendationIds.length - 1;
        rememberSeenNote(newlyAvailableNote.id);
        ui.recommendationComplete = false;
      } else {
        ui.recommendationComplete = true;
      }
    }
  }
  return contentChanged;
}

async function ensureSharedNoteAvailable(noteId) {
  const id = normalizePublicNoteId(noteId);
  if (!id) return false;
  if (!backend.enabled) return Boolean(findViewableNote(id));

  const result = await verifyPublicNote(id);
  if (result.status !== "available") return false;
  return true;
}

async function reconcileRemoteFavorites() {
  if (!backend.enabled) return true;
  if (runtimeStatus.emergencyLockdown) {
    clearPublicNoteVerification();
    validatedFavoriteNoteIds = new Set();
    return false;
  }
  const favoriteIds = [...persisted.favorites];
  const liveNotesById = new Map(remoteNotes.map((note) => [note.id, note]));
  validatedFavoriteNoteIds = new Set(
    favoriteIds.filter((id) => liveNotesById.has(id)),
  );
  favoriteIds.forEach((id) => {
    verifiedPublicNotes.delete(id);
    verifiedPublicNoteTimestamps.delete(id);
  });
  validatedFavoriteNoteIds.forEach((id) => markPublicNoteVerified(liveNotesById.get(id)));

  if (!favoriteIds.length) {
    if (persisted.favoriteNotes.length) {
      persisted.favoriteNotes = [];
      savePersistedState();
    }
    return true;
  }
  if (!remoteAvailable || typeof backend.loadNotes !== "function") {
    syncFavoriteNoteSnapshots();
    return false;
  }

  try {
    const verificationEpoch = publicNoteVerificationEpoch;
    const publicNotes = await backend.loadNotes(favoriteIds);
    if (
      verificationEpoch !== publicNoteVerificationEpoch ||
      !remoteAvailable ||
      runtimeStatus.emergencyLockdown
    ) {
      return false;
    }
    const snapshotsById = new Map(
      publicNotes
        .map(createFavoriteNoteSnapshot)
        .filter(Boolean)
        .map((note) => [note.id, note]),
    );
    const nextFavoriteIds = favoriteIds.filter((id) => snapshotsById.has(id));
    const nextSnapshots = nextFavoriteIds.map((id) => snapshotsById.get(id));
    const changed =
      JSON.stringify(nextFavoriteIds) !== JSON.stringify(persisted.favorites) ||
      JSON.stringify(nextSnapshots) !== JSON.stringify(persisted.favoriteNotes);
    persisted.favorites = nextFavoriteIds;
    persisted.favoriteNotes = nextSnapshots;
    validatedFavoriteNoteIds = new Set(nextFavoriteIds);
    publicNotes.forEach((note) => {
      if (validatedFavoriteNoteIds.has(note.id)) markPublicNoteVerified(note);
    });
    if (changed) savePersistedState();
    return true;
  } catch (error) {
    console.warn("Unable to validate saved notes against the public wall.", error);
    syncFavoriteNoteSnapshots();
    return false;
  }
}

function runtimeStatusChanged(previous, next) {
  return ["submissionsPaused", "readOnly", "emergencyLockdown", "publicMessage"]
    .some((key) => previous[key] !== next[key]);
}

function remoteContentSignature(notes, questions) {
  return JSON.stringify([
    (Array.isArray(notes) ? notes : []).map((note) => [
      note.id,
      note.kind === "photo" ? "photo" : "text",
      note.questionId || null,
      note.answerId || null,
      note.photoNoteId || null,
      note.direction,
      note.question,
      note.answer,
      note.createdAt,
      Boolean(note.featured),
      Number(note.answerCount || 0),
      note.kind === "photo" ? normalizePhotoMediaUrl(note.mediaUrl || note.imageUrl) : "",
      note.kind === "photo" ? note.altText || "" : "",
      note.kind === "photo" ? normalizeMediaDimension(note.mediaWidth) : null,
      note.kind === "photo" ? normalizeMediaDimension(note.mediaHeight) : null,
    ]),
    (Array.isArray(questions) ? questions : []).map((question) => [
      question.id,
      question.direction,
      question.askerRole,
      question.targetRole,
      question.body,
      Number(question.answerCount || 0),
      question.createdAt,
      question.status,
    ]),
  ]);
}

function resetRemoteRecommendations() {
  ui.recommendationIds = [];
  ui.recommendationIndex = -1;
  ui.recommendationComplete = false;
}

function purgeUnavailablePublicNotes(noteIds) {
  const removedIds = new Set(
    (Array.isArray(noteIds) ? noteIds : [])
      .map(normalizePublicNoteId)
      .filter(Boolean),
  );
  if (!removedIds.size) return false;

  remoteNotes = remoteNotes.filter((note) => !removedIds.has(note.id));
  removedIds.forEach((id) => {
    verifiedPublicNotes.delete(id);
    verifiedPublicNoteTimestamps.delete(id);
    noteShareImageCache.delete(id);
    noteSharePreparationPromises.delete(id);
  });
  reconcileRecommendationHistory();
  ui.recommendationComplete = false;

  const openDialogNoteId = normalizePublicNoteId(dialog?.dataset?.noteId);
  const overlayNoteId = normalizePublicNoteId(getNavigationSnapshot()?.overlayNoteId);
  if (removedIds.has(openDialogNoteId) || removedIds.has(overlayNoteId)) {
    if (dialog?.open) dialog.close();
    if (dialog?.dataset) delete dialog.dataset.noteId;
    if (dialogContent) dialogContent.innerHTML = "";
    if (overlayNoteId && navigationDepth > 0) {
      window.history.back();
    } else if (overlayNoteId) {
      const url = new URL(window.location.href);
      url.searchParams.delete("note");
      window.history.replaceState(
        createNavigationState(),
        "",
        `${url.pathname}${url.search}#${ui.route}`,
      );
    }
  }

  const sharedNoteId = normalizePublicNoteId(shareDialog?.dataset?.noteId);
  if (removedIds.has(sharedNoteId)) closeShareSheet();
  return true;
}

function handleRemoteUnavailable(error) {
  console.error("Unable to verify the shared question-wall state.", error);
  remoteNotes = [];
  remoteQuestions = [];
  remoteAvailable = false;
  remoteLoadFailed = true;
  validatedFavoriteNoteIds = new Set();
  clearPublicNoteVerification({ clearShareImages: false });
  resetRemoteRecommendations();
}

function markPublicNoteVerified(note, verifiedAt = Date.now()) {
  const id = normalizePublicNoteId(note?.id);
  if (!id) return null;
  const previous = verifiedPublicNotes.get(id);
  if (previous && noteShareContentKey(previous) !== noteShareContentKey(note)) {
    noteShareImageCache.delete(id);
  }
  verifiedPublicNotes.set(id, note);
  verifiedPublicNoteTimestamps.set(id, verifiedAt);
  return note;
}

function replacePublicNoteVerification(notes) {
  publicNoteVerificationEpoch += 1;
  verifiedPublicNotes.clear();
  verifiedPublicNoteTimestamps.clear();
  (Array.isArray(notes) ? notes : []).forEach((note) => markPublicNoteVerified(note));
}

function clearPublicNoteVerification({ clearShareImages = true } = {}) {
  publicNoteVerificationEpoch += 1;
  verifiedPublicNotes.clear();
  verifiedPublicNoteTimestamps.clear();
  if (clearShareImages) noteShareImageCache.clear();
}

function getFreshVerifiedPublicNote(noteId) {
  const id = normalizePublicNoteId(noteId);
  if (!id || runtimeStatus.emergencyLockdown) return null;
  if (backend.enabled && !remoteAvailable) return null;
  const note = verifiedPublicNotes.get(id);
  const verifiedAt = verifiedPublicNoteTimestamps.get(id);
  if (!note || !Number.isFinite(verifiedAt)) return null;
  if (Date.now() - verifiedAt > PUBLIC_NOTE_VERIFICATION_TTL_MS) return null;
  return note;
}

async function syncRuntimeStatus() {
  if (!backend.enabled || runtimeSyncPromise) return runtimeSyncPromise;

  runtimeSyncPromise = (async () => {
    try {
      const previous = runtimeStatus;
      const contentWasAvailable = remoteAvailable;
      const next = await backend.loadRuntimeStatus();
      const changed = runtimeStatusChanged(previous, next);
      let shouldRender = changed || !contentWasAvailable;
      runtimeStatus = next;

      if (next.emergencyLockdown) {
        const enteringLockdown = !previous.emergencyLockdown || !contentWasAvailable;
        if (enteringLockdown) {
          const removedNoteIds = remoteNotes.map((note) => note.id);
          remoteNotes = [];
          remoteQuestions = [];
          remoteAvailable = true;
          remoteLoadFailed = false;
          validatedFavoriteNoteIds = new Set();
          purgeUnavailablePublicNotes(removedNoteIds);
          clearPublicNoteVerification();
          resetRemoteRecommendations();
          shouldRender = true;
        }
      } else {
        try {
          const contentChanged = await refreshRemoteContent({
            resetRecommendations: previous.emergencyLockdown || !contentWasAvailable,
          });
          shouldRender = shouldRender || contentChanged || previous.emergencyLockdown;
        } catch (contentError) {
          if (!contentWasAvailable || previous.emergencyLockdown) {
            if (previous.emergencyLockdown) remoteAvailable = false;
            throw contentError;
          }
          console.warn("Unable to refresh public content; keeping the last verified snapshot.", contentError);
        }
      }

      if (shouldRender) render();
    } catch (error) {
      if (!remoteAvailable) {
        handleRemoteUnavailable(error);
        render();
      } else {
        console.warn("Unable to refresh the question-wall runtime state.", error);
      }
    }
  })().finally(() => {
    runtimeSyncPromise = null;
  });

  return runtimeSyncPromise;
}

function startRuntimeStatusPolling() {
  window.clearInterval(runtimePollTimer);
  runtimePollTimer = window.setInterval(() => {
    if (document.visibilityState === "visible") void syncRuntimeStatus();
  }, RUNTIME_POLL_INTERVAL_MS);
  window.addEventListener("focus", () => { void syncRuntimeStatus(); });
  window.addEventListener("online", () => { void syncRuntimeStatus(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncRuntimeStatus();
  });
}

function getAvailableNotes() {
  if (runtimeStatus.emergencyLockdown) return [];
  if (backend.enabled) return remoteAvailable ? remoteNotes : [];
  return seedNotes;
}

function getAvailableQuestions() {
  if (runtimeStatus.emergencyLockdown) return [];
  if (backend.enabled) return remoteAvailable ? remoteQuestions : [];
  return seedQuestions;
}

function isExperienceMode() {
  return backend.enabled && backend.experienceMode;
}

function submissionsAreDisabled() {
  return Boolean(
    (backend.enabled && !remoteAvailable) ||
      runtimeStatus.emergencyLockdown ||
      runtimeStatus.readOnly ||
      runtimeStatus.submissionsPaused,
  );
}

function reportsAreDisabled() {
  return Boolean(
    (backend.enabled && !remoteAvailable) ||
      runtimeStatus.emergencyLockdown ||
      runtimeStatus.readOnly,
  );
}

function runtimeMessage(fallback = "当前暂时不能提交内容。") {
  if (backend.enabled && !remoteAvailable) {
    return remoteLoadFailed ? "在线服务暂时不可用，请稍后再试。" : "正在确认站点状态，请稍候。";
  }
  return runtimeStatus.publicMessage || fallback;
}

function getOrCreateSessionId() {
  const generated = globalThis.crypto?.randomUUID?.() || `session-${Date.now()}`;
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    localStorage.setItem(SESSION_KEY, generated);
  } catch {
    // The current page can still submit; the server-issued receipt becomes the recovery credential.
  }
  return generated;
}

function loadPersistedState() {
  const fallback = {
    role: null,
    favorites: [],
    favoriteNotes: [],
    myQuestions: [],
    myAnswers: [],
    notifications: [
      {
        id: "welcome",
        title: "问答墙今天有新便签",
        detail: "有些问题正在等一个不同角度的回答。",
        createdAt: new Date().toISOString(),
        read: false,
      },
    ],
    drafts: { ask: { adult: "", child: "" }, answer: {} },
  };

  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed) return fallback;
    const role = parsed.role === "adult" || parsed.role === "child" ? parsed.role : null;
    const parsedDrafts = parsed.drafts || {};
    const legacyAskDraft = typeof parsedDrafts.ask === "string" ? parsedDrafts.ask : "";
    const askDrafts =
      parsedDrafts.ask && typeof parsedDrafts.ask === "object" && !Array.isArray(parsedDrafts.ask)
        ? {
            adult: typeof parsedDrafts.ask.adult === "string" ? parsedDrafts.ask.adult : "",
            child: typeof parsedDrafts.ask.child === "string" ? parsedDrafts.ask.child : "",
          }
        : {
            adult: role === "adult" ? legacyAskDraft : "",
            child: role === "child" ? legacyAskDraft : "",
          };
    const myQuestions = normalizeStoredQuestions(parsed.myQuestions);
    const myAnswers = normalizeStoredAnswers(parsed.myAnswers);
    const favorites = Array.isArray(parsed.favorites)
      ? [...new Set(parsed.favorites.map(normalizePublicNoteId).filter(Boolean))].slice(-FAVORITE_LIMIT)
      : fallback.favorites;
    const favoriteNotesById = new Map(
      normalizeFavoriteNotes(parsed.favoriteNotes).map((note) => [note.id, note]),
    );
    const answerDrafts =
      parsedDrafts.answer && typeof parsedDrafts.answer === "object" && !Array.isArray(parsedDrafts.answer)
        ? Object.fromEntries(Object.entries(parsedDrafts.answer).filter(([, value]) => typeof value === "string"))
        : {};

    return {
      role,
      favorites,
      favoriteNotes: favorites.map((id) => favoriteNotesById.get(id)).filter(Boolean),
      myQuestions,
      myAnswers,
      notifications: Array.isArray(parsed.notifications) ? parsed.notifications : fallback.notifications,
      drafts: {
        ask: askDrafts,
        answer: answerDrafts,
      },
    };
  } catch {
    return fallback;
  }
}

function normalizePublicNoteId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  return PUBLIC_NOTE_ID_PATTERN.test(id) ? id : "";
}

function normalizeFavoriteNotes(value) {
  if (!Array.isArray(value)) return [];
  const notesById = new Map();
  value.forEach((note) => {
    const normalized = createFavoriteNoteSnapshot(note);
    if (!normalized) return;
    notesById.delete(normalized.id);
    notesById.set(normalized.id, normalized);
  });
  return [...notesById.values()].slice(-FAVORITE_LIMIT);
}

function createFavoriteNoteSnapshot(note) {
  if (!note || typeof note !== "object") return null;
  const id = normalizePublicNoteId(note.id);
  const questionId = normalizePublicNoteId(note.questionId);
  const answerId = normalizePublicNoteId(note.answerId);
  const photoNoteId = normalizePublicNoteId(note.photoNoteId);
  const kind = note.kind === "photo" ? "photo" : "text";
  const direction = ["adult_to_child", "child_to_adult"].includes(note.direction) ? note.direction : "";
  const question = truncateNoteText(note.question, kind === "photo" ? 160 : 80);
  const answer = truncateNoteText(note.answer, kind === "photo" ? 320 : 160);
  const mediaUrl = kind === "photo" ? normalizePhotoMediaUrl(note.mediaUrl || note.imageUrl) : "";
  if (
    !id || !direction || !question || !answer ||
    (kind === "text" && (!questionId || !answerId)) ||
    (kind === "photo" && (!photoNoteId || !mediaUrl))
  ) return null;
  return {
    id,
    kind,
    questionId: questionId || null,
    answerId: answerId || null,
    photoNoteId: photoNoteId || null,
    direction,
    question,
    answer,
    createdAt: typeof note.createdAt === "string" ? note.createdAt : new Date().toISOString(),
    featured: Boolean(note.featured),
    answerCount: Math.max(1, Math.min(9999, Number(note.answerCount) || 1)),
    mediaUrl: mediaUrl || null,
    imageUrl: mediaUrl || null,
    altText: kind === "photo" ? truncateNoteText(note.altText, 300) : "",
    mediaWidth: kind === "photo" ? normalizeMediaDimension(note.mediaWidth) : null,
    mediaHeight: kind === "photo" ? normalizeMediaDimension(note.mediaHeight) : null,
  };
}

function normalizePhotoMediaUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const publicPrefix = "/storage/v1/object/public/photo-note-public/";
    const trustedHost = url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
    const trustedPath = url.pathname.startsWith(publicPrefix);
    if (!trustedHost || !trustedPath || url.username || url.password) return "";
    const objectPath = url.pathname.slice(publicPrefix.length);
    const pathSegments = objectPath.split("/");
    if (
      !objectPath ||
      pathSegments.some((segment) => {
        if (!segment || segment === "." || segment === "..") return true;
        try {
          const decoded = decodeURIComponent(segment);
          return !decoded || decoded === "." || decoded === ".." || /[\\/\u0000-\u001f]/.test(decoded);
        } catch {
          return true;
        }
      })
    ) return "";

    const configuredUrl = String(globalThis.QUESTION_WALL_CONFIG?.supabaseUrl || "").trim();
    if (configuredUrl) {
      const configuredOrigin = new URL(configuredUrl).origin;
      if (url.origin !== configuredOrigin) return "";
    }
    return url.href;
  } catch {
    return "";
  }
}

function normalizeMediaDimension(value) {
  const dimension = Number(value);
  return Number.isSafeInteger(dimension) && dimension > 0 && dimension <= 20_000 ? dimension : null;
}

function truncateNoteText(value, limit) {
  if (typeof value !== "string") return "";
  return splitGraphemes(value.trim()).slice(0, limit).join("");
}

function syncFavoriteNoteSnapshots({ save = true } = {}) {
  const liveNotesById = new Map(getAvailableNotes().map((note) => [note.id, note]));
  const storedNotesById = new Map((persisted.favoriteNotes || []).map((note) => [note.id, note]));
  const nextSnapshots = persisted.favorites
    .map((id) => createFavoriteNoteSnapshot(liveNotesById.get(id) || storedNotesById.get(id)))
    .filter(Boolean);
  const changed = JSON.stringify(nextSnapshots) !== JSON.stringify(persisted.favoriteNotes || []);
  persisted.favoriteNotes = nextSnapshots;
  if (changed && save) savePersistedState();
  return changed;
}

function normalizeStoredQuestions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object" && typeof item.body === "string")
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : `question-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      body: item.body,
      direction: item.direction === "adult_to_child" ? "adult_to_child" : "child_to_adult",
      askerRole: item.askerRole === "adult" ? "adult" : "child",
      targetRole: item.targetRole === "child" ? "child" : "adult",
      status: typeof item.status === "string" ? item.status : "pending",
      answerCount: Number.isFinite(Number(item.answerCount)) ? Number(item.answerCount) : 0,
      anonymous: item.anonymous !== false,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : null,
      authorSessionId: typeof item.authorSessionId === "string" ? item.authorSessionId : sessionId,
      receipt: normalizeReceipt(item.receipt),
      rejectionReason: typeof item.rejectionReason === "string" ? item.rejectionReason : "",
      revision: Math.max(1, Number(item.revision || 1)),
      eventIds: normalizeEventIds(item.eventIds),
      latestEvent: normalizeLatestEvent(item.latestEvent),
    }));
}

function normalizeStoredAnswers(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object" && typeof item.body === "string")
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : `answer-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      questionId: typeof item.questionId === "string" ? item.questionId : "",
      questionBody: typeof item.questionBody === "string" ? item.questionBody : "",
      body: item.body,
      role: item.role === "adult" ? "adult" : "child",
      anonymous: item.anonymous !== false,
      status: typeof item.status === "string" ? item.status : "pending",
      createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : null,
      receipt: normalizeReceipt(item.receipt),
      rejectionReason: typeof item.rejectionReason === "string" ? item.rejectionReason : "",
      revision: Math.max(1, Number(item.revision || 1)),
      eventIds: normalizeEventIds(item.eventIds),
      latestEvent: normalizeLatestEvent(item.latestEvent),
    }));
}

function normalizeReceipt(value) {
  const receipt = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[0-9a-f]{64}$/.test(receipt) ? receipt : "";
}

function normalizeEventIds(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((id) => Number(id))
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .slice(-40);
}

function normalizeLatestEvent(value) {
  if (!value || typeof value !== "object" || typeof value.message !== "string") return null;
  return {
    type: typeof value.type === "string" ? value.type : "updated",
    message: value.message,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
  };
}

function savePersistedState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    return true;
  } catch {
    return false;
  }
}

function loadPendingReceiptFallback() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(UNSAVED_RECEIPT_SESSION_KEY));
    const type = parsed?.type === "answer" ? "answer" : parsed?.type === "question" ? "question" : null;
    const receipt = normalizeReceipt(parsed?.receipt);
    if (!type || !receipt || !parsed?.submission) return null;
    const normalized = type === "question"
      ? normalizeStoredQuestions([{ ...parsed.submission, receipt }])[0]
      : normalizeStoredAnswers([{ ...parsed.submission, receipt }])[0];
    return normalized ? { type, receipt, submission: normalized } : null;
  } catch {
    return null;
  }
}

function persistPendingReceiptFallback(fallback) {
  try {
    sessionStorage.setItem(UNSAVED_RECEIPT_SESSION_KEY, JSON.stringify(fallback));
    return true;
  } catch {
    return false;
  }
}

function clearPendingReceiptFallback() {
  try {
    sessionStorage.removeItem(UNSAVED_RECEIPT_SESSION_KEY);
  } catch {
    // The in-memory state is still cleared after the user confirms an external copy.
  }
}

function handleBeforeUnload(event) {
  if (!ui.receiptFallback) return;
  event.preventDefault();
  event.returnValue = "";
}

function ensureSubmissionInMemory(type, submission) {
  const list = type === "answer" ? persisted.myAnswers : persisted.myQuestions;
  const receipt = normalizeReceipt(submission?.receipt);
  const existing = list.find((item) =>
    item.id === submission?.id || (receipt && normalizeReceipt(item.receipt) === receipt));
  if (existing) {
    Object.assign(existing, submission, receipt ? { receipt } : {});
    return existing;
  }
  const stored = { ...submission, ...(receipt ? { receipt } : {}) };
  list.unshift(stored);
  return stored;
}

function submissionReceiptIsPersisted(type, submission) {
  const receipt = normalizeReceipt(submission?.receipt);
  if (!receipt) return false;
  try {
    const storedState = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const list = type === "answer" ? storedState?.myAnswers : storedState?.myQuestions;
    return Array.isArray(list) && list.some((item) =>
      item?.id === submission.id && normalizeReceipt(item.receipt) === receipt);
  } catch {
    return false;
  }
}

function persistSubmissionReceipt(type, submission) {
  return savePersistedState() && submissionReceiptIsPersisted(type, submission);
}

function finishSuccessfulSubmission({
  type,
  submission,
  notification,
  clearDraft,
  remoteSucceeded,
  successMessage,
}) {
  let receiptPersisted = !remoteSucceeded;
  try {
    ensureSubmissionInMemory(type, submission);
    if (remoteSucceeded) receiptPersisted = persistSubmissionReceipt(type, submission);
  } catch {
    receiptPersisted = false;
  }

  try {
    persisted.notifications.unshift(notification);
  } catch {
    // The submission record and server receipt are more important than a local convenience notice.
  }

  try {
    clearDraft();
  } catch {
    // A stale local draft must never turn a successful remote write into a retry prompt.
  }

  const finalStateSaved = savePersistedState();
  if (remoteSucceeded && !receiptPersisted && finalStateSaved) {
    receiptPersisted = submissionReceiptIsPersisted(type, submission);
  }

  ui.mineTab = type === "answer" ? "answers" : "questions";
  if (remoteSucceeded && !receiptPersisted) {
    presentReceiptFallback(type, submission);
    return;
  }

  showToast(successMessage, false, 2800);
  navigate("mine");
}

function presentReceiptFallback(type, submission) {
  const receipt = normalizeReceipt(submission?.receipt);
  const fallback = {
    type: type === "answer" ? "answer" : "question",
    receipt,
    submission: { ...submission, ...(receipt ? { receipt } : {}) },
  };
  ui.receiptFallback = fallback;
  if (receipt) persistPendingReceiptFallback(fallback);
  if (dialog.open) dialog.close();
  render();
  showToast("投稿已经成功，请先保存恢复码。", false, 4200);
}

function loadSeenNoteIds() {
  try {
    const encodedName = `${encodeURIComponent(SEEN_NOTES_COOKIE_KEY)}=`;
    const cookie = document.cookie
      .split("; ")
      .find((item) => item.startsWith(encodedName));
    if (!cookie) return new Set();

    const decoded = decodeURIComponent(cookie.slice(encodedName.length));
    let parsed;
    try {
      parsed = JSON.parse(decoded);
    } catch {
      parsed = decoded.split("~");
    }
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed
        .filter((id) => typeof id === "string")
        .slice(-SEEN_NOTES_COOKIE_LIMIT),
    );
  } catch {
    return new Set();
  }
}

function loadRecentViewedNoteIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_VIEWED_STORAGE_KEY));
    if (!Array.isArray(parsed)) return [];
    const ordered = [];
    parsed.forEach((value) => {
      const id = normalizePublicNoteId(value);
      if (!id) return;
      const previousIndex = ordered.indexOf(id);
      if (previousIndex >= 0) ordered.splice(previousIndex, 1);
      ordered.push(id);
    });
    return ordered.slice(-RECENT_VIEWED_LIMIT);
  } catch {
    return [];
  }
}

function saveRecentViewedNoteIds() {
  try {
    localStorage.setItem(
      RECENT_VIEWED_STORAGE_KEY,
      JSON.stringify(recentViewedNoteIds.slice(-RECENT_VIEWED_LIMIT)),
    );
    return true;
  } catch {
    return false;
  }
}

function rememberRecentViewedNote(noteId) {
  const id = normalizePublicNoteId(noteId);
  if (!id) return;
  const previousIndex = recentViewedNoteIds.indexOf(id);
  if (previousIndex >= 0) recentViewedNoteIds.splice(previousIndex, 1);
  recentViewedNoteIds.push(id);
  if (recentViewedNoteIds.length > RECENT_VIEWED_LIMIT) {
    recentViewedNoteIds.splice(0, recentViewedNoteIds.length - RECENT_VIEWED_LIMIT);
  }
  saveRecentViewedNoteIds();
}

function restoreRecentViewedHistory() {
  const availableIds = new Set(getAvailableNotes().map((note) => note.id));
  const validIds = recentViewedNoteIds.filter((id) => availableIds.has(id));
  const changed = validIds.length !== recentViewedNoteIds.length ||
    validIds.some((id, index) => recentViewedNoteIds[index] !== id);
  recentViewedNoteIds.splice(0, recentViewedNoteIds.length, ...validIds);
  if (changed) saveRecentViewedNoteIds();
  ui.recommendationIds = [...validIds];
  ui.recommendationIndex = -1;
  ui.recommendationComplete = false;
  return validIds;
}

function reconcileRecommendationHistory() {
  const availableIds = new Set(getAvailableNotes().map((note) => note.id));
  const recentValidIds = recentViewedNoteIds.filter((id) => availableIds.has(id));
  if (recentValidIds.length !== recentViewedNoteIds.length) {
    recentViewedNoteIds.splice(0, recentViewedNoteIds.length, ...recentValidIds);
    saveRecentViewedNoteIds();
  }

  const previousCurrentId = ui.recommendationIds[ui.recommendationIndex] || "";
  const validIds = ui.recommendationIds.filter((id, index, all) =>
    availableIds.has(id) && all.indexOf(id) === index,
  );
  if (validIds.length === ui.recommendationIds.length) return validIds;

  ui.recommendationIds = validIds;
  ui.recommendationIndex = previousCurrentId ? validIds.indexOf(previousCurrentId) : -1;
  if (ui.recommendationIndex < 0 && !ui.recommendationComplete) {
    ui.recommendationIndex = -1;
  }
  return validIds;
}

function rememberSeenNote(noteId) {
  if (!noteId) return;

  const latest = loadSeenNoteIds();
  seenNoteIds.forEach((id) => latest.add(id));
  latest.add(noteId);
  seenNoteIds.clear();
  [...latest].slice(-SEEN_NOTES_COOKIE_LIMIT).forEach((id) => seenNoteIds.add(id));

  try {
    const value = encodeURIComponent([...seenNoteIds].join("~"));
    document.cookie = `${encodeURIComponent(SEEN_NOTES_COOKIE_KEY)}=${value}; Max-Age=${SEEN_NOTES_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
  } catch {
    // The in-memory set still prevents repeats for this visit when cookies are unavailable.
  }
  rememberRecentViewedNote(noteId);
}

function shouldShowSwipeHint() {
  try {
    return sessionStorage.getItem(SWIPE_HINT_SESSION_KEY) !== "1";
  } catch {
    return true;
  }
}

function dismissSwipeHint() {
  ui.showSwipeHint = false;
  try {
    sessionStorage.setItem(SWIPE_HINT_SESSION_KEY, "1");
  } catch {
    // The hint can safely reappear on the next visit if session storage is unavailable.
  }
}

function shouldPlayLandingOpening() {
  if (getRouteFromHash() !== "home") return false;
  try {
    return sessionStorage.getItem(LANDING_OPENING_SESSION_KEY) !== "1";
  } catch {
    return true;
  }
}

function scheduleLandingOpening() {
  if (!ui.landingOpeningActive || landingOpeningTimer !== null) return;
  landingOpeningTimer = window.setTimeout(completeLandingOpening, LANDING_OPENING_DELAY_MS);
}

function completeLandingOpening() {
  if (landingOpeningTimer !== null) {
    window.clearTimeout(landingOpeningTimer);
    landingOpeningTimer = null;
  }
  if (!ui.landingOpeningActive) return;

  ui.landingOpeningActive = false;
  try {
    sessionStorage.setItem(LANDING_OPENING_SESSION_KEY, "1");
  } catch {
    // The opening can safely replay next session if storage is unavailable.
  }

  const bodyClasses = document.body?.classList;
  bodyClasses?.remove("is-opening");
  app.querySelector?.(".landing-shell")?.classList.remove("is-opening");
}

function normalizeRoute(route) {
  const allowed = ["home", "wall", "identity", "participate", "ask", "pool", "answer", "mine"];
  if (route === "discover") return "wall";
  return allowed.includes(route) ? route : "wall";
}

function getRouteFromHash() {
  const rawHash = window.location.hash;
  const route = rawHash.replace(/^#\/?/, "");
  if (!rawHash || !route) return "home";
  return normalizeRoute(route);
}

function getSharedNoteIdFromUrl() {
  try {
    return normalizePublicNoteId(new URL(window.location.href).searchParams.get("note"));
  } catch {
    return "";
  }
}

function prepareInitialRoute() {
  if (ui.route === "participate") {
    ui.route = "wall";
    ui.openParticipationAfterRender = true;
    return;
  }
  if (persisted.role) return;

  if (ui.route === "ask") {
    ui.pendingIntent = { type: "ask" };
    ui.route = "identity";
  } else if (ui.route === "pool" || ui.route === "answer") {
    ui.pendingIntent = { type: "answer", questionId: ui.selectedQuestionId || null };
    ui.route = "identity";
  }
}

function getNavigationSnapshot(state = window.history.state) {
  const snapshot = state?.[HISTORY_STATE_KEY];
  return snapshot && typeof snapshot === "object" ? snapshot : null;
}

function createNavigationState({ overlayNoteId = null } = {}) {
  return {
    [HISTORY_STATE_KEY]: {
      route: ui.route,
      depth: navigationDepth,
      selectedQuestionId: ui.selectedQuestionId || null,
      overlayNoteId,
    },
  };
}

function initializeNavigationHistory(initialOverlayNoteId = "") {
  const snapshot = getNavigationSnapshot();
  if (Number.isInteger(snapshot?.depth) && snapshot.depth >= 0) {
    navigationDepth = snapshot.depth;
  }
  if (typeof snapshot?.selectedQuestionId === "string") {
    ui.selectedQuestionId = snapshot.selectedQuestionId;
  }

  const overlayNoteId =
    normalizePublicNoteId(initialOverlayNoteId) || normalizePublicNoteId(snapshot?.overlayNoteId) || null;
  window.history.replaceState(createNavigationState({ overlayNoteId }), "", `#${ui.route}`);
  return overlayNoteId;
}

function navigate(route, options = {}) {
  const { replace = false, preserveIntent = false, ...stateUpdates } = options;
  const nextRoute = normalizeRoute(route);
  if (nextRoute === "participate") {
    if (ui.route === "identity") {
      ui.route = "wall";
      window.history.replaceState(createNavigationState(), "", "#wall");
      render();
    }
    openParticipationSheet();
    return;
  }
  if (nextRoute !== "home" && ui.landingOpeningActive) completeLandingOpening();
  if (ui.route === "identity" && nextRoute !== "identity" && !preserveIntent) {
    ui.pendingIntent = null;
  }

  Object.assign(ui, stateUpdates);
  ui.route = nextRoute;
  const nextHash = `#${nextRoute}`;
  const sameRoute = window.location.hash === nextHash;

  if (replace || sameRoute) {
    window.history.replaceState(createNavigationState(), "", nextHash);
  } else {
    navigationDepth += 1;
    window.history.pushState(createNavigationState(), "", nextHash);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
  render();
}

function goBack(fallbackRoute = "wall") {
  ui.pendingIntent = null;
  if (navigationDepth > 0) {
    window.history.back();
    return;
  }
  navigate(fallbackRoute, { replace: true });
}

function handlePopState(event) {
  const snapshot = getNavigationSnapshot(event.state);
  navigationDepth = Number.isInteger(snapshot?.depth) && snapshot.depth >= 0 ? snapshot.depth : 0;
  ui.route = getRouteFromHash();
  if (ui.route !== "home" && ui.landingOpeningActive) completeLandingOpening();
  ui.pendingIntent = null;
  ui.selectedQuestionId = typeof snapshot?.selectedQuestionId === "string" ? snapshot.selectedQuestionId : null;

  if (dialog.open) dialog.close();
  render();

  if (typeof snapshot?.overlayNoteId === "string") {
    openNote(snapshot.overlayNoteId, { fromHistory: true });
  }
}

function render() {
  const hasReceiptFallback = Boolean(ui.receiptFallback);
  const content = hasReceiptFallback ? renderReceiptFallbackPage() : renderRoute();
  const isLanding = !hasReceiptFallback && ui.route === "home";
  const isFeed = !hasReceiptFallback && ui.route === "wall";
  const isOpening = isLanding && ui.landingOpeningActive;
  const hasMobileNav = !hasReceiptFallback && !isLanding && !["identity", "ask", "answer"].includes(ui.route);
  const runtimeNotice = hasReceiptFallback ? "" : renderRuntimeNotice(isLanding);
  syncPageState({ isLanding, isFeed, isOpening });
  app.innerHTML = `
    <div class="app-shell${hasMobileNav ? " has-mobile-nav" : ""}${isLanding ? " landing-shell" : ""}${isFeed ? " feed-shell" : ""}${isOpening ? " is-opening" : ""}${runtimeNotice ? " has-runtime-notice" : ""}">
      ${isLanding || hasReceiptFallback ? "" : renderTopbar()}
      ${runtimeNotice}
      <main id="main-content" class="page-main" tabindex="-1">${content}</main>
      ${hasMobileNav ? renderMobileNav() : ""}
    </div>
  `;
  ui.feedMotion = "idle";
  refreshIcons();
  prewarmCurrentFeedNote();
}

function syncPageState({ isLanding, isFeed, isOpening }) {
  const body = document.body;
  if (!body?.classList) return;
  body.classList.remove("is-booting");
  body.classList.toggle("is-opening", isOpening);
  body.classList.toggle("is-immersive-route", isLanding || isFeed);
  if (body.dataset) body.dataset.route = ui.route;
}

function prewarmCurrentFeedNote() {
  if (ui.route !== "wall" || ui.recommendationComplete) return;
  const id = ui.recommendationIds[ui.recommendationIndex];
  const note = id ? findViewableNote(id) : null;
  // A photographed note is already being loaded for the card. Fetch its full Blob only when
  // the visitor opens the share sheet, avoiding a second large transfer on every swipe.
  if (note && note.kind !== "photo") void prepareNoteForShare(id);
}

function renderReceiptFallbackPage() {
  const fallback = ui.receiptFallback;
  if (!fallback) return "";
  const subject = fallback.type === "answer" ? "回答" : "问题";
  const receipt = normalizeReceipt(fallback.receipt);
  return `
    <section class="page-inner" aria-labelledby="receipt-fallback-title" aria-live="assertive">
      <div class="page-heading-row">
        <div>
          <p class="page-kicker">${subject}已提交成功</p>
          <h1 id="receipt-fallback-title">请先保存恢复码</h1>
          <p class="page-subtitle">这台设备没能自动保存投稿记录。不要再次提交同一内容。</p>
        </div>
        ${statusLabel("pending")}
      </div>

      <div class="content-list submission-list" role="alert">
        <article class="submission-row">
          <p class="submission-feedback">
            <strong>离开前必须处理</strong>
            恢复码是以后查询审核结果和修改重投的唯一凭证。请复制到安全位置，不要公开分享。
          </p>
          ${
            receipt
              ? `<div class="receipt-code">
                  <p class="content-row-meta">64 位恢复码</p>
                  <code id="unsaved-receipt-code" tabindex="0">${escapeHtml(receipt)}</code>
                </div>
                <div class="form-actions">
                  <button class="button button-primary" type="button" data-action="copy-unsaved-receipt">
                    ${icon("copy")} 复制恢复码
                  </button>
                </div>`
              : `<p class="submission-feedback">
                  <strong>恢复码未能读取</strong>
                  投稿仍然成功，请不要重复提交，并联系运营人员说明投稿 ID：${escapeHtml(fallback.submission?.id || "未知")}
                </p>`
          }
          <label class="switch-label" for="receipt-saved-confirmation">
            <input id="receipt-saved-confirmation" type="checkbox" />
            我已经把恢复码保存到安全位置
          </label>
          <div class="form-actions">
            <button class="button" type="button" data-action="acknowledge-unsaved-receipt">
              已保存，继续
            </button>
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderRuntimeNotice(isLanding) {
  if (
    isLanding &&
    ui.landingOpeningActive &&
    backend.enabled &&
    !remoteAvailable &&
    !remoteLoadFailed
  ) {
    return "";
  }
  if (
    (!backend.enabled || remoteAvailable) &&
    !runtimeStatus.emergencyLockdown &&
    !runtimeStatus.readOnly &&
    !runtimeStatus.submissionsPaused &&
    !runtimeStatus.publicMessage
  ) {
    return "";
  }

  let state = "notice";
  let title = "站点提醒";
  if (backend.enabled && !remoteAvailable) {
    state = "unavailable";
    title = remoteLoadFailed ? "在线服务暂时不可用" : "正在连接问答墙";
  } else if (runtimeStatus.emergencyLockdown) {
    state = "emergency";
    title = "问答墙暂时关闭";
  } else if (runtimeStatus.readOnly) {
    state = "readonly";
    title = "当前为只读模式";
  } else if (runtimeStatus.submissionsPaused) {
    state = "paused";
    title = "投稿暂时暂停";
  }

  return `
    <aside class="runtime-notice runtime-notice-${state}${isLanding ? " is-landing" : ""}" role="status">
      ${icon(state === "emergency" ? "shield-alert" : "info")}
      <span><strong>${title}</strong>${escapeHtml(runtimeMessage("浏览仍然开放，请稍后再来参与。"))}</span>
    </aside>
  `;
}

function renderRoute() {
  switch (ui.route) {
    case "home":
      return renderLandingPage();
    case "identity":
      return renderIdentityPage();
    case "participate":
      return persisted.role ? renderParticipatePage() : renderIdentityPage();
    case "ask":
      return persisted.role ? renderAskPage() : renderIdentityPage();
    case "pool":
      return persisted.role ? renderPoolPage() : renderIdentityPage();
    case "answer":
      return persisted.role && ui.selectedQuestionId
        ? renderAnswerPage()
        : renderPoolPage();
    case "mine":
      return renderMinePage();
    case "wall":
    default:
      return renderWallPage();
  }
}

function renderLandingPage() {
  return `
    <section class="landing-page" aria-labelledby="landing-title">
      ${renderCampaignHero()}
      <div class="landing-welcome">
        <div class="landing-content">
          <img class="landing-duck" src="assets/landing-duck.png" alt="抱着铅笔的鸭鸭" />
          <h1 id="landing-title">今天想从哪件事开始？</h1>

          <div class="landing-actions">
            <button class="landing-action landing-action-ask" type="button" data-action="landing-ask"${submissionsAreDisabled() ? " disabled" : ""}>
              <span class="landing-action-icon">${icon("help-circle")}</span>
              <span class="landing-action-copy"><strong>留一个问题</strong><small>让另一代来回答</small></span>
              ${icon("chevron-right")}
            </button>
            <button class="landing-action landing-action-answer" type="button" data-action="landing-answer"${submissionsAreDisabled() ? " disabled" : ""}>
              <span class="landing-action-icon">${icon("pen-line")}</span>
              <span class="landing-action-copy"><strong>回答一张便签</strong><small>从墙上的便签开始</small></span>
              ${icon("chevron-right")}
            </button>
          </div>

          <p class="landing-browse" aria-label="下滑先看看">
            <span class="landing-browse-icon" aria-hidden="true">${icon("chevrons-down")}</span>
            <span>下滑先看看</span>
          </p>
        </div>
      </div>
    </section>
  `;
}

function renderCampaignHero({ canExit = false } = {}) {
  return `
    <div class="campaign-hero">
      <img src="assets/hero-overlay.png" alt="躺倒鸭解鸭留言墙" />
      ${
        canExit
          ? `<button class="campaign-exit" type="button" data-action="landing-return" aria-label="退出浏览，返回参与入口">
              ${icon("x")}
            </button>`
          : ""
      }
    </div>
  `;
}

function renderTopbar() {
  const roleLabel = persisted.role ? roleName(persisted.role) : "选择身份";
  const isChoosingIdentity =
    ui.route === "identity" ||
    (!persisted.role && ["participate", "ask", "pool", "answer"].includes(ui.route));
  return `
    <header class="topbar-wrap">
      <div class="topbar">
        <button class="brand-button" type="button" data-action="navigate" data-route="wall" aria-label="回到问答墙">
          <span class="brand-mark" aria-hidden="true">
            <span class="brand-paper brand-paper-adult"></span>
            <span class="brand-paper brand-paper-child"></span>
          </span>
          <span class="brand-copy">
            <span class="brand-name">${BRAND_NAME}</span>
            <span class="brand-tagline">大朋友和小朋友的双向问答</span>
          </span>
        </button>

        <nav class="desktop-nav" aria-label="主要导航">
          ${desktopNavButton("wall", "留言墙")}
          <button class="nav-button" type="button" data-action="open-participation">问答</button>
          ${desktopNavButton("mine", "我的")}
        </nav>

        ${
          isChoosingIdentity
            ? ""
            : `<div class="topbar-actions">
                <button class="button identity-button" type="button" data-action="choose-role" aria-label="当前身份：${escapeHtml(roleLabel)}">
                  ${icon(persisted.role === "adult" ? "briefcase-business" : persisted.role === "child" ? "sparkles" : "user-round")}
                  <span class="role-button-text">${escapeHtml(roleLabel)}</span>
                </button>
              </div>`
        }
      </div>
    </header>
  `;
}

function desktopNavButton(route, label) {
  const current = navRouteIsCurrent(route) ? ' aria-current="page"' : "";
  return `<button class="nav-button" type="button" data-action="navigate" data-route="${route}"${current}>${label}</button>`;
}

function renderMobileNav() {
  return `
    <nav class="mobile-nav" aria-label="移动端主要导航">
      ${mobileNavButton("wall", "layout-grid", "墙")}
      ${mobileActionButton("participate", "pen-line", "问答", "open-participation")}
      ${mobileNavButton("mine", "user-round", "我的")}
    </nav>
  `;
}

function mobileNavButton(route, iconName, label) {
  const current = navRouteIsCurrent(route) ? ' aria-current="page"' : "";
  return `
    <button class="mobile-nav-button mobile-nav-${route}" type="button" data-action="navigate" data-route="${route}"${current}>
      <span class="mobile-nav-icon">${icon(iconName)}</span>
      <span>${label}</span>
    </button>
  `;
}

function mobileActionButton(className, iconName, label, action) {
  return `
    <button class="mobile-nav-button mobile-nav-${className}" type="button" data-action="${action}">
      <span class="mobile-nav-icon">${icon(iconName)}</span>
      <span>${label}</span>
    </button>
  `;
}

function navRouteIsCurrent(route) {
  if (route === "wall") {
    return ui.route === "wall";
  }
  return ui.route === route;
}

function renderWallPage() {
  return renderRecommendationPage();
}

function renderRecommendationPage() {
  if (runtimeStatus.emergencyLockdown) {
    return renderEmergencyWallState();
  }
  if (backend.enabled && !remoteAvailable) {
    return renderRemoteAvailabilityState();
  }
  const note = ui.recommendationComplete ? null : getCurrentRecommendation();
  return `
    <section class="recommendation-page" aria-label="问答墙">
      ${renderCampaignHero({ canExit: true })}
      <div class="recommendation-content">
        ${note ? renderSingleNoteViewer(note) : renderRecommendationEnd()}
      </div>
    </section>
  `;
}

function renderEmergencyWallState() {
  return `
    <section class="recommendation-page" aria-label="问答墙状态">
      ${renderCampaignHero({ canExit: true })}
      <div class="recommendation-content">
        <section class="single-note-viewer recommendation-end-viewer" aria-label="问答墙暂时关闭">
          <div class="single-note-stage">
            <div class="recommendation-end" role="status">
              <span class="recommendation-end-icon" aria-hidden="true">${icon("shield-alert")}</span>
              <div>
                <p class="page-kicker">问答墙</p>
                <h1>问答墙暂时关闭</h1>
                <p>${escapeHtml(runtimeMessage("恢复开放后会自动重新加载。"))}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderRemoteAvailabilityState() {
  return `
    <section class="recommendation-page" aria-label="问答墙状态">
      ${renderCampaignHero({ canExit: true })}
      <div class="recommendation-content">
        <section class="single-note-viewer recommendation-end-viewer" aria-label="在线内容状态">
          <div class="single-note-stage">
            <div class="recommendation-end" role="status">
              <span class="recommendation-end-icon" aria-hidden="true">${icon(remoteLoadFailed ? "cloud-off" : "loader-circle")}</span>
              <div>
                <p class="page-kicker">在线问答墙</p>
                <h1>${remoteLoadFailed ? "暂时无法读取便签" : "正在连接"}</h1>
                <p>${remoteLoadFailed ? "连接恢复后会自动重新加载。" : "正在确认最新内容和运行状态。"}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  `;
}

function renderSingleNoteViewer(note) {
  const canGoBack = ui.recommendationIndex > 0;
  return `
    <section class="single-note-viewer feed-motion-${ui.feedMotion}" aria-label="单张便签浏览">
      <div class="single-note-stage">
        <button class="single-note-nav single-note-nav-prev" type="button" data-action="wall-prev" aria-label="上一张便签"${canGoBack ? "" : " disabled"}>
          ${icon("chevron-up")}
        </button>
        ${renderNoteCard(note)}
        <button class="single-note-nav single-note-nav-next" type="button" data-action="wall-next" aria-label="下一张便签">
          ${icon("chevron-down")}
        </button>
      </div>
      <div class="single-note-viewer-foot has-note-actions">
        ${
          ui.showSwipeHint
            ? `<span class="single-note-gesture-hint">
                <span class="single-note-gesture-icon" aria-hidden="true">↑</span>
                下滑继续
              </span>`
            : `<span class="single-note-gesture-hint single-note-gesture-hint-quiet" aria-hidden="true">
                <span class="single-note-gesture-icon">↑</span>
              </span>`
        }
        ${renderNoteQuickActions(note)}
      </div>
    </section>
  `;
}

function getRecommendedNotes() {
  return [...getAvailableNotes()].sort(
    (a, b) =>
      Number(b.featured) - Number(a.featured) ||
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      a.id.localeCompare(b.id),
  );
}

function peekNextRecommendation() {
  loadSeenNoteIds().forEach((id) => seenNoteIds.add(id));
  return getRecommendedNotes().find(
    (note) => !seenNoteIds.has(note.id) && !ui.recommendationIds.includes(note.id),
  ) || null;
}

function getCurrentRecommendation() {
  reconcileRecommendationHistory();
  const currentId = ui.recommendationIds[ui.recommendationIndex];
  const current = getAvailableNotes().find((note) => note.id === currentId);
  if (current) return current;

  const next = peekNextRecommendation();
  if (!next) {
    ui.recommendationComplete = true;
    return null;
  }
  ui.recommendationIds.push(next.id);
  ui.recommendationIndex = ui.recommendationIds.length - 1;
  rememberSeenNote(next.id);
  return next;
}

function renderNoteCard(note, context = "feed") {
  if (note.kind === "photo" && note.mediaUrl) {
    return renderPhotoNoteCard(note, context);
  }
  const direction = directionMeta(note.direction);
  const answerCount = note.answerCount || getAvailableNotes().filter((item) => item.questionId === note.questionId).length;
  const noteContext = context === "favorite" ? ' data-note-context="favorite"' : "";
  return `
    <button
      class="note-sheet note-template ${noteTemplateClass(note.direction)}"
      type="button"
      data-action="open-note"
      data-note-id="${escapeHtml(note.id)}"
      ${noteContext}
      aria-label="查看问答：${escapeHtml(note.question)}"
    >
      <span class="note-topline">
        <span class="direction-label ${direction.className}">${direction.label}</span>
      </span>
      <span class="note-question">${escapeHtml(note.question)}</span>
      <span class="note-answer-label">${note.direction === "adult_to_child" ? "小朋友说" : "大朋友说"}</span>
      <span class="note-answer">${escapeHtml(note.answer)}</span>
      <span class="note-footer">
        <span>${answerCount > 1 ? `${answerCount} 个回答` : formatDate(note.createdAt)}</span>
        <span class="note-open-hint">展开 ${icon("arrow-up-right")}</span>
      </span>
    </button>
  `;
}

function renderPhotoNoteCard(note, context = "feed") {
  const noteContext = context === "favorite" ? ' data-note-context="favorite"' : "";
  const width = normalizeMediaDimension(note.mediaWidth) || 4;
  const height = normalizeMediaDimension(note.mediaHeight) || 3;
  const altText = note.altText || `实体便签。问题：${note.question}。回答：${note.answer}`;
  return `
    <button
      class="note-sheet note-template photo-note-card"
      style="--template-ratio: ${width} / ${height}"
      type="button"
      data-action="open-note"
      data-note-id="${escapeHtml(note.id)}"
      ${noteContext}
      aria-label="查看实体便签：${escapeHtml(note.question)}"
    >
      <img src="${escapeHtml(note.mediaUrl)}" alt="${escapeHtml(altText)}" loading="eager" decoding="async" fetchpriority="high" referrerpolicy="no-referrer" />
      <span class="photo-note-badge">实体便签</span>
    </button>
  `;
}

function renderNoteQuickActions(note, context = "feed") {
  const favorite = persisted.favorites.includes(note.id);
  const contextClass = context === "saved" ? " note-quick-actions-saved" : "";
  return `
    <div class="note-quick-actions${contextClass}" aria-label="便签操作">
      <button
        class="note-quick-action"
        type="button"
        data-action="toggle-favorite"
        data-note-id="${escapeHtml(note.id)}"
        aria-label="${favorite ? "取消收藏" : "收藏这张便签"}"
        aria-pressed="${favorite}"
        title="${favorite ? "取消收藏" : "收藏"}"
      >
        ${icon(favorite ? "bookmark-check" : "bookmark")}
      </button>
      <button
        class="note-quick-action"
        type="button"
        data-action="share-note"
        data-note-id="${escapeHtml(note.id)}"
        aria-label="分享这张便签"
        title="分享"
      >
        ${icon("share-2")}
      </button>
    </div>
  `;
}

function renderRecommendationEnd() {
  const canGoBack = reconcileRecommendationHistory().length > 0;
  const completedBatch = canGoBack || getAvailableNotes().length > 0;
  const endContent = completedBatch
    ? `
        <div class="recommendation-end-scene" role="status">
          <img class="recommendation-end-gif" src="assets/ending-duck.gif" alt="" aria-hidden="true" />
          <div class="recommendation-end-dialog">
            <h1>哎鸭，被你看完啦</h1>
            ${canGoBack ? "<p>上滑回看刚刚的便签</p>" : "<p>新便签通过审核后会继续出现在这里</p>"}
          </div>
        </div>
      `
    : `
        <div class="recommendation-end recommendation-end-empty" role="status">
          <span class="recommendation-end-icon" aria-hidden="true">${icon("clock-3")}</span>
          <div>
            <p class="page-kicker">便签正在路上</p>
            <h1>暂时没有公开便签</h1>
            <p>新的问答通过审核后会出现在这里。</p>
          </div>
        </div>
      `;
  return `
    <section class="single-note-viewer recommendation-end-viewer feed-motion-${ui.feedMotion}" aria-label="便签浏览结束">
      <div class="single-note-stage">
        <button class="single-note-nav single-note-nav-prev" type="button" data-action="wall-prev" aria-label="上一张便签"${canGoBack ? "" : " disabled"}>
          ${icon("chevron-up")}
        </button>
        ${endContent}
      </div>
      <div class="single-note-viewer-foot">
        ${
          canGoBack
            ? `<span class="single-note-gesture-hint">
                <span class="single-note-gesture-icon" aria-hidden="true">↓</span>
                上滑回看上一张
              </span>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderIdentityPage() {
  return `
    <div class="page-inner">
      <div class="page-heading-row">
        <div>
          <p class="page-kicker">参与身份</p>
          <h1>今天以谁的身份参与？</h1>
        </div>
        <button class="button button-ghost" type="button" data-action="go-back" data-fallback-route="wall">
          ${icon("arrow-left")}
          继续逛逛
        </button>
      </div>

      <div class="role-grid">
        ${roleChoice("adult", "user-round", "我是大朋友", "向小朋友提问 · 回答小朋友的问题")}
        ${roleChoice("child", "user-round", "我是小朋友", "向大朋友提问 · 回答大朋友的问题")}
      </div>
    </div>
  `;
}

function roleChoice(role, iconName, title, description) {
  return `
    <button class="role-choice role-choice-${role}" type="button" data-action="select-role" data-role="${role}">
      <span class="choice-icon">${icon(iconName)}</span>
      <span class="choice-copy">
        <span class="choice-action">选择这个身份 ${icon("arrow-right")}</span>
        <h2>${title}</h2>
        <p>${description}</p>
      </span>
    </button>
  `;
}

function openParticipationSheet() {
  if (!participationDialog || !participationDialogContent) {
    if (!persisted.role) requestIdentity({ type: "navigate", route: "wall" });
    return;
  }
  participationDialogContent.innerHTML = renderParticipationSheet();
  refreshIcons();
  if (!participationDialog.open) participationDialog.showModal();
}

function renderParticipationSheet() {
  const roleCopy = persisted.role
    ? `当前以${roleName(persisted.role)}身份参与`
    : "先选想做的事，真正参与时再补选身份";
  return `
    <div class="action-sheet-handle" aria-hidden="true"></div>
    <div class="action-sheet-head">
      <div>
        <p class="action-sheet-kicker">问答</p>
        <h2 id="participation-dialog-title">这次想做什么？</h2>
        <p>${escapeHtml(roleCopy)}</p>
      </div>
      <button class="action-sheet-close" type="button" data-participation-action="close" aria-label="关闭问答菜单">
        ${icon("x")}
      </button>
    </div>
    <div class="action-sheet-options">
      <button class="action-sheet-option action-sheet-option-ask" type="button" data-participation-action="ask"${submissionsAreDisabled() ? " disabled" : ""}>
        <span class="action-sheet-option-icon">${icon("message-circle-question")}</span>
        <span><strong>提个问题</strong><small>把真正想知道的事写在便签上</small></span>
        ${icon("chevron-right")}
      </button>
      <button class="action-sheet-option action-sheet-option-answer" type="button" data-participation-action="answer"${submissionsAreDisabled() ? " disabled" : ""}>
        <span class="action-sheet-option-icon">${icon("pen-line")}</span>
        <span><strong>去回答</strong><small>看看另一代正在问什么</small></span>
        ${icon("chevron-right")}
      </button>
    </div>
  `;
}

function closeParticipationSheet() {
  if (participationDialog?.open) participationDialog.close();
}

function handleParticipationDialogCancel(event) {
  event.preventDefault();
  closeParticipationSheet();
}

function handleParticipationDialogClick(event) {
  const actionTarget = event.target.closest("[data-participation-action]");
  if (!actionTarget) {
    const rect = participationDialog.getBoundingClientRect();
    const outside =
      event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom;
    if (outside) closeParticipationSheet();
    return;
  }
  const action = actionTarget.dataset.participationAction;
  if (action === "close") {
    closeParticipationSheet();
  } else if (action === "ask") {
    closeParticipationSheet();
    startAsk();
  } else if (action === "answer") {
    closeParticipationSheet();
    startAnswer();
  }
}

function renderParticipatePage() {
  const role = persisted.role;
  const askTarget = role === "adult" ? "小朋友" : "大朋友";
  const answerFrom = role === "adult" ? "小朋友" : "大朋友";
  return `
    <div class="page-inner">
      <div class="page-heading-row">
        <div>
          <p class="page-kicker">参与问答</p>
          <h1>你想做什么？</h1>
        </div>
      </div>

      ${renderIdentityBar()}

      <div class="action-grid">
        <button class="action-choice" type="button" data-action="start-ask"${submissionsAreDisabled() ? " disabled" : ""}>
          <span class="choice-icon">${icon("message-circle-question")}</span>
          <span class="choice-copy">
            <span class="choice-action">开始提问 ${icon("arrow-right")}</span>
            <h2>提个问题</h2>
            <p>把一个问题交给${askTarget}</p>
          </span>
        </button>
        <button class="action-choice" type="button" data-action="start-answer"${submissionsAreDisabled() ? " disabled" : ""}>
          <span class="choice-icon">${icon("messages-square")}</span>
          <span class="choice-copy">
            <span class="choice-action">进入问题池 ${icon("arrow-right")}</span>
            <h2>去回答</h2>
            <p>看看${answerFrom}正在问什么</p>
          </span>
        </button>
      </div>
    </div>
  `;
}

function renderIdentityBar() {
  return `
    <div class="identity-bar">
      <span class="identity-label">当前身份</span>
      <span class="identity-value">${roleName(persisted.role)}</span>
      <button class="button button-ghost" type="button" data-action="choose-role">
        ${icon("repeat-2")}
        切换身份
      </button>
    </div>
  `;
}

function renderAskPage() {
  const role = persisted.role;
  const target = role === "adult" ? "小朋友" : "大朋友";
  const direction = role === "adult" ? "adult_to_child" : "child_to_adult";
  const draft = persisted.drafts.ask[role] || "";
  return `
    <div class="page-inner">
      <div class="page-heading-row">
        <div>
          <p class="page-kicker">${roleName(role)}提问</p>
          <h1>问${target}一个问题</h1>
        </div>
        <button class="button button-ghost" type="button" data-action="go-back" data-fallback-route="participate">
          ${icon("arrow-left")}
          返回
        </button>
      </div>

      <form id="ask-form" class="composer-layout" data-form="ask">
        <section class="composer-panel" aria-labelledby="ask-form-title">
          <div class="composer-field-head">
            <label id="ask-form-title" class="field-name" for="ask-body">直接写在便签上</label>
            <span id="ask-count" class="character-count">${countCharacters(draft)} / 80</span>
          </div>

          ${renderComposerNote({
            direction,
            editable: "question",
            question: draft,
            answer: `等待${target}回答`,
            inputId: "ask-body",
            inputName: "body",
            inputLabel: "你的问题",
            placeholder: "写下你真正想知道的事",
            minLength: 5,
            maxLength: 80,
          })}

          <div class="composer-controls">
            <label class="switch-label" for="ask-anonymous">
              <input id="ask-anonymous" name="anonymous" type="checkbox" checked />
              匿名显示
            </label>

            <div class="privacy-hint" id="ask-privacy-hint">
              ${icon("shield-check")}
              <span>请不要填写真实姓名、学校、电话、住址或其他联系方式。</span>
            </div>

            <div class="form-actions">
              <span class="autosave-label">${icon("save")} 草稿随输入更新</span>
              <button class="button ${role === "adult" ? "button-adult" : "button-child"}" type="submit"${submissionsAreDisabled() ? " disabled" : ""}>
                ${icon("send")}
                ${submissionsAreDisabled() ? "暂停提交" : isExperienceMode() ? "发布问题" : "提交审核"}
              </button>
            </div>
          </div>
        </section>
      </form>
    </div>
  `;
}

function renderPoolPage() {
  if (!persisted.role) return renderIdentityPage();
  const questions = getPoolQuestions();
  const sourceRole = persisted.role === "adult" ? "小朋友" : "大朋友";
  return `
    <div class="page-inner">
      <div class="page-heading-row">
        <div>
          <p class="page-kicker">${roleName(persisted.role)}的问题池</p>
          <h1>${sourceRole}正在问</h1>
          <p class="page-subtitle">${questions.length} 个问题在等你的回答。</p>
        </div>
        <button class="button button-primary" type="button" data-action="random-question"${submissionsAreDisabled() || !questions.length ? " disabled" : ""}>
          ${icon("shuffle")}
          随机抽一道
        </button>
      </div>

      ${renderIdentityBar()}

      ${questions.length ? `<div class="question-pool">${questions.map(renderQuestionCard).join("")}</div>` : renderPoolEmptyState()}
    </div>
  `;
}

function getPoolQuestions() {
  const userQuestions = persisted.myQuestions.map((item) => ({ ...item, authorSessionId: sessionId }));
  const ownQuestionIds = new Set(persisted.myQuestions.map((item) => item.id));
  const combined = remoteAvailable ? getAvailableQuestions() : [...getAvailableQuestions(), ...userQuestions];
  return combined
    .filter((question) => {
      const roleMatches = question.targetRole === persisted.role;
      const isOpen = question.status === "open";
      const isOwnQuestion = question.authorSessionId === sessionId || ownQuestionIds.has(question.id);
      return roleMatches && isOpen && !isOwnQuestion;
    })
    .sort((a, b) => a.answerCount - b.answerCount || Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

function renderQuestionCard(question) {
  const direction = directionMeta(question.direction);
  return `
    <button
      class="question-card question-card-button"
      type="button"
      data-action="answer-question"
      data-question-id="${question.id}"
      aria-label="回答问题：${escapeHtml(question.body)}"
      ${submissionsAreDisabled() ? "disabled" : ""}
    >
      <span class="direction-label ${direction.className}">${direction.label}</span>
      <span class="question-card-title">${escapeHtml(question.body)}</span>
      <span class="question-card-meta">${question.answerCount} 个回答</span>
      <span class="question-card-action">轻点回答 ${icon("arrow-right")}</span>
    </button>
  `;
}

function renderPoolEmptyState() {
  const paused = submissionsAreDisabled();
  return `
    <div class="empty-state">
      <div class="empty-state-inner">
        <h2>${paused ? "问题池暂时停用" : "暂时没有待回答问题"}</h2>
        <p>${escapeHtml(paused ? runtimeMessage("恢复投稿后，这里会重新开放。") : "新的问题会出现在这里，也可以去问答墙随便看看。")}</p>
        <button class="button button-primary" type="button" data-action="navigate" data-route="wall">去问答墙看看</button>
      </div>
    </div>
  `;
}

function renderAnswerPage() {
  const question = findQuestion(ui.selectedQuestionId);
  if (!question) return renderPoolPage();
  const draft = persisted.drafts.answer[question.id] || "";
  return `
    <div class="page-inner">
      <div class="page-heading-row">
        <div>
          <p class="page-kicker">${roleName(persisted.role)}回答</p>
          <h1>写下你的回答</h1>
        </div>
        <button class="button button-ghost" type="button" data-action="go-back" data-fallback-route="pool">
          ${icon("arrow-left")}
          返回
        </button>
      </div>

      <form id="answer-form" class="composer-layout" data-form="answer" data-question-id="${escapeHtml(question.id)}">
        <section class="composer-panel" aria-labelledby="answer-form-title">
          <div class="composer-field-head">
            <label id="answer-form-title" class="field-name" for="answer-body">直接写在便签上</label>
            <span id="answer-count" class="character-count">${countCharacters(draft)} / 160</span>
          </div>

          ${renderComposerNote({
            direction: question.direction,
            editable: "answer",
            question: question.body,
            answer: draft,
            inputId: "answer-body",
            inputName: "body",
            inputLabel: "你的回答",
            placeholder: "认真说说你的想法",
            maxLength: 160,
          })}

          <div class="composer-controls">
            <label class="switch-label" for="answer-anonymous">
              <input id="answer-anonymous" name="anonymous" type="checkbox" checked />
              匿名显示
            </label>

            <div class="privacy-hint" id="answer-privacy-hint">
              ${icon("shield-check")}
              <span>请不要填写真实姓名、学校、电话、住址或其他联系方式。</span>
            </div>

            <div class="form-actions">
              <span class="autosave-label">${icon("save")} 草稿随输入更新</span>
              <button class="button ${persisted.role === "adult" ? "button-adult" : "button-child"}" type="submit"${submissionsAreDisabled() ? " disabled" : ""}>
                ${icon("send")}
                ${submissionsAreDisabled() ? "暂停提交" : isExperienceMode() ? "发布回答" : "提交审核"}
              </button>
            </div>
          </div>
        </section>
      </form>
    </div>
  `;
}

function renderComposerNote({
  direction,
  editable,
  question,
  answer,
  inputId,
  inputName,
  inputLabel,
  placeholder,
  minLength = 0,
  maxLength,
}) {
  const questionDensity = noteTextDensity(question, "question");
  const answerDensity = noteTextDensity(answer, "answer");
  const inputValue = editable === "question" ? question : answer;
  const inputDensity = editable === "question" ? questionDensity : answerDensity;
  const fieldClass = editable === "question" ? "composer-note-question" : "composer-note-answer";
  const describedBy = editable === "question" ? "ask-privacy-hint" : "answer-privacy-hint";
  const input = `
    <div class="composer-note-field ${fieldClass}">
      <textarea
        id="${inputId}"
        class="composer-note-input"
        name="${inputName}"
        ${minLength ? `minlength="${minLength}"` : ""}
        maxlength="${maxLength}"
        required
        aria-label="${inputLabel}"
        aria-describedby="${describedBy}"
        data-note-kind="${editable}"
        data-note-density="${inputDensity}"
        placeholder="${placeholder}"
      >${escapeHtml(inputValue)}</textarea>
    </div>
  `;
  return `
    <div class="composer-note note-template ${noteTemplateClass(direction)}">
      ${
        editable === "question"
          ? input
          : `<p class="composer-note-copy composer-note-question" data-note-density="${questionDensity}">${escapeHtml(question)}</p>`
      }
      ${
        editable === "answer"
          ? input
          : `<p class="composer-note-copy composer-note-answer composer-note-waiting" data-note-density="${answerDensity}">${escapeHtml(answer)}</p>`
      }
    </div>
  `;
}

function noteTextDensity(value, type) {
  const length = countCharacters(value);
  if (type === "question") {
    if (length > 58) return "dense";
    if (length > 34) return "compact";
    return "comfortable";
  }
  if (length > 110) return "dense";
  if (length > 62) return "compact";
  return "comfortable";
}

function renderMinePage() {
  const trackedCount = [...persisted.myQuestions, ...persisted.myAnswers].filter((item) => item.receipt).length;
  const favoriteCount = getFavoriteNotes().length;

  return `
    <div class="page-inner">
      <div class="page-heading-row">
        <div>
          <p class="page-kicker">我的</p>
          <h1>${persisted.role ? roleName(persisted.role) : "参与记录"}</h1>
        </div>
        ${
          backend.enabled && trackedCount
            ? `<button class="button button-ghost mine-sync-button" type="button" data-action="sync-submissions"${ui.statusSyncing ? " disabled" : ""}>
                ${icon("refresh-cw")}
                ${ui.statusSyncing ? "同步中" : "刷新状态"}
              </button>`
            : ""
        }
      </div>

      ${
        persisted.role
          ? renderIdentityBar()
          : `<div class="role-grid mine-role-grid">
              ${roleChoice("adult", "user-round", "我是大朋友", "查看和管理大朋友身份下的参与记录")}
              ${roleChoice("child", "user-round", "我是小朋友", "查看和管理小朋友身份下的参与记录")}
            </div>`
      }

      ${backend.enabled ? renderReceiptImport() : ""}

      <div class="mine-tabs" role="tablist" aria-label="我的内容">
        ${mineTabButton("questions", "我的提问")}
        ${mineTabButton("answers", "我的回答")}
        ${mineTabButton("favorites", favoriteCount ? `收藏 ${favoriteCount}` : "收藏")}
        ${mineTabButton("notifications", "消息")}
      </div>

      <div role="tabpanel">${renderMineTabContent()}</div>
    </div>
  `;
}

function renderReceiptImport() {
  return `
    <details class="receipt-import">
      <summary>${icon("key-round")} 在这台设备恢复投稿</summary>
      <form class="receipt-import-form" data-form="import-receipt">
        <label for="receipt-code">恢复码</label>
        <div class="receipt-import-controls">
          <input id="receipt-code" name="receipt" type="text" inputmode="text" minlength="64" maxlength="64" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="64 位恢复码" required />
          <button class="button button-primary" type="submit">导入</button>
        </div>
        <p>恢复码相当于投稿凭证，请勿公开分享。</p>
      </form>
    </details>
  `;
}

function mineTabButton(value, label) {
  return `<button class="mine-tab" type="button" role="tab" data-action="mine-tab" data-value="${value}" aria-selected="${ui.mineTab === value}">${label}</button>`;
}

function renderMineTabContent() {
  if (ui.mineTab === "questions") {
    if (!persisted.myQuestions.length) return mineEmpty("还没有提问", "去问一个真正想知道的问题", "start-ask", "提个问题");
    return `<div class="content-list submission-list">${persisted.myQuestions.map((item) => renderSubmissionRow(item, "question")).join("")}</div>`;
  }

  if (ui.mineTab === "answers") {
    if (!persisted.myAnswers.length) return mineEmpty("还没有回答", "问题池里有人正在等你的想法", "start-answer", "去回答");
    return `<div class="content-list submission-list">${persisted.myAnswers.map((item) => renderSubmissionRow(item, "answer")).join("")}</div>`;
  }

  if (ui.mineTab === "favorites") {
    const favorites = getFavoriteNotes();
    if (!favorites.length) return mineEmpty("还没有收藏", "在问答墙轻点书签，就能把喜欢的便签留在这里", "navigate", "去问答墙", "wall");
    return `
      <div class="favorite-note-list" aria-label="收藏的便签">
        ${favorites.map(renderFavoriteNote).join("")}
      </div>
    `;
  }

  if (!persisted.notifications.length) return mineEmpty("暂时没有消息", "收到回答和审核结果后会出现在这里", "navigate", "去问答墙", "wall");
  return `<div class="content-list">${persisted.notifications.map((item) => contentRow(item.title, item.detail, item.read ? "published" : "pending")).join("")}</div>`;
}

function getFavoriteNotes() {
  if (runtimeStatus.emergencyLockdown) return [];
  const liveNotesById = new Map(getAvailableNotes().map((note) => [note.id, note]));
  const storedNotesById = new Map((persisted.favoriteNotes || []).map((note) => [note.id, note]));
  return [...persisted.favorites]
    .reverse()
    .filter((id) => !backend.enabled || validatedFavoriteNoteIds.has(id))
    .map((id) => liveNotesById.get(id) || verifiedPublicNotes.get(id) || storedNotesById.get(id))
    .filter(Boolean);
}

function findViewableNote(noteId) {
  const id = normalizePublicNoteId(noteId);
  if (!id || runtimeStatus.emergencyLockdown) return null;
  const liveNote = getAvailableNotes().find((note) => note.id === id);
  if (liveNote) return liveNote;
  const verifiedNote = verifiedPublicNotes.get(id);
  if (verifiedNote) return verifiedNote;
  if (backend.enabled && !validatedFavoriteNoteIds.has(id)) return null;
  return (persisted.favoriteNotes || []).find((note) => note.id === id) || null;
}

function renderFavoriteNote(note) {
  return `
    <article class="favorite-note-item">
      ${renderNoteCard(note, "favorite")}
      ${renderNoteQuickActions(note, "saved")}
    </article>
  `;
}

function renderSubmissionRow(item, type) {
  const direction = type === "question" ? directionMeta(item.direction).label : `回答：${item.questionBody}`;
  const editing = ui.editingSubmission?.type === type && ui.editingSubmission?.id === item.id;
  return `
    <article class="submission-row">
      <div class="submission-row-head">
        <div class="content-row-main">
          <p class="content-row-title">${escapeHtml(item.body)}</p>
          <p class="content-row-meta">${escapeHtml(direction)} · ${item.anonymous === false ? "公开身份" : "匿名"}${item.revision > 1 ? ` · 第 ${item.revision} 版` : ""}</p>
        </div>
        ${statusLabel(item.status)}
      </div>
      ${item.rejectionReason ? `<p class="submission-feedback"><strong>审核说明</strong>${escapeHtml(item.rejectionReason)}</p>` : ""}
      ${item.latestEvent ? `<p class="submission-latest">${escapeHtml(item.latestEvent.message)} · ${formatDate(item.latestEvent.createdAt)}</p>` : ""}
      ${renderSubmissionActions(item, type)}
      ${editing ? renderResubmitForm(item, type) : ""}
    </article>
  `;
}

function renderSubmissionActions(item, type) {
  if (!item.receipt) {
    return `<p class="submission-legacy">旧版本机记录，无法同步线上状态</p>`;
  }
  return `
    <div class="submission-actions">
      ${
        item.status === "rejected"
          ? `<button class="button button-primary" type="button" data-action="edit-submission" data-type="${type}" data-id="${item.id}">
              ${icon("pencil-line")} 修改并重投
            </button>`
          : ""
      }
      <details class="receipt-code">
        <summary>${icon("key-round")} 恢复码</summary>
        <code>${escapeHtml(item.receipt)}</code>
        <button class="button button-ghost" type="button" data-action="copy-receipt" data-type="${type}" data-id="${item.id}" aria-label="复制恢复码">
          ${icon("copy")} 复制
        </button>
      </details>
    </div>
  `;
}

function renderResubmitForm(item, type) {
  const limit = type === "question" ? 80 : 160;
  return `
    <form class="resubmit-form" data-form="resubmit" data-type="${type}" data-id="${item.id}">
      <label for="resubmit-${type}-${item.id}">修改内容</label>
      <textarea id="resubmit-${type}-${item.id}" class="text-area" name="body" maxlength="${limit}" ${type === "question" ? 'minlength="5"' : ""} required>${escapeHtml(item.body)}</textarea>
      <label class="switch-label">
        <input name="anonymous" type="checkbox"${item.anonymous !== false ? " checked" : ""} />
        匿名显示
      </label>
      <div class="resubmit-actions">
        <button class="button button-ghost" type="button" data-action="cancel-resubmit">取消</button>
        <button class="button button-primary" type="submit"${submissionsAreDisabled() ? " disabled" : ""}>${icon("send")} 重新提交</button>
      </div>
    </form>
  `;
}

function contentRow(title, meta, status) {
  return `
    <div class="content-row">
      <div class="content-row-main">
        <p class="content-row-title">${escapeHtml(title)}</p>
        <p class="content-row-meta">${escapeHtml(meta)}</p>
      </div>
      ${statusLabel(status)}
    </div>
  `;
}

function mineEmpty(title, text, action, buttonLabel, route = "") {
  return `
    <div class="empty-state">
      <div class="empty-state-inner">
        <h2>${title}</h2>
        <p>${text}</p>
        <button class="button button-primary" type="button" data-action="${action}"${route ? ` data-route="${route}"` : ""}>${buttonLabel}</button>
      </div>
    </div>
  `;
}

function statusLabel(status) {
  const map = {
    pending: ["status-pending", "审核中"],
    open: ["status-published", "等待回答"],
    published: ["status-published", "已发布"],
    rejected: ["status-rejected", "需要修改"],
    hidden: ["status-hidden", "已隐藏"],
    closed: ["status-hidden", "已关闭"],
  };
  const [className, label] = map[status] || ["", status];
  return `<span class="status-label ${className}">${label}</span>`;
}

function findStoredSubmission(type, id) {
  const list = type === "question" ? persisted.myQuestions : persisted.myAnswers;
  return list.find((item) => item.id === id) || null;
}

function applySubmissionStatus(result, receipt) {
  const type = result.type === "answer" ? "answer" : "question";
  const list = type === "question" ? persisted.myQuestions : persisted.myAnswers;
  let item = list.find((entry) => entry.id === result.id || entry.receipt === receipt);
  const latestEvent = Array.isArray(result.events) ? result.events[0] : null;

  if (!item) {
    if (type === "question") {
      item = {
        id: result.id,
        body: result.body,
        direction: result.direction,
        askerRole: result.authorRole,
        targetRole: result.targetRole,
        answerCount: 0,
        authorSessionId: sessionId,
      };
    } else {
      item = {
        id: result.id,
        questionId: result.questionId,
        questionBody: result.questionBody,
        body: result.body,
        role: result.authorRole,
      };
    }
    list.unshift(item);
  }

  const knownEvents = new Set(normalizeEventIds(item.eventIds));
  const incomingEvents = Array.isArray(result.events)
    ? result.events.filter((event) => Number.isSafeInteger(Number(event.id)))
    : [];

  incomingEvents
    .filter((event) => !knownEvents.has(Number(event.id)) && event.type !== "submitted")
    .sort((a, b) => Number(a.id) - Number(b.id))
    .forEach((event) => {
      persisted.notifications.unshift({
        id: `submission-${type}-${result.id}-${event.id}`,
        title: submissionEventTitle(type, event.type),
        detail: event.message,
        createdAt: event.createdAt || new Date().toISOString(),
        read: false,
      });
    });

  Object.assign(item, {
    id: result.id,
    body: result.body,
    status: result.status,
    anonymous: result.anonymous !== false,
    createdAt: result.createdAt || item.createdAt || new Date().toISOString(),
    updatedAt: result.updatedAt || item.updatedAt || null,
    receipt,
    rejectionReason: result.rejectionReason || "",
    revision: Math.max(1, Number(result.revision || item.revision || 1)),
    eventIds: incomingEvents.map((event) => Number(event.id)).slice(0, 40),
    latestEvent: latestEvent
      ? {
          type: latestEvent.type,
          message: latestEvent.message,
          createdAt: latestEvent.createdAt,
        }
      : item.latestEvent || null,
  });

  if (type === "question") {
    Object.assign(item, {
      direction: result.direction,
      askerRole: result.authorRole,
      targetRole: result.targetRole,
    });
  } else {
    Object.assign(item, {
      questionId: result.questionId,
      questionBody: result.questionBody,
      role: result.authorRole,
    });
  }

  return { item, type };
}

function submissionEventTitle(type, eventType) {
  const subject = type === "question" ? "问题" : "回答";
  const labels = {
    approved: `${subject}已通过审核`,
    rejected: `${subject}需要修改`,
    resubmitted: `${subject}已重新提交`,
    hidden: `${subject}已隐藏`,
    closed: "问题已关闭",
    reopened: "问题已重新开放",
    answer_received: "问题收到新回答",
    featured: "回答被设为精选",
    published: "回答已重新发布",
  };
  return labels[eventType] || `${subject}状态已更新`;
}

async function refreshSubmissionStatuses({ silent = false, renderAfter = true } = {}) {
  if (!backend.enabled || ui.statusSyncing) return;
  const tracked = [...persisted.myQuestions, ...persisted.myAnswers].filter((item) => item.receipt);
  if (!tracked.length) {
    if (!silent) showToast("还没有可以同步的线上投稿。", false, 1800);
    return;
  }

  ui.statusSyncing = true;
  if (renderAfter && ui.route === "mine") render();
  const results = await Promise.allSettled(
    tracked.map(async (item) => ({
      receipt: item.receipt,
      status: await backend.getSubmissionStatus(item.receipt),
    })),
  );
  let updated = 0;
  results.forEach((result) => {
    if (result.status !== "fulfilled") return;
    applySubmissionStatus(result.value.status, result.value.receipt);
    updated += 1;
  });
  savePersistedState();
  ui.statusSyncing = false;
  if (renderAfter && ui.route === "mine") render();

  if (!silent) {
    const failed = results.length - updated;
    showToast(
      failed ? `已同步 ${updated} 条，${failed} 条暂时失败。` : `已同步 ${updated} 条投稿状态。`,
      Boolean(failed && !updated),
      2400,
    );
  }
}

async function importSubmissionReceipt(form) {
  const receipt = normalizeReceipt(new FormData(form).get("receipt"));
  if (!receipt) {
    showToast("请输入完整的 64 位恢复码。", true);
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    const result = await backend.getSubmissionStatus(receipt);
    const restored = applySubmissionStatus(result, receipt);
    ui.mineTab = restored.type === "question" ? "questions" : "answers";
    savePersistedState();
    render();
    showToast("投稿记录已恢复到这台设备。", false, 2200);
  } catch (error) {
    showToast(submissionErrorMessage(error, "恢复码无效或已经过期。"), true, 2800);
    if (button) button.disabled = false;
  }
}

async function resubmitStoredSubmission(form) {
  if (submissionsAreDisabled()) {
    showToast(runtimeMessage(), true, 2600);
    return;
  }
  const type = form.dataset.type === "answer" ? "answer" : "question";
  const item = findStoredSubmission(type, form.dataset.id);
  if (!item?.receipt) return;
  const formData = new FormData(form);
  const body = String(formData.get("body") || "").trim();
  const minimum = type === "question" ? 5 : 1;
  if (countCharacters(body) < minimum) {
    showToast(type === "question" ? "问题至少需要 5 个字。" : "请先写下你的回答。", true);
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    const method = type === "question" ? backend.resubmitQuestion : backend.resubmitAnswer;
    await method({
      receipt: item.receipt,
      body,
      anonymous: formData.get("anonymous") === "on",
    });
    const result = await backend.getSubmissionStatus(item.receipt);
    applySubmissionStatus(result, item.receipt);
    ui.editingSubmission = null;
    savePersistedState();
    render();
    showToast("修改已重新提交审核。", false, 2200);
  } catch (error) {
    showToast(submissionErrorMessage(error, "重新提交失败，请稍后再试。"), true, 3000);
    if (button) button.disabled = false;
  }
}

function submissionErrorMessage(error, fallback) {
  if (["submissions_paused", "read_only", "emergency_lockdown", "rate_limited", "question_not_open", "own_question", "already_answered", "not_resubmittable"].includes(error?.code)) {
    return error.message || fallback;
  }
  if (error?.code === "not_found") return "恢复码无效或已经过期。";
  if (error?.code === "22001") return "内容长度不符合要求，请检查后再试。";
  if (error?.code === "22023") return "内容中不能包含联系方式、网址或特殊标记。";
  if (error?.code === "23514") return "当前身份或内容状态不允许这项操作。";
  return fallback;
}

function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (performance.now() < suppressClickUntil) {
    event.preventDefault();
    return;
  }

  if (action === "copy-unsaved-receipt") {
    void copyUnsavedReceipt();
  } else if (action === "acknowledge-unsaved-receipt") {
    acknowledgeUnsavedReceipt();
  } else if (action === "navigate") {
    const route = target.dataset.route;
    navigate(route);
  } else if (action === "open-participation") {
    openParticipationSheet();
  } else if (action === "go-back") {
    goBack(target.dataset.fallbackRoute || "wall");
  } else if (action === "landing-ask") {
    startAsk();
  } else if (action === "landing-answer") {
    startAnswer();
  } else if (action === "landing-return") {
    navigate("home");
  } else if (action === "wall-prev") {
    moveWall(-1);
  } else if (action === "wall-next") {
    moveWall(1);
  } else if (action === "choose-role") {
    if (ui.route !== "identity") {
      requestIdentity({ type: "return", route: ui.route });
    }
  } else if (action === "select-role") {
    selectRole(target.dataset.role);
  } else if (action === "start-ask") {
    startAsk();
  } else if (action === "start-answer") {
    startAnswer();
  } else if (action === "toggle-favorite") {
    toggleFavorite(target.dataset.noteId);
    render();
  } else if (action === "share-note") {
    openShareSheet(target.dataset.noteId);
  } else if (action === "open-note") {
    if (target.dataset.noteContext === "favorite" && backend.enabled) {
      void openVerifiedFavoriteNote(target.dataset.noteId);
    } else {
      openNote(target.dataset.noteId);
    }
  } else if (action === "answer-question") {
    beginAnswerQuestion(target.dataset.questionId);
  } else if (action === "random-question") {
    const questions = getPoolQuestions();
    if (questions.length) beginAnswerQuestion(questions[Math.floor(Math.random() * questions.length)].id);
  } else if (action === "save-ask-draft") {
    saveAskDraft();
  } else if (action === "save-answer-draft") {
    saveAnswerDraft(target.dataset.questionId);
  } else if (action === "mine-tab") {
    ui.mineTab = target.dataset.value;
    ui.editingSubmission = null;
    render();
  } else if (action === "sync-submissions") {
    void refreshSubmissionStatuses();
  } else if (action === "edit-submission") {
    ui.editingSubmission = {
      type: target.dataset.type === "answer" ? "answer" : "question",
      id: target.dataset.id,
    };
    render();
  } else if (action === "cancel-resubmit") {
    ui.editingSubmission = null;
    render();
  } else if (action === "copy-receipt") {
    void copySubmissionReceipt(target.dataset.type, target.dataset.id);
  }
}

async function copySubmissionReceipt(type, id) {
  const item = findStoredSubmission(type === "answer" ? "answer" : "question", id);
  if (!item?.receipt) return;
  try {
    await navigator.clipboard.writeText(item.receipt);
    showToast("恢复码已复制。", false, 1600);
  } catch {
    showToast("暂时无法复制，请长按恢复码手动选择。", true, 2400);
  }
}

async function copyUnsavedReceipt() {
  const receipt = normalizeReceipt(ui.receiptFallback?.receipt);
  if (!receipt) return;
  try {
    await navigator.clipboard.writeText(receipt);
    showToast("恢复码已复制，请保存到安全位置。", false, 2200);
  } catch {
    const code = document.getElementById("unsaved-receipt-code");
    if (code) {
      code.focus();
      try {
        const range = document.createRange();
        range.selectNodeContents(code);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      } catch {
        // The code remains visible and user-selectable when programmatic selection is unavailable.
      }
    }
    showToast("无法自动复制，请长按恢复码手动选择。", true, 3200);
  }
}

function acknowledgeUnsavedReceipt() {
  const fallback = ui.receiptFallback;
  if (!fallback) return;
  const confirmation = document.getElementById("receipt-saved-confirmation");
  if (!confirmation?.checked) {
    showToast("请先保存恢复码并勾选确认。", true, 2600);
    return;
  }

  try {
    ensureSubmissionInMemory(fallback.type, fallback.submission);
  } catch {
    // The externally saved receipt remains the authoritative recovery path.
  }
  const storedLocally = persistSubmissionReceipt(fallback.type, fallback.submission);
  clearPendingReceiptFallback();
  ui.receiptFallback = null;
  ui.mineTab = fallback.type === "answer" ? "answers" : "questions";
  navigate("mine");
  showToast(
    storedLocally ? "恢复码已保存到这台设备。" : "投稿已成功，请继续妥善保管恢复码。",
    false,
    3200,
  );
}

function moveWall(delta) {
  reconcileRecommendationHistory();
  if (delta < 0) {
    if (ui.recommendationComplete) {
      if (!ui.recommendationIds.length) return;
      ui.recommendationComplete = false;
      ui.recommendationIndex = ui.recommendationIds.length - 1;
    } else {
      if (ui.recommendationIndex <= 0) {
        showToast("已经是第一张便签了。", false, 1400);
        return;
      }
      ui.recommendationIndex -= 1;
    }
    ui.feedMotion = "previous";
  } else {
    if (ui.recommendationComplete) return;
    if (ui.recommendationIndex < ui.recommendationIds.length - 1) {
      ui.recommendationIndex += 1;
    } else {
      const next = peekNextRecommendation();
      if (!next) {
        ui.recommendationComplete = true;
      } else {
        ui.recommendationIds.push(next.id);
        ui.recommendationIndex += 1;
        rememberSeenNote(next.id);
      }
    }
    ui.feedMotion = "next";
  }

  dismissSwipeHint();
  render();
}

function handleKeydown(event) {
  if (ui.route !== "wall") return;
  if (dialog.open || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(document.activeElement?.tagName)) return;
  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveWall(-1);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    moveWall(1);
  }
}

let touchGestureStart = null;

function handleTouchStart(event) {
  if (event.touches.length !== 1) return;

  const target = event.target;
  if (ui.route === "home") {
    if (!target.closest(".landing-page") || target.closest(".landing-action")) return;
    const touch = event.touches[0];
    touchGestureStart = {
      kind: "landing",
      x: touch.clientX,
      y: touch.clientY,
      axis: null,
      startedAt: performance.now(),
    };
    return;
  }

  if (ui.route !== "wall" || !target.closest(".recommendation-page")) {
    return;
  }
  if (target.closest(".note-quick-actions")) return;

  const touch = event.touches[0];
  touchGestureStart = {
    kind: "viewer",
    x: touch.clientX,
    y: touch.clientY,
    axis: null,
    startedAt: performance.now(),
  };
}

function handleTouchMove(event) {
  if (!touchGestureStart || event.touches.length !== 1) return;
  const touch = event.touches[0];
  const dx = touch.clientX - touchGestureStart.x;
  const dy = touch.clientY - touchGestureStart.y;

  if (!touchGestureStart.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 8) {
    if (Math.abs(dy) > Math.abs(dx) * 1.05) touchGestureStart.axis = "y";
    if (Math.abs(dx) > Math.abs(dy) * 1.35) touchGestureStart.axis = "x";
  }

  if (touchGestureStart.axis === "y" && event.cancelable) {
    event.preventDefault();
  }
}

function handleTouchEnd(event) {
  if (!touchGestureStart) return;
  const touch = event.changedTouches[0];
  if (!touch) {
    touchGestureStart = null;
    return;
  }

  const start = touchGestureStart;
  touchGestureStart = null;
  const dx = touch.clientX - start.x;
  const dy = touch.clientY - start.y;
  const horizontalDistance = Math.abs(dx);
  const verticalDistance = Math.abs(dy);
  const elapsed = Math.max(1, performance.now() - start.startedAt);
  const hasVerticalIntent = verticalDistance > horizontalDistance * 1.05;
  const hasSwipeDistance = verticalDistance >= 48;
  const isFastVerticalFlick = verticalDistance >= 28 && verticalDistance / elapsed >= 0.32;
  const verticalSwipe = hasVerticalIntent && (hasSwipeDistance || isFastVerticalFlick);

  if (start.kind === "landing") {
    if (dy < 0 && verticalSwipe) {
      if (event.cancelable) event.preventDefault();
      suppressClickUntil = performance.now() + 450;
      navigate("wall");
    }
    return;
  }

  if (ui.route !== "wall") return;
  if (!verticalSwipe && horizontalDistance >= 48) {
    suppressClickUntil = performance.now() + 300;
  }
  if (!verticalSwipe) return;

  if (event.cancelable) event.preventDefault();
  suppressClickUntil = performance.now() + 450;
  moveWall(dy < 0 ? 1 : -1);
}

function handleTouchCancel() {
  touchGestureStart = null;
}

function handleWheel(event) {
  const target = event.target;
  const onLanding = ui.route === "home" && target.closest?.(".landing-page");
  const onViewer = ui.route === "wall" && target.closest?.(".recommendation-page");
  if ((!onLanding && !onViewer) || Math.abs(event.deltaY) <= 20) return;
  if (target.closest?.(".note-quick-actions")) return;

  if (event.cancelable) event.preventDefault();
  const now = performance.now();
  if (now < wheelGestureReadyAt) return;
  wheelGestureReadyAt = now + WHEEL_GESTURE_COOLDOWN_MS;

  if (onLanding) {
    if (event.deltaY > 0) navigate("wall");
    return;
  }
  moveWall(event.deltaY > 0 ? 1 : -1);
}

function handleInput(event) {
  if (event.target.id === "ask-body") {
    persisted.drafts.ask[persisted.role] = event.target.value;
    savePersistedState();
    updateCounter("ask-count", event.target.value, 80);
    event.target.dataset.noteDensity = noteTextDensity(event.target.value, "question");
  }

  if (event.target.id === "answer-body") {
    const question = findQuestion(ui.selectedQuestionId);
    if (!question) return;
    persisted.drafts.answer[question.id] = event.target.value;
    savePersistedState();
    updateCounter("answer-count", event.target.value, 160);
    event.target.dataset.noteDensity = noteTextDensity(event.target.value, "answer");
  }
}

function handleSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();

  if (form.dataset.form === "ask") void submitQuestion(form);
  if (form.dataset.form === "answer") void submitAnswer(form);
  if (form.dataset.form === "import-receipt") void importSubmissionReceipt(form);
  if (form.dataset.form === "resubmit") void resubmitStoredSubmission(form);
}

function selectRole(role) {
  const previousRole = persisted.role;
  if (previousRole && previousRole !== role) {
    const hasDraft =
      Object.values(persisted.drafts.ask).some(Boolean) ||
      Object.values(persisted.drafts.answer).some(Boolean);
    if (hasDraft && !window.confirm("草稿会保留在原身份下。确认切换身份吗？")) return;
  }

  persisted.role = role;
  savePersistedState();

  const intent = ui.pendingIntent;
  ui.pendingIntent = null;
  if (intent?.type === "ask") {
    navigate("ask", { replace: true });
    return;
  }

  if (intent?.type === "answer" && intent.questionId) {
    const question = findQuestion(intent.questionId);
    if (question?.targetRole === role) {
      ui.selectedQuestionId = question.id;
      navigate("answer", { replace: true });
    } else {
      if (question) {
        showToast(`这道题在等${roleName(question.targetRole)}回答，已为你打开适合的问题池。`);
      } else {
        showToast("原问题已经不可用，已为你打开问题池。", true);
      }
      navigate("pool", { replace: true });
    }
    return;
  }

  if (intent?.type === "answer") {
    navigate("pool", { replace: true });
    return;
  }

  if (intent?.type === "return") {
    const returnRoute = normalizeRoleReturnRoute(intent.route, role);
    if (returnRoute === "pool" && intent.route === "answer") {
      navigate("pool", { replace: true });
    } else {
      goBack(returnRoute);
    }
    return;
  }

  if (intent?.type === "navigate") {
    navigate(intent.route, { replace: true });
    return;
  }

  if (ui.route === "ask") {
    navigate("ask");
    return;
  }

  if (ui.route === "pool" || ui.route === "answer") {
    navigate("pool");
    return;
  }

  if (ui.route === "mine") {
    navigate("mine");
    return;
  }

  navigate("participate", { replace: true });
}

function normalizeRoleReturnRoute(route, role) {
  const normalized = normalizeRoute(route);
  if (normalized !== "answer") return normalized;
  const question = findQuestion(ui.selectedQuestionId);
  return question?.targetRole === role ? "answer" : "pool";
}

function requestIdentity(intent) {
  ui.pendingIntent = intent;
  navigate("identity", { preserveIntent: true });
}

function startAsk() {
  if (submissionsAreDisabled()) {
    showToast(runtimeMessage(), true, 2600);
    return;
  }
  if (!persisted.role) {
    requestIdentity({ type: "ask" });
    return;
  }
  navigate("ask");
}

function startAnswer() {
  if (submissionsAreDisabled()) {
    showToast(runtimeMessage(), true, 2600);
    return;
  }
  if (!persisted.role) {
    requestIdentity({ type: "answer" });
    return;
  }
  navigate("pool");
}

async function submitQuestion(form) {
  if (submissionsAreDisabled()) {
    showToast(runtimeMessage(), true, 2600);
    return;
  }
  const formData = new FormData(form);
  const body = String(formData.get("body") || "").trim();
  const anonymous = formData.get("anonymous") === "on";
  if (countCharacters(body) < 5) {
    showToast("问题至少需要 5 个字。", true);
    return;
  }

  const direction = persisted.role === "adult" ? "adult_to_child" : "child_to_adult";
  const targetRole = persisted.role === "adult" ? "child" : "adult";
  const experienceMode = isExperienceMode();
  let question = {
    id: globalThis.crypto?.randomUUID?.() || `question-${Date.now()}`,
    body,
    direction,
    askerRole: persisted.role,
    targetRole,
    status: experienceMode ? "open" : "pending",
    answerCount: 0,
    anonymous,
    createdAt: new Date().toISOString(),
    authorSessionId: sessionId,
  };
  let remoteSucceeded = false;

  const submitButton = form.querySelector('button[type="submit"]');
  if (backend.enabled) {
    if (submitButton) submitButton.disabled = true;
    let remoteQuestion;
    try {
      remoteQuestion = await backend.createQuestion({
        id: question.id,
        authorSessionId: sessionId,
        authorRole: persisted.role,
        body,
        anonymous,
      });
    } catch (error) {
      console.error("Unable to submit question.", error);
      showToast(submissionErrorMessage(error, "问题提交失败，草稿已经保留，请稍后重试。"), true, 3200);
      if (submitButton) submitButton.disabled = false;
      return;
    }

    remoteSucceeded = true;
    question = {
      ...question,
      ...remoteQuestion,
      receipt: normalizeReceipt(remoteQuestion.receipt),
      anonymous,
      authorSessionId: sessionId,
    };

    void refreshRemoteContent().catch((error) => {
      console.warn("Question was published, but shared content could not be refreshed.", error);
    });
  }

  finishSuccessfulSubmission({
    type: "question",
    submission: question,
    notification: {
      id: `notification-${Date.now()}`,
      title: experienceMode ? "问题已发布" : "问题已提交审核",
      detail: experienceMode
        ? `问题已经进入${roleName(targetRole)}的问题池。`
        : `审核通过后会进入${roleName(targetRole)}的问题池。`,
      createdAt: new Date().toISOString(),
      read: false,
    },
    clearDraft: () => {
      persisted.drafts.ask[persisted.role] = "";
    },
    remoteSucceeded,
    successMessage: experienceMode
      ? "问题已发布，正在等待回答。"
      : "问题已提交，审核通过后会进入问题池。",
  });
}

async function submitAnswer(form) {
  if (submissionsAreDisabled()) {
    showToast(runtimeMessage(), true, 2600);
    return;
  }
  const question = findQuestion(form.dataset.questionId);
  if (!question || question.status !== "open") {
    showToast("这个问题已经不能继续回答，草稿已保留。", true);
    return;
  }
  if (question.targetRole !== persisted.role) {
    showToast("当前身份不能回答这个问题。", true);
    return;
  }
  if (question.authorSessionId === sessionId || persisted.myQuestions.some((item) => item.id === question.id)) {
    showToast("不能回答自己提出的问题。", true);
    return;
  }

  const formData = new FormData(form);
  const body = String(formData.get("body") || "").trim();
  const anonymous = formData.get("anonymous") === "on";
  if (!body) {
    showToast("请先写下你的回答。", true);
    return;
  }

  const experienceMode = isExperienceMode();
  let answer = {
    id: globalThis.crypto?.randomUUID?.() || `answer-${Date.now()}`,
    questionId: question.id,
    questionBody: question.body,
    body,
    role: persisted.role,
    anonymous,
    status: experienceMode ? "published" : "pending",
    createdAt: new Date().toISOString(),
  };
  let remoteSucceeded = false;

  const submitButton = form.querySelector('button[type="submit"]');
  if (backend.enabled) {
    if (submitButton) submitButton.disabled = true;
    let remoteAnswer;
    try {
      remoteAnswer = await backend.createAnswer({
        id: answer.id,
        questionId: question.id,
        authorSessionId: sessionId,
        authorRole: persisted.role,
        body,
        anonymous,
      });
    } catch (error) {
      console.error("Unable to submit answer.", error);
      showToast(submissionErrorMessage(error, "回答提交失败，草稿已经保留，请稍后重试。"), true, 3200);
      if (submitButton) submitButton.disabled = false;
      return;
    }

    remoteSucceeded = true;
    answer = {
      ...answer,
      ...remoteAnswer,
      receipt: normalizeReceipt(remoteAnswer.receipt),
    };
    void refreshRemoteContent().catch((error) => {
      console.warn("Answer was published, but shared content could not be refreshed.", error);
    });
  }

  finishSuccessfulSubmission({
    type: "answer",
    submission: answer,
    notification: {
      id: `notification-${Date.now()}`,
      title: experienceMode ? "回答已发布" : "回答已提交审核",
      detail: experienceMode ? "回答已经生成一张公开便签。" : "审核通过后会生成一张公开便签。",
      createdAt: new Date().toISOString(),
      read: false,
    },
    clearDraft: () => {
      delete persisted.drafts.answer[question.id];
    },
    remoteSucceeded,
    successMessage: experienceMode
      ? "回答已发布，已经贴到问答墙。"
      : "回答已提交，审核通过后会贴到问答墙。",
  });
}

function beginAnswerQuestion(questionId) {
  if (submissionsAreDisabled()) {
    showToast(runtimeMessage(), true, 2600);
    return;
  }
  const question = findQuestion(questionId);
  if (!question) return;
  if (!persisted.role) {
    requestIdentity({ type: "answer", questionId });
    return;
  }
  if (question.targetRole !== persisted.role) {
    showToast(`这道题在等${roleName(question.targetRole)}回答，请先切换身份。`);
    requestIdentity({ type: "answer", questionId });
    return;
  }
  if (question.authorSessionId === sessionId) {
    showToast("不能回答自己提出的问题。", true);
    return;
  }
  ui.selectedQuestionId = questionId;
  navigate("answer");
}

function findQuestion(questionId) {
  const fromPool = [...getAvailableQuestions(), ...persisted.myQuestions].find((question) => question.id === questionId);
  if (fromPool) return fromPool;
  const note = getAvailableNotes().find((item) => item.questionId === questionId);
  if (!note) return null;
  const askerRole = note.direction === "adult_to_child" ? "adult" : "child";
  return {
    id: note.questionId,
    direction: note.direction,
    askerRole,
    targetRole: askerRole === "adult" ? "child" : "adult",
    body: note.question,
    answerCount: note.answerCount || getAvailableNotes().filter((item) => item.questionId === note.questionId).length,
    status: "open",
    authorSessionId: "seed",
  };
}

function saveAskDraft() {
  const input = document.getElementById("ask-body");
  if (input) persisted.drafts.ask[persisted.role] = input.value;
  savePersistedState();
  showToast("草稿已保存。", false, 1600);
}

function saveAnswerDraft(questionId) {
  const input = document.getElementById("answer-body");
  if (input) persisted.drafts.answer[questionId] = input.value;
  savePersistedState();
  showToast("草稿已保存。", false, 1600);
}

async function openVerifiedFavoriteNote(noteId) {
  const result = await verifyPublicNote(noteId);
  if (result.status === "available") {
    openNote(result.note.id);
    return;
  }
  if (result.status === "missing") {
    render();
    showToast("这张便签已下架，已从收藏中移除。", true, 2800);
  } else {
    showToast("暂时无法确认便签状态，请稍后再试。", true, 2600);
  }
}

function openNote(noteId, { fromHistory = false } = {}) {
  const notes = getAvailableNotes();
  const note = findViewableNote(noteId);
  if (!note) return;
  const isPhoto = note.kind === "photo" && Boolean(note.mediaUrl);
  const group = isPhoto ? [note] : notes.filter((item) => item.questionId === note.questionId);
  const otherAnswers = group.filter((item) => item.id !== note.id);
  const direction = directionMeta(note.direction);
  const favorite = persisted.favorites.includes(note.id);
  dialog.dataset.noteId = note.id;
  dialogContent.innerHTML = `
    <div class="dialog-head">
      <h2 id="note-dialog-title">${isPhoto ? "实体便签" : "问答便签"}</h2>
      <button class="button icon-button button-ghost" type="button" data-dialog-action="close" aria-label="关闭">
        ${icon("x")}
      </button>
    </div>
    <div class="dialog-body">
      ${isPhoto ? renderPhotoNoteDetail(note, direction) : `
        <article class="detail-note note-template ${noteTemplateClass(note.direction)}">
          <span class="direction-label ${direction.className}">${direction.label}</span>
          <p class="detail-question">${escapeHtml(note.question)}</p>
          <div class="answer-block answer-block-current">
            <p class="answer-role">${note.direction === "adult_to_child" ? "小朋友说" : "大朋友说"}</p>
            <p class="answer-text">${escapeHtml(note.answer)}</p>
          </div>
        </article>
      `}
      ${
        otherAnswers.length
          ? `<section class="other-answers">
              <h3>其他回答</h3>
              ${otherAnswers
                .map(
                  (item) => `<div class="answer-block">
                    <p class="answer-role">${note.direction === "adult_to_child" ? "小朋友说" : "大朋友说"}</p>
                    <p class="answer-text">${escapeHtml(item.answer)}</p>
                  </div>`,
                )
                .join("")}
            </section>`
          : ""
      }
      <div class="dialog-actions">
        ${isPhoto ? "" : `<button class="button button-primary" type="button" data-dialog-action="answer" data-question-id="${escapeHtml(note.questionId)}">
          ${icon("pen-line")}
          我也来回答
        </button>`}
        <button class="button" type="button" data-dialog-action="favorite" data-note-id="${escapeHtml(note.id)}">
          ${icon(favorite ? "bookmark-check" : "bookmark")}
          ${favorite ? "已收藏" : "收藏"}
        </button>
        <button class="button" type="button" data-dialog-action="share" data-note-id="${escapeHtml(note.id)}">
          ${icon("share-2")}
          分享
        </button>
        <button class="button button-ghost" type="button" data-dialog-action="report" data-note-id="${escapeHtml(note.id)}">
          ${icon("flag")}
          举报
        </button>
      </div>
    </div>
  `;
  refreshIcons();
  dialog.scrollTop = 0;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  void prepareNoteForShare(note.id);

  const activeOverlayNoteId = getNavigationSnapshot()?.overlayNoteId;
  if (!fromHistory && activeOverlayNoteId !== noteId) {
    navigationDepth += 1;
    window.history.pushState(createNavigationState({ overlayNoteId: noteId }), "", `#${ui.route}`);
  }
}

function renderPhotoNoteDetail(note, direction) {
  const altText = note.altText || `实体便签。问题：${note.question}。回答：${note.answer}`;
  return `
    <article class="detail-photo-note">
      <img src="${escapeHtml(note.mediaUrl)}" alt="${escapeHtml(altText)}" decoding="async" referrerpolicy="no-referrer" />
      <div class="detail-photo-transcript">
        <span class="direction-label ${direction.className}">${direction.label}</span>
        <p class="detail-question">${escapeHtml(note.question)}</p>
        <div class="answer-block answer-block-current">
          <p class="answer-role">${note.direction === "adult_to_child" ? "小朋友说" : "大朋友说"}</p>
          <p class="answer-text">${escapeHtml(note.answer)}</p>
        </div>
      </div>
    </article>
  `;
}

function closeNoteDialog() {
  if (dialog.dataset) delete dialog.dataset.noteId;
  if (getNavigationSnapshot()?.overlayNoteId && navigationDepth > 0) {
    window.history.back();
    return;
  }
  if (getNavigationSnapshot()?.overlayNoteId) {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("note");
      window.history.replaceState(
        createNavigationState(),
        "",
        `${url.pathname}${url.search}#${ui.route}`,
      );
    } catch {
      window.history.replaceState(createNavigationState(), "", `#${ui.route}`);
    }
  }
  if (dialog.open) dialog.close();
}

function handleDialogCancel(event) {
  event.preventDefault();
  closeNoteDialog();
}

function handleDialogClick(event) {
  const target = event.target.closest("[data-dialog-action]");
  if (!target) {
    const rect = dialog.getBoundingClientRect();
    const outside =
      event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if (outside) closeNoteDialog();
    return;
  }

  const action = target.dataset.dialogAction;
  if (action === "close") {
    closeNoteDialog();
  } else if (action === "answer") {
    const questionId = target.dataset.questionId;
    dialog.close();
    beginAnswerQuestion(questionId);
  } else if (action === "favorite") {
    toggleFavorite(target.dataset.noteId);
    openNote(target.dataset.noteId);
  } else if (action === "share") {
    openShareSheet(target.dataset.noteId);
  } else if (action === "report") {
    if (window.confirm("确认举报这张便签吗？")) {
      submitReport(target.dataset.noteId);
    }
  }
}

async function submitReport(noteId) {
  if (reportsAreDisabled()) {
    showToast(runtimeMessage("当前暂时不能提交举报。"), true, 2600);
    return;
  }
  if (backend.enabled) {
    try {
      await backend.createReport({ noteId, reporterSessionId: sessionId });
    } catch (error) {
      console.error("Unable to submit report.", error);
      showToast(submissionErrorMessage(error, "举报提交失败，请稍后重试。"), true, 2600);
      return;
    }
  }
  showToast("举报已提交，我们会尽快处理。", false, 2400);
  closeNoteDialog();
}

async function verifyPublicNote(noteId) {
  const id = normalizePublicNoteId(noteId);
  if (!id) return { status: "missing", note: null };
  if (runtimeStatus.emergencyLockdown) return { status: "unavailable", note: null };
  if (!backend.enabled) {
    const note = findViewableNote(id);
    if (note) markPublicNoteVerified(note);
    return note ? { status: "available", note } : { status: "missing", note: null };
  }
  if (!remoteAvailable || typeof backend.loadNote !== "function") {
    return { status: "unavailable", note: null };
  }

  let note;
  const verificationEpoch = publicNoteVerificationEpoch;
  try {
    note = await backend.loadNote(id);
  } catch (error) {
    console.warn("Unable to verify the note against the public wall.", error);
    return { status: "unavailable", note: null };
  }
  if (
    verificationEpoch !== publicNoteVerificationEpoch ||
    !remoteAvailable ||
    runtimeStatus.emergencyLockdown
  ) {
    return { status: "unavailable", note: null };
  }
  if (!note) {
    purgeUnavailablePublicNotes([id]);
    invalidateFavoriteNote(id);
    return { status: "missing", note: null };
  }

  const liveIndex = remoteNotes.findIndex((item) => item.id === id);
  if (liveIndex >= 0) remoteNotes[liveIndex] = note;
  markPublicNoteVerified(note);
  if (persisted.favorites.includes(id)) {
    const snapshot = createFavoriteNoteSnapshot(note);
    if (snapshot) {
      const snapshotsById = new Map(persisted.favoriteNotes.map((item) => [item.id, item]));
      snapshotsById.set(id, snapshot);
      persisted.favoriteNotes = persisted.favorites
        .map((favoriteId) => snapshotsById.get(favoriteId))
        .filter(Boolean);
      validatedFavoriteNoteIds.add(id);
      savePersistedState();
    }
  }
  return { status: "available", note };
}

function invalidateFavoriteNote(noteId) {
  const id = normalizePublicNoteId(noteId);
  if (!id) return false;
  const previousCount = persisted.favorites.length;
  persisted.favorites = persisted.favorites.filter((favoriteId) => favoriteId !== id);
  persisted.favoriteNotes = persisted.favoriteNotes.filter((note) => note.id !== id);
  validatedFavoriteNoteIds.delete(id);
  verifiedPublicNotes.delete(id);
  verifiedPublicNoteTimestamps.delete(id);
  noteShareImageCache.delete(id);
  if (persisted.favorites.length !== previousCount) savePersistedState();
  return persisted.favorites.length !== previousCount;
}

function toggleFavorite(noteId) {
  const note = findViewableNote(noteId);
  if (!note) return false;
  const index = persisted.favorites.indexOf(note.id);
  if (index >= 0) persisted.favorites.splice(index, 1);
  else {
    persisted.favorites.push(note.id);
    validatedFavoriteNoteIds.add(note.id);
    markPublicNoteVerified(note);
    if (persisted.favorites.length > FAVORITE_LIMIT) {
      const removedIds = persisted.favorites.splice(0, persisted.favorites.length - FAVORITE_LIMIT);
      removedIds.forEach((id) => {
        validatedFavoriteNoteIds.delete(id);
      });
    }
  }
  if (index >= 0) {
    validatedFavoriteNoteIds.delete(note.id);
  }
  syncFavoriteNoteSnapshots({ save: false });
  const saved = savePersistedState();
  showToast(
    saved
      ? index >= 0
        ? "已取消收藏。"
        : "已收藏，可在“我的”里再次分享。"
      : "当前浏览器无法长期保存收藏。",
    !saved,
    saved ? 1800 : 2600,
  );
  return index < 0;
}

function openShareSheet(noteId) {
  const id = normalizePublicNoteId(noteId);
  const note = findViewableNote(id);
  if (!id || !note) {
    showToast("这张便签已经不可见。", true, 2400);
    return;
  }
  if (!shareDialog || !shareDialogContent) {
    void shareNote(id);
    return;
  }

  shareDialog.dataset.noteId = id;
  refreshShareSheet(id);
  if (!shareDialog.open) shareDialog.showModal();
  void prepareNoteForShare(id).then((result) => {
    if (shareDialog.open && shareDialog.dataset.noteId === id) {
      refreshShareSheet(id, result.status);
    }
  });
}

function refreshShareSheet(noteId, preparationStatus = "") {
  if (!shareDialogContent) return;
  const note = findViewableNote(noteId);
  if (!note) {
    clearShareSheetPreview();
    shareDialogContent.innerHTML = `
      <div class="action-sheet-handle" aria-hidden="true"></div>
      <div class="action-sheet-head">
        <div><h2 id="share-dialog-title">便签已经不可见</h2><p>可能已被作者或管理员下架。</p></div>
        <button class="action-sheet-close" type="button" data-share-action="close" aria-label="关闭分享菜单">${icon("x")}</button>
      </div>
    `;
    refreshIcons();
    return;
  }

  const cached = getPreparedNoteShareImage(note);
  const imageReady = Boolean(cached?.blob);
  const previewUrl = imageReady ? getShareSheetPreviewUrl(cached.blob) : getShareSheetPreviewUrl(null);
  const imageFailed = preparationStatus === "ready" && cached && !cached.blob;
  const isPhoto = note.kind === "photo";
  const imageStatus = imageReady
    ? `${isPhoto ? "实体便签原图" : "便签图片"}已准备好`
    : imageFailed
      ? "图片暂时无法生成，仍可复制链接"
      : isPhoto
        ? "正在读取实体便签原图…"
        : "正在生成高清便签图片…";
  shareDialogContent.innerHTML = `
    <div class="action-sheet-handle" aria-hidden="true"></div>
    <div class="action-sheet-head">
      <div>
        <p class="action-sheet-kicker">分享便签</p>
        <h2 id="share-dialog-title">把喜欢的这一张带走</h2>
        <p class="share-sheet-status${imageFailed ? " is-error" : ""}">${escapeHtml(imageStatus)}</p>
      </div>
      <button class="action-sheet-close" type="button" data-share-action="close" aria-label="关闭分享菜单">${icon("x")}</button>
    </div>
    <div class="share-sheet-preview"${imageReady ? " data-ready=\"true\"" : ""} aria-live="polite">
      ${
        previewUrl
          ? `<img src="${escapeHtml(previewUrl)}" alt="即将分享或保存的便签图片预览" />
             <span class="share-sheet-preview-label">保存前预览</span>`
          : `<div class="share-sheet-preview-placeholder">
              ${icon(imageFailed ? "image-off" : "loader-circle")}
              <span>${escapeHtml(imageFailed ? "暂时无法显示图片预览" : "正在准备图片预览…")}</span>
            </div>`
      }
    </div>
    <div class="action-sheet-options share-sheet-options">
      <button class="action-sheet-option" type="button" data-share-action="share-image"${imageReady ? "" : " disabled"}>
        <span class="action-sheet-option-icon">${icon(imageReady ? "share-2" : "loader-circle")}</span>
        <span><strong>分享便签图片</strong><small>${imageReady ? "调起手机系统分享" : "图片准备好后即可使用"}</small></span>
        ${icon("chevron-right")}
      </button>
      <button class="action-sheet-option" type="button" data-share-action="save-image"${imageReady ? "" : " disabled"}>
        <span class="action-sheet-option-icon">${icon("download")}</span>
        <span><strong>保存图片</strong><small>保存到手机后再发给朋友</small></span>
        ${icon("chevron-right")}
      </button>
      <button class="action-sheet-option" type="button" data-share-action="copy-link">
        <span class="action-sheet-option-icon">${icon("link")}</span>
        <span><strong>复制链接</strong><small>链接会直接打开这张便签</small></span>
        ${icon("chevron-right")}
      </button>
    </div>
  `;
  refreshIcons();
}

function clearShareSheetPreview() {
  if (sharePreviewObjectUrl && typeof URL.revokeObjectURL === "function") {
    try {
      URL.revokeObjectURL(sharePreviewObjectUrl);
    } catch {
      // Closing the sheet must remain safe when a browser rejects Blob URL cleanup.
    }
  }
  sharePreviewObjectUrl = "";
  sharePreviewBlob = null;
}

function getShareSheetPreviewUrl(blob) {
  if (!blob) {
    clearShareSheetPreview();
    return "";
  }
  if (sharePreviewBlob === blob && sharePreviewObjectUrl) return sharePreviewObjectUrl;

  clearShareSheetPreview();
  if (typeof URL.createObjectURL !== "function") return "";
  try {
    sharePreviewObjectUrl = URL.createObjectURL(blob);
    sharePreviewBlob = blob;
    return sharePreviewObjectUrl;
  } catch {
    sharePreviewObjectUrl = "";
    sharePreviewBlob = null;
    return "";
  }
}

function closeShareSheet() {
  if (shareDialog?.open) shareDialog.close();
  if (shareDialog?.dataset) delete shareDialog.dataset.noteId;
  clearShareSheetPreview();
}

function handleShareDialogCancel(event) {
  event.preventDefault();
  closeShareSheet();
}

function handleShareDialogClick(event) {
  const target = event.target.closest("[data-share-action]");
  if (!target) {
    const rect = shareDialog.getBoundingClientRect();
    const outside =
      event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom;
    if (outside) closeShareSheet();
    return;
  }

  const noteId = shareDialog.dataset.noteId;
  const action = target.dataset.shareAction;
  if (action === "close") {
    closeShareSheet();
  } else if (action === "share-image") {
    void sharePreparedNoteImage(noteId);
  } else if (action === "save-image") {
    savePreparedNoteImage(noteId);
  } else if (action === "copy-link") {
    void copyNoteLink(noteId);
  }
}

async function prepareNoteForShare(noteId) {
  const id = normalizePublicNoteId(noteId);
  if (!id) return { status: "missing", note: null, imageBlob: null };
  const pending = noteSharePreparationPromises.get(id);
  if (pending) return pending;

  const preparation = (async () => {
    let note = getFreshVerifiedPublicNote(id);
    if (!note) {
      const verification = await verifyPublicNote(id);
      if (verification.status !== "available") {
        return { ...verification, imageBlob: null };
      }
      note = verification.note;
    }

    const cached = getPreparedNoteShareImage(note);
    if (cached) return { status: "ready", note, imageBlob: cached.blob };

    let imageBlob = null;
    try {
      imageBlob = await createNoteImageBlob(note);
    } catch (error) {
      console.warn("Unable to create a share image for this note.", error);
    }

    const current = getFreshVerifiedPublicNote(id);
    if (!current || noteShareContentKey(current) !== noteShareContentKey(note)) {
      return { status: "unavailable", note: null, imageBlob: null };
    }
    cachePreparedNoteShareImage(current, imageBlob);
    return { status: "ready", note: current, imageBlob };
  })();

  noteSharePreparationPromises.set(id, preparation);
  preparation.finally(() => {
    if (noteSharePreparationPromises.get(id) === preparation) {
      noteSharePreparationPromises.delete(id);
    }
  });
  return preparation;
}

function noteShareContentKey(note) {
  return JSON.stringify([
    note?.kind === "photo" ? "photo" : "text",
    note?.direction || "",
    note?.question || "",
    note?.answer || "",
    note?.kind === "photo" ? normalizePhotoMediaUrl(note?.mediaUrl || note?.imageUrl) : "",
  ]);
}

function getPreparedNoteShareImage(note) {
  const id = normalizePublicNoteId(note?.id);
  if (!id) return null;
  const cached = noteShareImageCache.get(id);
  if (!cached || cached.contentKey !== noteShareContentKey(note)) {
    noteShareImageCache.delete(id);
    return null;
  }
  noteShareImageCache.delete(id);
  noteShareImageCache.set(id, cached);
  return cached;
}

function cachePreparedNoteShareImage(note, blob) {
  const id = normalizePublicNoteId(note?.id);
  if (!id) return;
  noteShareImageCache.delete(id);
  noteShareImageCache.set(id, { contentKey: noteShareContentKey(note), blob: blob || null });
  while (noteShareImageCache.size > NOTE_SHARE_IMAGE_CACHE_LIMIT) {
    const oldestId = noteShareImageCache.keys().next().value;
    noteShareImageCache.delete(oldestId);
  }
}

async function shareNote(noteId) {
  const id = normalizePublicNoteId(noteId);
  const result = await prepareNoteForShare(id);
  if (result.status !== "ready" || !result.imageBlob) {
    showToast(
      result.status === "missing" ? "这张便签已下架，无法继续分享。" : "便签图片暂时无法生成。",
      true,
      2800,
    );
    return false;
  }
  return sharePreparedNoteImage(id);
}

async function sharePreparedNoteImage(noteId) {
  const id = normalizePublicNoteId(noteId);
  const note = findViewableNote(id);
  const prepared = note ? getPreparedNoteShareImage(note) : null;
  if (!note || !prepared?.blob) {
    showToast("便签图片还没准备好，请稍候。", true, 2200);
    return false;
  }

  const url = createWallShareUrl(note.id);
  const text = `问：${note.question}\n答：${note.answer}`;
  const imageBlob = prepared.blob;

  if (
    !nativeShareUnavailable &&
    !nativeFileShareUnavailable &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    typeof File === "function"
  ) {
    let file = null;
    let canShareFile = false;
    try {
      file = new File([imageBlob], noteImageFilename(note, imageBlob), {
        type: noteImageMimeType(imageBlob),
      });
      canShareFile = navigator.canShare({ files: [file] });
      if (!canShareFile) nativeFileShareUnavailable = true;
    } catch (error) {
      nativeFileShareUnavailable = true;
      console.warn("Unable to prepare the note image for native sharing.", error);
    }

    if (file && canShareFile) {
      const result = await attemptNativeShare({
        title: `${BRAND_NAME}的一张便签`,
        text: `${text}\n${url}`,
        files: [file],
      });
      if (result === "shared") {
        closeShareSheet();
        return true;
      }
      if (result === "aborted") return false;
      nativeFileShareUnavailable = true;
    }
  }

  const copyPromise = copyShareText(`${text}\n${url}`);
  let downloaded = false;
  if (imageBlob) {
    try {
      downloadNoteImage(imageBlob, note);
      downloaded = true;
    } catch (error) {
      console.warn("Unable to download the note image.", error);
    }
  }
  const copied = await copyPromise;

  if (downloaded) {
    showToast(copied ? "图片已保存，分享文字和链接已复制。" : "便签图片已保存。", false, 2600);
  } else {
    showToast(copied ? "便签文字和链接已复制。" : "暂时无法分享，请稍后再试。", !copied, 2200);
  }
  return downloaded || copied;
}

function savePreparedNoteImage(noteId) {
  const note = findViewableNote(noteId);
  const prepared = note ? getPreparedNoteShareImage(note) : null;
  if (!note || !prepared?.blob) {
    showToast("便签图片还没准备好，请稍候。", true, 2200);
    return false;
  }
  try {
    downloadNoteImage(prepared.blob, note);
    showToast("便签图片已保存。", false, 2000);
    return true;
  } catch (error) {
    console.warn("Unable to download the note image.", error);
    showToast("当前浏览器无法保存图片。", true, 2400);
    return false;
  }
}

async function copyNoteLink(noteId) {
  const note = findViewableNote(noteId);
  if (!note) {
    showToast("这张便签已经不可见。", true, 2200);
    return false;
  }
  const copied = await copyShareText(createWallShareUrl(note.id));
  showToast(copied ? "便签链接已复制。" : "暂时无法复制，请稍后再试。", !copied, 2200);
  return copied;
}

async function attemptNativeShare(payload) {
  try {
    await navigator.share(payload);
    return "shared";
  } catch (error) {
    if (error?.name === "AbortError") return "aborted";
    console.warn("Native sharing failed; trying the next fallback.", error);
    return "failed";
  }
}

function createWallShareUrl(noteId) {
  const url = new URL(window.location.href);
  url.search = "";
  const id = normalizePublicNoteId(noteId);
  if (id) url.searchParams.set("note", id);
  url.hash = "wall";
  return url.href;
}

function noteImageMimeType(blob) {
  const mime = String(blob?.type || "").split(";", 1)[0].trim().toLowerCase();
  return PHOTO_NOTE_MIME_EXTENSIONS[mime] ? mime : "image/png";
}

function noteImageFilename(note, blob = null) {
  const safeTitle = Array.from(note.question)
    .slice(0, 12)
    .join("")
    .replace(/[\\/:*?"<>|]/g, "")
    .trim();
  const mime = noteImageMimeType(blob);
  const extension = PHOTO_NOTE_MIME_EXTENSIONS[mime] || "png";
  return `${BRAND_NAME}-${safeTitle || "便签"}.${extension}`;
}

async function copyShareText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function downloadNoteImage(blob, note) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = noteImageFilename(note, blob);
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function createNoteImageBlob(note) {
  if (note?.kind === "photo") return loadPhotoNoteBlob(note);

  const template = noteExportTemplates[note.direction] || noteExportTemplates.child_to_adult;
  const image = await loadNoteTemplateImage(template.asset);
  const canvas = document.createElement("canvas");
  canvas.width = template.width;
  canvas.height = template.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas is unavailable.");

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  drawNoteCanvasText(context, note.question, template.question, template, 700);
  drawNoteCanvasText(context, note.answer, template.answer, template, 600);

  return canvasToPngBlob(canvas);
}

async function loadPhotoNoteBlob(note) {
  const mediaUrl = normalizePhotoMediaUrl(note?.mediaUrl || note?.imageUrl);
  if (!mediaUrl) throw new Error("The photographed note URL is not trusted.");

  const response = await fetch(mediaUrl, {
    cache: "force-cache",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw new Error(`Unable to download the photographed note (${response.status}).`);
  if (response.url && !normalizePhotoMediaUrl(response.url)) {
    throw new Error("The photographed note redirected to an untrusted location.");
  }

  const headerMime = String(response.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (!PHOTO_NOTE_MIME_EXTENSIONS[headerMime]) {
    throw new Error("The photographed note has an unsupported image type.");
  }

  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > PHOTO_NOTE_MAX_DOWNLOAD_BYTES) {
    throw new Error("The photographed note is too large to share.");
  }

  const blob = await response.blob();
  if (!blob.size || blob.size > PHOTO_NOTE_MAX_DOWNLOAD_BYTES) {
    throw new Error("The photographed note is empty or too large to share.");
  }
  const blobMime = String(blob.type || headerMime).split(";", 1)[0].trim().toLowerCase();
  if (!PHOTO_NOTE_MIME_EXTENSIONS[blobMime] || blobMime !== headerMime) {
    throw new Error("The photographed note image type is inconsistent.");
  }
  return blob.type === headerMime ? blob : blob.slice(0, blob.size, headerMime);
}

function loadNoteTemplateImage(asset) {
  if (noteTemplateImageCache.has(asset)) return noteTemplateImageCache.get(asset);
  const imagePromise = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${asset}`));
    image.src = new URL(asset, window.location.href).href;
  });
  noteTemplateImageCache.set(asset, imagePromise);
  imagePromise.catch(() => {
    if (noteTemplateImageCache.get(asset) === imagePromise) noteTemplateImageCache.delete(asset);
  });
  return imagePromise;
}

function drawNoteCanvasText(context, value, region, template, fontWeight) {
  const box = {
    x: Math.round(region.x * template.width),
    y: Math.round(region.y * template.height),
    width: Math.round(region.width * template.width),
    height: Math.round(region.height * template.height),
  };
  const padding = Math.max(8, Math.round(box.width * 0.012));
  const fit = fitCanvasText(
    context,
    value,
    box.width - padding * 2,
    box.height - padding * 2,
    region.maxFont,
    region.minFont,
    fontWeight,
  );

  context.save();
  context.fillStyle = template.ink;
  context.font = canvasFont(fontWeight, fit.fontSize);
  context.textBaseline = "top";
  context.shadowColor = "rgba(255, 255, 255, 0.64)";
  context.shadowOffsetY = 1;
  fit.lines.forEach((line, index) => {
    context.fillText(line, box.x + padding, box.y + padding + index * fit.lineHeight);
  });
  context.restore();
}

function fitCanvasText(context, value, maxWidth, maxHeight, maxFont, minFont, fontWeight) {
  let text = String(value || "").trim();
  const fitText = () => {
    for (let fontSize = maxFont; fontSize >= minFont; fontSize -= 2) {
      context.font = canvasFont(fontWeight, fontSize);
      const lines = wrapCanvasText(context, text, maxWidth);
      const lineHeight = Math.round(fontSize * 1.55);
      if (lines.length * lineHeight <= maxHeight) return { lines, fontSize, lineHeight };
    }
    return null;
  };

  const fitted = fitText();
  if (fitted) return fitted;

  const compactedText = text.replace(/\s*\n+\s*/g, " ");
  if (compactedText !== text) {
    text = compactedText;
    const compactedFit = fitText();
    if (compactedFit) return compactedFit;
  }

  context.font = canvasFont(fontWeight, minFont);
  const lineHeight = Math.round(minFont * 1.55);
  const lines = wrapCanvasText(context, text, maxWidth);
  const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));
  const visibleLines = lines.slice(0, maxLines);
  if (lines.length > maxLines) {
    const graphemes = splitGraphemes(visibleLines[maxLines - 1]);
    while (graphemes.length && context.measureText(`${graphemes.join("")}…`).width > maxWidth) {
      graphemes.pop();
    }
    visibleLines[maxLines - 1] = `${graphemes.join("")}…`;
  }
  return { lines: visibleLines, fontSize: minFont, lineHeight };
}

function wrapCanvasText(context, value, maxWidth) {
  const lines = [];
  String(value || "")
    .replaceAll("\r", "")
    .split("\n")
    .forEach((paragraph) => {
      if (!paragraph) {
        lines.push("");
        return;
      }
      let line = "";
      splitGraphemes(paragraph).forEach((grapheme) => {
        const candidate = `${line}${grapheme}`;
        if (line && context.measureText(candidate).width > maxWidth) {
          lines.push(line);
          line = grapheme;
        } else {
          line = candidate;
        }
      });
      if (line) lines.push(line);
    });
  return lines.length ? lines : [""];
}

function splitGraphemes(value) {
  if (globalThis.Intl?.Segmenter) {
    return [...new Intl.Segmenter("zh-CN", { granularity: "grapheme" }).segment(value)].map(
      (item) => item.segment,
    );
  }
  return Array.from(value);
}

function canvasFont(weight, size) {
  return `${weight} ${size}px "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif`;
}

function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Unable to encode the note image."));
    }, "image/png");
  });
}

function updateCounter(id, value, limit) {
  const counter = document.getElementById(id);
  if (counter) counter.textContent = `${countCharacters(value)} / ${limit}`;
}

function showToast(message, isError = false, duration = 2200) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
    toast.classList.remove("is-error");
  }, duration);
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
  }
}

function icon(name) {
  return `<i data-lucide="${name}" aria-hidden="true"></i>`;
}

function directionMeta(direction) {
  if (direction === "adult_to_child") {
    return { label: "大朋友问 → 小朋友答", className: "direction-adult" };
  }
  return { label: "小朋友问 → 大朋友答", className: "direction-child" };
}

function noteTemplateClass(direction) {
  return direction === "adult_to_child" ? "note-template-adult-to-child" : "note-template-child-to-adult";
}

function roleName(role) {
  return role === "adult" ? "大朋友" : role === "child" ? "小朋友" : "游客";
}

function formatDate(value) {
  const date = new Date(value);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function countCharacters(value) {
  return Array.from(String(value || "").trim()).length;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
