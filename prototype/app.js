const STORAGE_KEY = "question-wall-prototype-v1";
const SESSION_KEY = "question-wall-prototype-session";
const SEEN_NOTES_COOKIE_KEY = "question-wall-prototype-seen-v1";
const SEEN_NOTES_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;
const SEEN_NOTES_COOKIE_LIMIT = 80;
const SWIPE_HINT_SESSION_KEY = "question-wall-swipe-hint-seen";

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

const sessionId = getOrCreateSessionId();
const persisted = loadPersistedState();
savePersistedState();
const seenNoteIds = loadSeenNoteIds();

const ui = {
  route: getRouteFromHash(),
  selectedQuestionId: null,
  mineTab: "questions",
  pendingIntent: null,
  recommendationIds: [],
  recommendationIndex: -1,
  feedMotion: "idle",
  showSwipeHint: shouldShowSwipeHint(),
};

const app = document.getElementById("app");
const dialog = document.getElementById("note-dialog");
const dialogContent = document.getElementById("note-dialog-content");
const toast = document.getElementById("toast");
let toastTimer = null;
let suppressNoteClickUntil = 0;

document.addEventListener("DOMContentLoaded", async () => {
  app.addEventListener("click", handleClick);
  app.addEventListener("input", handleInput);
  app.addEventListener("submit", handleSubmit);
  app.addEventListener("touchstart", handleTouchStart, { passive: true });
  app.addEventListener("touchmove", handleTouchMove, { passive: false });
  app.addEventListener("touchend", handleTouchEnd, { passive: false });
  app.addEventListener("touchcancel", handleTouchCancel, { passive: true });
  document.addEventListener("keydown", handleKeydown);
  dialog.addEventListener("click", handleDialogClick);
  window.addEventListener("popstate", () => {
    ui.route = getRouteFromHash();
    render();
  });
  render();

  if (backend.enabled) {
    try {
      await refreshRemoteContent({ resetRecommendations: true });
      render();
    } catch (error) {
      console.error("Unable to load shared question-wall content.", error);
      showToast("在线内容暂时不可用，已进入本地演示模式。", true, 3200);
    }
  }
});

async function refreshRemoteContent({ resetRecommendations = false } = {}) {
  const content = await backend.loadContent();
  remoteNotes = content.notes;
  remoteQuestions = content.questions;
  remoteAvailable = true;

  if (resetRecommendations) {
    ui.recommendationIds = [];
    ui.recommendationIndex = -1;
  }
}

function getAvailableNotes() {
  return remoteAvailable ? remoteNotes : seedNotes;
}

function getAvailableQuestions() {
  return remoteAvailable ? remoteQuestions : seedQuestions;
}

function isExperienceMode() {
  return backend.enabled && backend.experienceMode;
}

function getOrCreateSessionId() {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const generated = globalThis.crypto?.randomUUID?.() || `session-${Date.now()}`;
  localStorage.setItem(SESSION_KEY, generated);
  return generated;
}

function loadPersistedState() {
  const fallback = {
    role: null,
    favorites: [],
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
    const answerDrafts =
      parsedDrafts.answer && typeof parsedDrafts.answer === "object" && !Array.isArray(parsedDrafts.answer)
        ? Object.fromEntries(Object.entries(parsedDrafts.answer).filter(([, value]) => typeof value === "string"))
        : {};

    return {
      role,
      favorites: Array.isArray(parsed.favorites)
        ? parsed.favorites.filter((id) => typeof id === "string")
        : fallback.favorites,
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
      authorSessionId: typeof item.authorSessionId === "string" ? item.authorSessionId : sessionId,
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
    }));
}

function savePersistedState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
}

function loadSeenNoteIds() {
  try {
    const encodedName = `${encodeURIComponent(SEEN_NOTES_COOKIE_KEY)}=`;
    const cookie = document.cookie
      .split("; ")
      .find((item) => item.startsWith(encodedName));
    if (!cookie) return new Set();

    const parsed = JSON.parse(decodeURIComponent(cookie.slice(encodedName.length)));
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

function rememberSeenNote(noteId) {
  if (!noteId) return;

  const latest = loadSeenNoteIds();
  seenNoteIds.forEach((id) => latest.add(id));
  latest.add(noteId);
  seenNoteIds.clear();
  [...latest].slice(-SEEN_NOTES_COOKIE_LIMIT).forEach((id) => seenNoteIds.add(id));

  try {
    const value = encodeURIComponent(JSON.stringify([...seenNoteIds]));
    document.cookie = `${encodeURIComponent(SEEN_NOTES_COOKIE_KEY)}=${value}; Max-Age=${SEEN_NOTES_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
  } catch {
    // The in-memory set still prevents repeats for this visit when cookies are unavailable.
  }
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

function getRouteFromHash() {
  const rawHash = window.location.hash;
  const route = rawHash.replace(/^#\/?/, "");
  const allowed = ["home", "wall", "discover", "identity", "participate", "ask", "pool", "answer", "mine"];
  if (!rawHash || !route) return "home";
  return allowed.includes(route) ? route : "wall";
}

function navigate(route, options = {}) {
  Object.assign(ui, options);
  ui.route = route;
  const nextHash = `#${route}`;
  if (window.location.hash !== nextHash) {
    window.history.pushState({ route }, "", nextHash);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
  render();
}

function render() {
  const content = renderRoute();
  const isLanding = ui.route === "home";
  const isFeed = ui.route === "wall" || ui.route === "discover";
  const hasMobileNav = !isLanding && !["identity", "ask", "answer"].includes(ui.route);
  app.innerHTML = `
    <div class="app-shell${hasMobileNav ? " has-mobile-nav" : ""}${isLanding ? " landing-shell" : ""}${isFeed ? " feed-shell" : ""}">
      ${isLanding ? "" : renderTopbar()}
      <main id="main-content" class="page-main" tabindex="-1">${content}</main>
      ${hasMobileNav ? renderMobileNav() : ""}
    </div>
  `;
  ui.feedMotion = "idle";
  refreshIcons();
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
    case "discover":
      return renderDiscoverPage();
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
      <div class="landing-content">
        <div class="landing-brand" aria-label="问问墙">
          <span class="landing-brand-mark" aria-hidden="true"><i></i><i></i></span>
          <span>问问墙</span>
        </div>
        <p class="landing-kicker">大人 × 小朋友 · 双向问答</p>
        <h1 id="landing-title">把一个问题，交给另一代</h1>
        <p class="landing-copy">你可以先问，也可以先回答。每一张便签，都是一次认真听见。</p>

        <div class="landing-actions">
          <button class="landing-action landing-action-ask" type="button" data-action="landing-ask">
            <span class="landing-action-icon">${icon("message-circle-question")}</span>
            <span>我要提问</span>
            ${icon("arrow-up-right")}
          </button>
          <button class="landing-action landing-action-answer" type="button" data-action="landing-answer">
            <span class="landing-action-icon">${icon("messages-square")}</span>
            <span>我要回答</span>
            ${icon("arrow-up-right")}
          </button>
        </div>

        <button class="landing-browse" type="button" data-action="landing-browse" aria-label="随便看看，也可以向上滑动进入">
          <span class="landing-browse-line" aria-hidden="true"></span>
          <span>随便看看</span>
          <span class="landing-browse-arrow" aria-hidden="true">↑</span>
        </button>
      </div>

      <p class="landing-footnote">上滑直接浏览 · 参与时再选择身份</p>
    </section>
  `;
}

function renderTopbar() {
  const roleLabel = persisted.role ? roleName(persisted.role) : "选择身份";
  return `
    <header class="topbar-wrap">
      <div class="topbar">
        <button class="brand-button" type="button" data-action="navigate" data-route="wall" aria-label="回到问答墙">
          <span class="brand-mark" aria-hidden="true">
            <span class="brand-paper brand-paper-adult"></span>
            <span class="brand-paper brand-paper-child"></span>
          </span>
          <span class="brand-copy">
            <span class="brand-name">问问墙</span>
            <span class="brand-tagline">大人和小朋友的双向问答</span>
          </span>
        </button>

        <nav class="desktop-nav" aria-label="主要导航">
          ${desktopNavButton("wall", "问答墙")}
          ${desktopNavButton("participate", "参与")}
          ${desktopNavButton("mine", "我的")}
        </nav>

        <div class="topbar-actions">
          <button class="button identity-button" type="button" data-action="choose-role" aria-label="当前身份：${escapeHtml(roleLabel)}">
            ${icon(persisted.role === "adult" ? "briefcase-business" : persisted.role === "child" ? "sparkles" : "user-round")}
            <span class="role-button-text">${escapeHtml(roleLabel)}</span>
          </button>
        </div>
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
      ${mobileNavButton("participate", "pen-line", "参与")}
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

function navRouteIsCurrent(route) {
  if (route === "wall") {
    return ui.route === "wall" || ui.route === "discover";
  }
  if (route === "participate") {
    return ["identity", "participate", "ask", "pool", "answer"].includes(ui.route);
  }
  return ui.route === route;
}

function renderWallPage() {
  return renderRecommendationPage();
}

function renderDiscoverPage() {
  return renderRecommendationPage();
}

function renderRecommendationPage() {
  const note = getCurrentRecommendation();
  return `
    <section class="recommendation-page" aria-label="推荐问答">
      <div class="recommendation-content">
        ${note ? renderSingleNoteViewer(note) : renderRecommendationEnd()}
      </div>
    </section>
  `;
}

function renderSingleNoteViewer(note) {
  const canGoBack = ui.recommendationIndex > 0;
  const canGoForward = ui.recommendationIndex < ui.recommendationIds.length - 1 || Boolean(peekNextRecommendation());
  return `
    <section class="single-note-viewer feed-motion-${ui.feedMotion}" aria-label="单张便签浏览">
      <div class="single-note-viewer-head">
        <span class="recommendation-label">${icon("sparkles")} 推荐</span>
      </div>
      <div class="single-note-stage">
        <button class="single-note-nav single-note-nav-prev" type="button" data-action="wall-prev" aria-label="上一张便签"${canGoBack ? "" : " disabled"}>
          ${icon("chevron-up")}
        </button>
        ${renderNoteCard(note)}
        <button class="single-note-nav single-note-nav-next" type="button" data-action="wall-next" aria-label="下一张便签"${canGoForward ? "" : " disabled"}>
          ${icon("chevron-down")}
        </button>
      </div>
      <div class="single-note-viewer-foot">
        ${
          ui.showSwipeHint
            ? `<span class="single-note-gesture-hint">
                <span class="single-note-gesture-icon" aria-hidden="true">↑</span>
                上滑继续
              </span>`
            : `<span class="single-note-gesture-hint single-note-gesture-hint-quiet" aria-hidden="true">
                <span class="single-note-gesture-icon">↑</span>
              </span>`
        }
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
  return getRecommendedNotes().find((note) => !seenNoteIds.has(note.id)) || null;
}

function getCurrentRecommendation() {
  const currentId = ui.recommendationIds[ui.recommendationIndex];
  const current = getAvailableNotes().find((note) => note.id === currentId);
  if (current) return current;

  const next = peekNextRecommendation();
  if (!next) return null;
  ui.recommendationIds.push(next.id);
  ui.recommendationIndex = ui.recommendationIds.length - 1;
  rememberSeenNote(next.id);
  return next;
}

function renderNoteCard(note) {
  const direction = directionMeta(note.direction);
  const answerCount = note.answerCount || getAvailableNotes().filter((item) => item.questionId === note.questionId).length;
  return `
    <button
      class="note-sheet note-template ${noteTemplateClass(note.direction)}"
      type="button"
      data-action="open-note"
      data-note-id="${note.id}"
      aria-label="查看问答：${escapeHtml(note.question)}"
    >
      <span class="note-topline">
        <span class="direction-label ${direction.className}">${direction.label}</span>
      </span>
      <span class="note-question">${escapeHtml(note.question)}</span>
      <span class="note-answer-label">${note.direction === "adult_to_child" ? "小朋友说" : "大人说"}</span>
      <span class="note-answer">${escapeHtml(note.answer)}</span>
      <span class="note-footer">
        <span>${answerCount > 1 ? `${answerCount} 个回答` : formatDate(note.createdAt)}</span>
        <span class="note-open-hint">展开 ${icon("arrow-up-right")}</span>
      </span>
    </button>
  `;
}

function renderRecommendationEnd() {
  return `
    <div class="recommendation-end" role="status">
      <span class="recommendation-end-icon" aria-hidden="true">${icon("check")}</span>
      <div>
        <p class="page-kicker">已经看到这里</p>
        <h1>这一批便签看完了</h1>
        <p>有新便签时，推荐会从这里继续。</p>
      </div>
    </div>
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
        <button class="button button-ghost" type="button" data-action="continue-browsing">
          ${icon("arrow-left")}
          继续逛逛
        </button>
      </div>

      <div class="role-grid">
        ${roleChoice("adult", "user-round", "我是大人", "向小朋友提问 · 回答小朋友的问题")}
        ${roleChoice("child", "user-round", "我是小朋友", "向大人提问 · 回答大人的问题")}
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

function renderParticipatePage() {
  const role = persisted.role;
  const askTarget = role === "adult" ? "小朋友" : "大人";
  const answerFrom = role === "adult" ? "小朋友" : "大人";
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
        <button class="action-choice" type="button" data-action="start-ask">
          <span class="choice-icon">${icon("message-circle-question")}</span>
          <span class="choice-copy">
            <span class="choice-action">开始提问 ${icon("arrow-right")}</span>
            <h2>提个问题</h2>
            <p>把一个问题交给${askTarget}</p>
          </span>
        </button>
        <button class="action-choice" type="button" data-action="start-answer">
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
  const target = role === "adult" ? "小朋友" : "大人";
  const direction = role === "adult" ? "adult_to_child" : "child_to_adult";
  const draft = persisted.drafts.ask[role] || "";
  return `
    <div class="page-inner">
      <div class="page-heading-row">
        <div>
          <p class="page-kicker">${roleName(role)}提问</p>
          <h1>问${target}一个问题</h1>
        </div>
        <button class="button button-ghost" type="button" data-action="navigate" data-route="participate">
          ${icon("arrow-left")}
          返回
        </button>
      </div>

      <form id="ask-form" class="form-layout" data-form="ask">
        <section class="form-section" aria-labelledby="ask-form-title">
          <h2 id="ask-form-title" class="sr-only">填写问题</h2>
          <div class="form-stack">
            <div>
              <div class="field-head">
                <label class="field-name" for="ask-body">你的问题</label>
                <span id="ask-count" class="character-count">${countCharacters(draft)} / 80</span>
              </div>
              <textarea id="ask-body" class="text-area" name="body" minlength="5" maxlength="80" required placeholder="写下你真正想知道的事">${escapeHtml(draft)}</textarea>
            </div>

            <label class="switch-label" for="ask-anonymous">
              <input id="ask-anonymous" name="anonymous" type="checkbox" checked />
              匿名显示
            </label>

            <div class="privacy-hint">
              ${icon("shield-check")}
              <span>请不要填写真实姓名、学校、电话、住址或其他联系方式。</span>
            </div>

            <div class="form-actions">
              <span class="autosave-label">${icon("save")} 草稿已自动保存</span>
              <button class="button ${role === "adult" ? "button-adult" : "button-child"}" type="submit">
                ${icon("send")}
                ${isExperienceMode() ? "发布问题" : "提交审核"}
              </button>
            </div>
          </div>
        </section>

        <details class="preview-section">
          <summary class="preview-toggle">${icon("scan-eye")} 预览便签</summary>
          ${renderPreviewNote({ direction, question: draft || "你的问题会出现在这里", answer: `等待${target}回答` })}
        </details>
      </form>
    </div>
  `;
}

function renderPoolPage() {
  if (!persisted.role) return renderIdentityPage();
  const questions = getPoolQuestions();
  const sourceRole = persisted.role === "adult" ? "小朋友" : "大人";
  return `
    <div class="page-inner">
      <div class="page-heading-row">
        <div>
          <p class="page-kicker">${roleName(persisted.role)}的问题池</p>
          <h1>${sourceRole}正在问</h1>
          <p class="page-subtitle">${questions.length} 个问题在等你的回答。</p>
        </div>
        <button class="button button-primary" type="button" data-action="random-question">
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
    >
      <span class="direction-label ${direction.className}">${direction.label}</span>
      <span class="question-card-title">${escapeHtml(question.body)}</span>
      <span class="question-card-meta">${question.answerCount} 个回答</span>
      <span class="question-card-action">轻点回答 ${icon("arrow-right")}</span>
    </button>
  `;
}

function renderPoolEmptyState() {
  return `
    <div class="empty-state">
      <div class="empty-state-inner">
        <h2>暂时没有待回答问题</h2>
        <p>新的问题会出现在这里，也可以去问答墙随便看看。</p>
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
        <button class="button button-ghost" type="button" data-action="navigate" data-route="pool">
          ${icon("arrow-left")}
          返回问题池
        </button>
      </div>

      <div class="question-context">
        <p class="question-context-label">${roleName(question.askerRole)}问</p>
        <p class="question-context-text">${escapeHtml(question.body)}</p>
      </div>

      <form id="answer-form" class="form-layout" data-form="answer" data-question-id="${question.id}">
        <section class="form-section" aria-labelledby="answer-form-title">
          <h2 id="answer-form-title" class="sr-only">填写回答</h2>
          <div class="form-stack">
            <div>
              <div class="field-head">
                <label class="field-name" for="answer-body">你的回答</label>
                <span id="answer-count" class="character-count">${countCharacters(draft)} / 160</span>
              </div>
              <textarea id="answer-body" class="text-area" name="body" maxlength="160" required placeholder="认真说说你的想法">${escapeHtml(draft)}</textarea>
            </div>

            <label class="switch-label" for="answer-anonymous">
              <input id="answer-anonymous" name="anonymous" type="checkbox" checked />
              匿名显示
            </label>

            <div class="privacy-hint">
              ${icon("shield-check")}
              <span>请不要填写真实姓名、学校、电话、住址或其他联系方式。</span>
            </div>

            <div class="form-actions">
              <span class="autosave-label">${icon("save")} 草稿已自动保存</span>
              <button class="button ${persisted.role === "adult" ? "button-adult" : "button-child"}" type="submit">
                ${icon("send")}
                ${isExperienceMode() ? "发布回答" : "提交审核"}
              </button>
            </div>
          </div>
        </section>

        <details class="preview-section">
          <summary class="preview-toggle">${icon("scan-eye")} 预览便签</summary>
          ${renderPreviewNote({ direction: question.direction, question: question.body, answer: draft || "你的回答会出现在这里" })}
        </details>
      </form>
    </div>
  `;
}

function renderPreviewNote({ direction, question, answer }) {
  const directionInfo = directionMeta(direction);
  return `
    <div class="note-sheet note-template ${noteTemplateClass(direction)} preview-note">
      <span class="direction-label ${directionInfo.className}">${directionInfo.label}</span>
      <span class="note-question" data-preview="question">${escapeHtml(question)}</span>
      <span class="note-divider" aria-hidden="true"></span>
      <span class="note-answer" data-preview="answer">${escapeHtml(answer)}</span>
      <span class="note-footer">
        <span>预览</span>
      </span>
    </div>
  `;
}

function renderMinePage() {
  if (!persisted.role && !persisted.myQuestions.length && !persisted.myAnswers.length) {
    return `
      <div class="page-inner">
        <div class="page-heading-row">
          <div>
            <p class="page-kicker">我的</p>
            <h1>选择身份后开始记录问答</h1>
          </div>
        </div>
        <div class="role-grid">
          ${roleChoice("adult", "user-round", "我是大人", "查看和管理大人身份下的参与记录")}
          ${roleChoice("child", "user-round", "我是小朋友", "查看和管理小朋友身份下的参与记录")}
        </div>
      </div>
    `;
  }

  return `
    <div class="page-inner">
      <div class="page-heading-row">
        <div>
          <p class="page-kicker">我的</p>
          <h1>${persisted.role ? roleName(persisted.role) : "参与记录"}</h1>
        </div>
      </div>

      ${persisted.role ? renderIdentityBar() : ""}

      <div class="mine-tabs" role="tablist" aria-label="我的内容">
        ${mineTabButton("questions", "我的提问")}
        ${mineTabButton("answers", "我的回答")}
        ${mineTabButton("favorites", "收藏")}
        ${mineTabButton("notifications", "消息")}
      </div>

      <div role="tabpanel">${renderMineTabContent()}</div>
    </div>
  `;
}

function mineTabButton(value, label) {
  return `<button class="mine-tab" type="button" role="tab" data-action="mine-tab" data-value="${value}" aria-selected="${ui.mineTab === value}">${label}</button>`;
}

function renderMineTabContent() {
  if (ui.mineTab === "questions") {
    if (!persisted.myQuestions.length) return mineEmpty("还没有提问", "去问一个真正想知道的问题", "start-ask", "提个问题");
    return `<div class="content-list">${persisted.myQuestions.map((item) => contentRow(item.body, `${directionMeta(item.direction).label} · ${item.anonymous === false ? "公开身份" : "匿名"}`, item.status)).join("")}</div>`;
  }

  if (ui.mineTab === "answers") {
    if (!persisted.myAnswers.length) return mineEmpty("还没有回答", "问题池里有人正在等你的想法", "start-answer", "去回答");
    return `<div class="content-list">${persisted.myAnswers.map((item) => contentRow(item.body, `回答：${item.questionBody} · ${item.anonymous === false ? "公开身份" : "匿名"}`, item.status)).join("")}</div>`;
  }

  if (ui.mineTab === "favorites") {
    const favorites = getAvailableNotes().filter((note) => persisted.favorites.includes(note.id));
    if (!favorites.length) return mineEmpty("还没有收藏", "在问答墙打开便签后可以收藏", "navigate", "去问答墙", "wall");
    return `<div class="note-wall">${favorites.map(renderNoteCard).join("")}</div>`;
  }

  if (!persisted.notifications.length) return mineEmpty("暂时没有消息", "收到回答和审核结果后会出现在这里", "navigate", "去问答墙", "wall");
  return `<div class="content-list">${persisted.notifications.map((item) => contentRow(item.title, item.detail, item.read ? "published" : "pending")).join("")}</div>`;
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
    rejected: ["", "需要修改"],
    hidden: ["", "已隐藏"],
  };
  const [className, label] = map[status] || ["", status];
  return `<span class="status-label ${className}">${label}</span>`;
}

function handleClick(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "open-note" && performance.now() < suppressNoteClickUntil) {
    event.preventDefault();
    return;
  }

  if (action === "navigate") {
    navigate(target.dataset.route);
  } else if (action === "continue-browsing") {
    ui.pendingIntent = null;
    navigate("wall");
  } else if (action === "landing-ask") {
    startAsk();
  } else if (action === "landing-answer") {
    startAnswer();
  } else if (action === "landing-browse") {
    navigate("discover");
  } else if (action === "wall-prev") {
    moveWall(-1);
  } else if (action === "wall-next") {
    moveWall(1);
  } else if (action === "choose-role") {
    ui.pendingIntent = null;
    navigate("identity");
  } else if (action === "select-role") {
    selectRole(target.dataset.role);
  } else if (action === "start-ask") {
    startAsk();
  } else if (action === "start-answer") {
    startAnswer();
  } else if (action === "open-note") {
    openNote(target.dataset.noteId);
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
    render();
  }
}

function moveWall(delta) {
  if (delta < 0) {
    if (ui.recommendationIndex <= 0) return;
    ui.recommendationIndex -= 1;
    ui.feedMotion = "previous";
  } else {
    if (ui.recommendationIndex < ui.recommendationIds.length - 1) {
      ui.recommendationIndex += 1;
    } else {
      const next = peekNextRecommendation();
      if (!next) {
        showToast("这一批便签已经看完了。", false, 1800);
        return;
      }
      ui.recommendationIds.push(next.id);
      ui.recommendationIndex += 1;
      rememberSeenNote(next.id);
    }
    ui.feedMotion = "next";
  }

  dismissSwipeHint();
  render();
}

function handleKeydown(event) {
  if (ui.route !== "wall" && ui.route !== "discover") return;
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
    if (target.closest("button, a, input, textarea, select")) return;
    const touch = event.touches[0];
    touchGestureStart = {
      kind: "landing",
      x: touch.clientX,
      y: touch.clientY,
      axis: null,
      moved: false,
    };
    return;
  }

  if ((ui.route !== "wall" && ui.route !== "discover") || !target.closest(".single-note-stage")) {
    return;
  }

  const touch = event.touches[0];
  touchGestureStart = {
    kind: "viewer",
    x: touch.clientX,
    y: touch.clientY,
    axis: null,
    moved: false,
  };
}

function handleTouchMove(event) {
  if (!touchGestureStart || event.touches.length !== 1) return;
  const touch = event.touches[0];
  const dx = touch.clientX - touchGestureStart.x;
  const dy = touch.clientY - touchGestureStart.y;

  if (!touchGestureStart.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 10) {
    if (Math.abs(dy) > Math.abs(dx) * 1.2) touchGestureStart.axis = "y";
    if (Math.abs(dx) > Math.abs(dy) * 1.2) touchGestureStart.axis = "x";
  }
  if (Math.hypot(dx, dy) > 10) touchGestureStart.moved = true;

  if (touchGestureStart.kind === "viewer" && touchGestureStart.axis === "y") {
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

  if (start.kind === "landing") {
    if (dy < -56 && verticalDistance > horizontalDistance * 1.15) {
      event.preventDefault();
      navigate("discover");
    }
    return;
  }

  if (ui.route !== "wall" && ui.route !== "discover") return;
  if (start.moved) suppressNoteClickUntil = performance.now() + 450;
  const verticalSwipe =
    (start.axis === "y" || start.axis === null) &&
    verticalDistance >= 52 &&
    verticalDistance > horizontalDistance * 1.2;
  if (!verticalSwipe) return;

  event.preventDefault();
  moveWall(dy < 0 ? 1 : -1);
}

function handleTouchCancel() {
  touchGestureStart = null;
}

function handleInput(event) {
  if (event.target.id === "ask-body") {
    persisted.drafts.ask[persisted.role] = event.target.value;
    savePersistedState();
    updateCounter("ask-count", event.target.value, 80);
    updatePreview("question", event.target.value || "你的问题会出现在这里");
  }

  if (event.target.id === "answer-body") {
    const question = findQuestion(ui.selectedQuestionId);
    if (!question) return;
    persisted.drafts.answer[question.id] = event.target.value;
    savePersistedState();
    updateCounter("answer-count", event.target.value, 160);
    updatePreview("answer", event.target.value || "你的回答会出现在这里");
  }
}

function handleSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();

  if (form.dataset.form === "ask") submitQuestion(form);
  if (form.dataset.form === "answer") submitAnswer(form);
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
    navigate("ask");
    return;
  }

  if (intent?.type === "answer" && intent.questionId) {
    const question = findQuestion(intent.questionId);
    if (question?.targetRole === role) {
      ui.selectedQuestionId = question.id;
      navigate("answer");
    } else {
      showToast(`这道题在等${roleName(question?.targetRole)}回答，已为你打开适合的问题池。`);
      navigate("pool");
    }
    return;
  }

  if (intent?.type === "answer") {
    navigate("pool");
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

  navigate("participate");
}

function startAsk() {
  if (!persisted.role) {
    ui.pendingIntent = { type: "ask" };
    navigate("identity");
    return;
  }
  navigate("ask");
}

function startAnswer() {
  if (!persisted.role) {
    ui.pendingIntent = { type: "answer" };
    navigate("identity");
    return;
  }
  navigate("pool");
}

async function submitQuestion(form) {
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

  const submitButton = form.querySelector('button[type="submit"]');
  if (backend.enabled) {
    if (submitButton) submitButton.disabled = true;
    try {
      const remoteQuestion = await backend.createQuestion({
        id: question.id,
        authorSessionId: sessionId,
        authorRole: persisted.role,
        body,
        anonymous,
      });
      question = { ...question, ...remoteQuestion, anonymous, authorSessionId: sessionId };
    } catch (error) {
      console.error("Unable to publish question.", error);
      showToast("问题发布失败，草稿已经保留，请稍后重试。", true, 3200);
      if (submitButton) submitButton.disabled = false;
      return;
    }

    try {
      await refreshRemoteContent();
    } catch (error) {
      console.warn("Question was published, but shared content could not be refreshed.", error);
    }
  }

  persisted.myQuestions.unshift(question);
  persisted.notifications.unshift({
    id: `notification-${Date.now()}`,
    title: experienceMode ? "问题已发布" : "问题已提交审核",
    detail: experienceMode
      ? `问题已经进入${roleName(targetRole)}的问题池。`
      : `审核通过后会进入${roleName(targetRole)}的问题池。`,
    createdAt: new Date().toISOString(),
    read: false,
  });
  persisted.drafts.ask[persisted.role] = "";
  savePersistedState();
  ui.mineTab = "questions";
  showToast(experienceMode ? "问题已发布，正在等待回答。" : "问题已提交，审核通过后会进入问题池。", false, 2800);
  navigate("mine");
}

async function submitAnswer(form) {
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

  const submitButton = form.querySelector('button[type="submit"]');
  if (backend.enabled) {
    if (submitButton) submitButton.disabled = true;
    try {
      const remoteAnswer = await backend.createAnswer({
        id: answer.id,
        questionId: question.id,
        authorSessionId: sessionId,
        authorRole: persisted.role,
        body,
        anonymous,
      });
      answer = { ...answer, ...remoteAnswer };
    } catch (error) {
      console.error("Unable to publish answer.", error);
      showToast("回答发布失败，草稿已经保留，请稍后重试。", true, 3200);
      if (submitButton) submitButton.disabled = false;
      return;
    }


    try {
      await refreshRemoteContent();
    } catch (error) {
      console.warn("Answer was published, but shared content could not be refreshed.", error);
    }
  }

  persisted.myAnswers.unshift(answer);
  persisted.notifications.unshift({
    id: `notification-${Date.now()}`,
    title: experienceMode ? "回答已发布" : "回答已提交审核",
    detail: experienceMode ? "回答已经生成一张公开便签。" : "审核通过后会生成一张公开便签。",
    createdAt: new Date().toISOString(),
    read: false,
  });
  delete persisted.drafts.answer[question.id];
  savePersistedState();
  ui.mineTab = "answers";
  showToast(experienceMode ? "回答已发布，已经贴到问答墙。" : "回答已提交，审核通过后会贴到问答墙。", false, 2800);
  navigate("mine");
}

function beginAnswerQuestion(questionId) {
  const question = findQuestion(questionId);
  if (!question) return;
  if (!persisted.role) {
    ui.pendingIntent = { type: "answer", questionId };
    navigate("identity");
    return;
  }
  if (question.targetRole !== persisted.role) {
    ui.pendingIntent = { type: "answer", questionId };
    showToast(`这道题在等${roleName(question.targetRole)}回答，请先切换身份。`);
    navigate("identity");
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

function openNote(noteId) {
  const notes = getAvailableNotes();
  const note = notes.find((item) => item.id === noteId);
  if (!note) return;
  const group = notes.filter((item) => item.questionId === note.questionId);
  const otherAnswers = group.filter((item) => item.id !== note.id);
  const direction = directionMeta(note.direction);
  const favorite = persisted.favorites.includes(note.id);
  dialogContent.innerHTML = `
    <div class="dialog-head">
      <h2 id="note-dialog-title">问答便签</h2>
      <button class="button icon-button button-ghost" type="button" data-dialog-action="close" aria-label="关闭">
        ${icon("x")}
      </button>
    </div>
    <div class="dialog-body">
      <article class="detail-note note-template ${noteTemplateClass(note.direction)}">
        <span class="direction-label ${direction.className}">${direction.label}</span>
        <p class="detail-question">${escapeHtml(note.question)}</p>
        <div class="answer-block answer-block-current">
          <p class="answer-role">${note.direction === "adult_to_child" ? "小朋友说" : "大人说"}</p>
          <p class="answer-text">${escapeHtml(note.answer)}</p>
        </div>
      </article>
      ${
        otherAnswers.length
          ? `<section class="other-answers">
              <h3>其他回答</h3>
              ${otherAnswers
                .map(
                  (item) => `<div class="answer-block">
                    <p class="answer-role">${note.direction === "adult_to_child" ? "小朋友说" : "大人说"}</p>
                    <p class="answer-text">${escapeHtml(item.answer)}</p>
                  </div>`,
                )
                .join("")}
            </section>`
          : ""
      }
      <div class="dialog-actions">
        <button class="button button-primary" type="button" data-dialog-action="answer" data-question-id="${note.questionId}">
          ${icon("pen-line")}
          我也来回答
        </button>
        <button class="button" type="button" data-dialog-action="favorite" data-note-id="${note.id}">
          ${icon(favorite ? "bookmark-check" : "bookmark")}
          ${favorite ? "已收藏" : "收藏"}
        </button>
        <button class="button" type="button" data-dialog-action="share" data-note-id="${note.id}">
          ${icon("share-2")}
          分享
        </button>
        <button class="button button-ghost" type="button" data-dialog-action="report" data-note-id="${note.id}">
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
}

function handleDialogClick(event) {
  const target = event.target.closest("[data-dialog-action]");
  if (!target) {
    const rect = dialog.getBoundingClientRect();
    const outside =
      event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
    if (outside) dialog.close();
    return;
  }

  const action = target.dataset.dialogAction;
  if (action === "close") {
    dialog.close();
  } else if (action === "answer") {
    const questionId = target.dataset.questionId;
    dialog.close();
    beginAnswerQuestion(questionId);
  } else if (action === "favorite") {
    toggleFavorite(target.dataset.noteId);
    openNote(target.dataset.noteId);
  } else if (action === "share") {
    shareNote(target.dataset.noteId);
  } else if (action === "report") {
    if (window.confirm("确认举报这张便签吗？")) {
      submitReport(target.dataset.noteId);
    }
  }
}

async function submitReport(noteId) {
  if (backend.enabled) {
    try {
      await backend.createReport({ noteId, reporterSessionId: sessionId });
    } catch (error) {
      console.error("Unable to submit report.", error);
      showToast("举报提交失败，请稍后重试。", true, 2600);
      return;
    }
  }
  showToast("举报已提交，我们会尽快处理。", false, 2400);
  dialog.close();
}

function toggleFavorite(noteId) {
  const index = persisted.favorites.indexOf(noteId);
  if (index >= 0) persisted.favorites.splice(index, 1);
  else persisted.favorites.push(noteId);
  savePersistedState();
  showToast(index >= 0 ? "已取消收藏。" : "已收藏。", false, 1400);
}

async function shareNote(noteId) {
  const note = getAvailableNotes().find((item) => item.id === noteId);
  if (!note) return;
  const text = `${note.question}\n${note.answer}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "问问墙的一张便签", text });
    } else {
      await navigator.clipboard.writeText(text);
      showToast("便签文字已复制。", false, 1600);
    }
  } catch (error) {
    if (error?.name !== "AbortError") showToast("暂时无法分享，请稍后再试。", true);
  }
}

function updateCounter(id, value, limit) {
  const counter = document.getElementById(id);
  if (counter) counter.textContent = `${countCharacters(value)} / ${limit}`;
}

function updatePreview(type, value) {
  const element = document.querySelector(`[data-preview="${type}"]`);
  if (element) element.textContent = value;
}

function showToast(message, isError = false, duration = 2200) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.style.background = isError ? "#8f2922" : "";
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
    toast.style.background = "";
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
    return { label: "大人问 → 小朋友答", className: "direction-adult" };
  }
  return { label: "小朋友问 → 大人答", className: "direction-child" };
}

function noteTemplateClass(direction) {
  return direction === "adult_to_child" ? "note-template-adult-to-child" : "note-template-child-to-adult";
}

function roleName(role) {
  return role === "adult" ? "大人" : role === "child" ? "小朋友" : "游客";
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
