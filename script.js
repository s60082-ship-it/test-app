// ==============================================
// Test Prep App - Main Script
// ==============================================

// ----------------------------------------------
// Constants
// ----------------------------------------------

// localStorage key names
const KEYS = {
  progress  : "study-pwa-progress",
  theme     : "study-pwa-theme",
  time      : "study-pwa-time",
  tests     : "study-pwa-tests",
  mistakes  : "study-pwa-mistakes",
  scores    : "study-pwa-scores",
  terms     : "study-pwa-terms",
  subjects  : "study-pwa-subjects",
  questions : "study-pwa-questions",
};

// Default value for progress object
const DEFAULT_PROGRESS  = { total: 0, correct: 0, doneIds: [] };
// Default value for timeData object
const DEFAULT_TIME_DATA = { activeSession: null, sessions: [] };

// Preset subject colors (10 colors)
const PRESET_COLORS = [
  "#2563eb", "#7c3aed", "#dc2626", "#d97706", "#16a34a",
  "#0891b2", "#db2777", "#ea580c", "#059669", "#4338ca",
];

// Note: Mistake note categories are now derived dynamically from the
// "テスト予定" (tests) data. See testSubjectsForNoteCategory() below.

// ----------------------------------------------
// Utility functions
// ----------------------------------------------

// Generate a unique ID
function generateId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Escape HTML special characters to prevent XSS
function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Validate color string to prevent CSS injection - only #RRGGBB format allowed
function safeColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : PRESET_COLORS[0];
}

// Save data to localStorage as JSON
// Returns true on success, false on failure (e.g. quota exceeded, private browsing)
function save(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (err) {
    console.warn("Save failed:", key, err);
    return false;
  }
}

// Compress an image File to a JPEG data URL, resizing to fit within maxWidth.
// Returns "" if no file or on error. Used to keep localStorage payload small.
function compressImageFile(file, maxWidth = 1280, quality = 0.82) {
  return new Promise((resolve) => {
    if (!file || !file.type?.startsWith("image/")) { resolve(""); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale  = Math.min(1, maxWidth / img.width);
        const w      = Math.max(1, Math.round(img.width  * scale));
        const h      = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(""); return; }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL("image/jpeg", quality));
        } catch {
          resolve("");
        }
      };
      img.onerror = () => resolve("");
      img.src = reader.result;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

// Load a JSON object from localStorage, merging with fallback defaults
function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...fallback };
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return { ...fallback };
  }
}

// Load an array from localStorage, returning empty array on failure
function loadArray(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ----------------------------------------------
// Date utilities
// ----------------------------------------------

// Format a Date as "YYYY-MM-DD"
function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Return a new Date offset by the given number of days
function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// Return how many days from today until dateStr (negative if in the past)
function daysUntil(dateStr) {
  const today  = new Date(`${dateKey()}T00:00:00`);
  const target = new Date(`${dateStr}T00:00:00`);
  return Math.ceil((target - today) / 86400000);
}

// Format "YYYY-MM-DD" as "M/D"
function formatDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Return a human-readable countdown label in Japanese
function countdownLabel(days) {
  if (days === 0) return "今日";
  if (days > 0)   return `あと${days}日`;
  return `${Math.abs(days)}日前`;
}

// Format milliseconds as "X時間Y分" or "Y分"
function formatDuration(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}時間${m}分` : `${m}分`;
}

// Format milliseconds as "MM:SS"
function formatClock(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(totalSec / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

// ----------------------------------------------
// DOM helpers
// ----------------------------------------------

// Shorthand for document.querySelector
const $  = (sel) => document.querySelector(sel);
// Shorthand for document.querySelectorAll returning an array
const $$ = (sel) => [...document.querySelectorAll(sel)];

// ----------------------------------------------
// App state - shared across all screens
// ----------------------------------------------

let progress  = loadJson(KEYS.progress, DEFAULT_PROGRESS);
let timeData  = loadJson(KEYS.time, DEFAULT_TIME_DATA);
let tests     = loadArray(KEYS.tests);
let mistakes  = loadArray(KEYS.mistakes);
let scores    = loadArray(KEYS.scores);
let terms     = loadArray(KEYS.terms);
let subjects  = loadArray(KEYS.subjects);
// User-managed questions (empty by default)
let questions = loadArray(KEYS.questions);

let currentIndex  = 0;       // Current question index in the quiz
let answered      = false;   // Whether the current question has been answered
let timerId       = null;    // Study timer interval ID

// Subject modal state
let editingSubjectId = null;
let pickedColor      = PRESET_COLORS[0];

// Edit modal target IDs
let editingQuestionId = null;
let editingTermId     = null;
let editingTestId     = null;
let editingScoreId    = null;
let editingNoteId     = null;
let editingSessionKey = null; // session.id or session.startAt as fallback

let noteFilter         = "all"; // Mistake note status filter (all/open/reviewed)
let noteCategoryFilter = "all"; // Mistake note category filter (all/category name/"" for 未分類)
let termSearch    = "";      // Vocabulary search keyword
let termCatFilter = "all";   // Vocabulary category filter
let redSheetMode  = false;   // Red sheet mode toggle
let favoriteOnly  = false;   // Show favorites only toggle
let termCardIndex = 0;       // Current flashcard position

// ----------------------------------------------
// Progress calculations
// ----------------------------------------------

// Return completion rate as a percentage (0 if no questions)
function completionRate() {
  if (!questions.length) return 0;
  return Math.round((progress.doneIds.length / questions.length) * 100);
}

// Return answer correct rate as a percentage
function correctRate() {
  return progress.total === 0
    ? 0
    : Math.round((progress.correct / progress.total) * 100);
}

// Return subjects sorted by their order property
function sortedSubjects() {
  return [...subjects].sort((a, b) => a.order - b.order);
}

// ----------------------------------------------
// Render: Header / Home
// ----------------------------------------------

// Update header and home screen statistics
function renderProgress() {
  $("#total-count").textContent     = progress.total;
  $("#correct-rate").textContent    = `${correctRate()}%`;
  $("#done-count").textContent      = progress.doneIds.length;
  $("#header-progress").textContent = `${completionRate()}%`;
}

// Render the home screen (daily question and upcoming tests)
function renderHome() {
  if (questions.length) {
    if (currentIndex >= questions.length) currentIndex = 0;
    const q = questions[currentIndex];
    $("#home-question").textContent = `${q.subject}: ${q.question}`;
  } else {
    $("#home-question").textContent = "問題がまだ登録されていません。「一覧」から追加してください。";
  }
  renderHomeTests();
}

// ----------------------------------------------
// Render: Question list
// ----------------------------------------------

// Render all question cards in the list screen
function renderQuestionList() {
  const listEl = $("#question-list");
  if (!questions.length) {
    listEl.innerHTML = `
      <div class="glass-card" style="padding:24px; text-align:center">
        <p class="empty-text" style="margin-bottom:12px">問題がまだ登録されていません。</p>
        <p class="empty-text">上の「追加」ボタンから問題を登録してください。</p>
      </div>`;
    return;
  }
  listEl.innerHTML = questions.map((q, i) => {
    const done = progress.doneIds.includes(q.id);
    return `
      <div class="question-item-wrap ${done ? "done" : ""}">
        <button class="question-item-body" data-question-index="${i}" type="button">
          <small>${escapeHtml(q.subject)} / ${done ? "回答済み" : "未回答"}</small>
          <strong>${escapeHtml(q.question)}</strong>
        </button>
        <div class="question-item-actions">
          <button class="icon-btn-sm" data-question-edit="${escapeHtml(q.id)}" type="button" aria-label="編集">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
            </svg>
          </button>
          <button class="icon-btn-sm danger" data-question-delete="${escapeHtml(q.id)}" type="button" aria-label="削除">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <polyline points="3,6 5,6 21,6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>`;
  }).join("");
}

// ----------------------------------------------
// Render: Quiz
// ----------------------------------------------

// Reset and render the quiz screen for the current question
function renderQuiz() {
  // Show empty state when no questions are registered
  if (!questions.length) {
    $("#quiz-subject").textContent = "";
    $("#quiz-question").textContent = "問題が登録されていません。「一覧」タブから問題を追加してください。";
    $("#answer-buttons").innerHTML = "";
    const resultEl = $("#result-message");
    resultEl.textContent    = "";
    resultEl.dataset.result = "";
    $("#explanation-panel").classList.remove("visible");
    return;
  }

  if (currentIndex >= questions.length) currentIndex = 0;
  const q = questions[currentIndex];
  answered = false;

  $("#quiz-subject").textContent  = q.subject;
  $("#quiz-question").textContent = q.question;

  const resultEl = $("#result-message");
  resultEl.textContent    = "答えを選んでください。";
  resultEl.dataset.result = "";

  $("#answer-buttons").innerHTML = (q.choices ?? [])
    .map((c) => `<button class="answer-button" type="button">${escapeHtml(c)}</button>`)
    .join("");

  $("#explanation-panel").classList.remove("visible");
  const body   = $("#expl-body");
  const toggle = $("#expl-toggle");
  body.classList.remove("open");
  body.setAttribute("aria-hidden", "true");
  toggle.setAttribute("aria-expanded", "false");
  toggle.querySelector("span").textContent = "詳しく見る";
}

// Handle a choice button tap
function answer(choice, button) {
  if (answered || !questions.length) return;
  answered = true;

  const q         = questions[currentIndex];
  const isCorrect = choice === q.answer;

  progress.total += 1;
  if (isCorrect) progress.correct += 1;
  if (!progress.doneIds.includes(q.id)) progress.doneIds.push(q.id);

  $$(".answer-button").forEach((btn) => {
    if (btn.textContent.trim() === q.answer) btn.classList.add("correct");
  });
  if (!isCorrect) {
    button.classList.add("wrong");
    upsertMistake(q, choice);
  }

  const resultEl = $("#result-message");
  resultEl.textContent    = isCorrect ? "正解！" : "不正解...";
  resultEl.dataset.result = isCorrect ? "correct" : "wrong";

  showExplanationPanel(q);
  save(KEYS.progress, progress);
  renderProgress();
  renderQuestionList();
}

// Populate and show the explanation panel for the given question
function showExplanationPanel(q) {
  const reviewMap = {
    1: { label: "基礎定着", cls: "low" },
    2: { label: "要復習",   cls: "mid" },
    3: { label: "重点復習", cls: "high" },
  };
  const rv = reviewMap[q.reviewLevel] ?? reviewMap[2];

  $("#expl-text").textContent = q.explanation ?? "";

  $("#expl-points").innerHTML = (q.points ?? [])
    .map((p) => `<li class="expl-point-item">${escapeHtml(p)}</li>`)
    .join("");

  $("#expl-terms").innerHTML = (q.relatedTerms ?? [])
    .map((t) => `<span class="expl-term-chip">${escapeHtml(t)}</span>`)
    .join("");

  $("#expl-review").innerHTML =
    `<span class="review-badge review-${rv.cls}">${rv.label}</span>`;

  $("#explanation-panel").classList.add("visible");
}

// Advance to the next question
function nextQuestion() {
  if (!questions.length) return;
  currentIndex = (currentIndex + 1) % questions.length;
  renderHome();
  renderQuiz();
}

// ----------------------------------------------
// Render: Study time
// ----------------------------------------------

// Return all sessions including the currently active one
function sessionsWithActive() {
  const list = [...timeData.sessions];
  if (timeData.activeSession) {
    list.push({
      ...timeData.activeSession,
      endAt:      new Date().toISOString(),
      durationMs: Date.now() - new Date(timeData.activeSession.startAt).getTime(),
    });
  }
  return list;
}

// Return the duration in ms for a session object
function sessionDuration(s) {
  return s.durationMs ?? Math.max(0, new Date(s.endAt) - new Date(s.startAt));
}

// Render the full study time screen
function renderTimeStats() {
  const sessions = sessionsWithActive();
  const today    = dateKey();
  const keys     = Array.from({ length: 7 }, (_, i) => dateKey(addDays(new Date(), i - 6)));

  const totalMs = (key) =>
    sessions
      .filter((s) => s.date === key)
      .reduce((sum, s) => sum + sessionDuration(s), 0);

  const todayMs = totalMs(today);
  const weekMs  = keys.reduce((sum, k) => sum + totalMs(k), 0);

  const studiedDays = new Set(
    sessions.filter((s) => sessionDuration(s) > 0).map((s) => s.date)
  );
  let streak = 0;
  let cursor = new Date();
  while (studiedDays.has(dateKey(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }

  $("#today-study-time").textContent = formatDuration(todayMs);
  $("#week-study-time").textContent  = formatDuration(weekMs);
  $("#streak-days").textContent      = `${streak}日`;

  renderSubjectTimes(sessions);

  const barVals = keys.map(totalMs);
  const maxBar  = Math.max(...barVals, 1);
  $("#study-chart").innerHTML = keys
    .map((key, i) => {
      const d   = new Date(`${key}T00:00:00`);
      const lbl = `${d.getMonth() + 1}/${d.getDate()}`;
      const h   = Math.max(8, Math.round((barVals[i] / maxBar) * 132));
      return `<div class="bar-col"><i style="height:${h}px"></i><small>${lbl}</small></div>`;
    })
    .join("");

  renderActiveSession();
}

// Render subject-by-subject study time progress bars
function renderSubjectTimes(sessions) {
  const sorted = sortedSubjects();
  const totals = Object.fromEntries(sorted.map((s) => [s.name, 0]));
  sessions.forEach((s) => {
    if (s.subject in totals) totals[s.subject] += sessionDuration(s);
    else totals[s.subject] = (totals[s.subject] ?? 0) + sessionDuration(s);
  });
  const max = Math.max(...Object.values(totals), 1);

  $("#subject-time-list").innerHTML = sorted
    .map((subj) => {
      const ms    = totals[subj.name] ?? 0;
      const w     = Math.max(3, Math.round((ms / max) * 100));
      const color = safeColor(subj.color);
      return `
        <div class="subject-time-row">
          <strong>${escapeHtml(subj.icon)} ${escapeHtml(subj.name)}<small>${formatDuration(ms)}</small></strong>
          <div class="progress-track">
            <span class="progress-fill" style="width:${w}%; background:${color}"></span>
          </div>
        </div>`;
    })
    .join("");
}

// Update the session start/stop button display
function renderActiveSession() {
  const btn = $("#session-toggle");
  const sel = $("#study-subject");

  if (timeData.activeSession) {
    const elapsed = Date.now() - new Date(timeData.activeSession.startAt).getTime();
    $("#active-duration").textContent = formatClock(elapsed);
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="6" y="6" width="12" height="12" rx="2" />
      </svg>
      学習終了`;
    sel.value    = timeData.activeSession.subject;
    sel.disabled = true;
  } else {
    $("#active-duration").textContent = "00:00";
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5v14l11-7-11-7Z" />
      </svg>
      学習開始`;
    sel.disabled = false;
  }
}

// Toggle study session start/stop
function toggleSession() {
  if (timeData.activeSession) {
    const endAt   = new Date();
    const startAt = new Date(timeData.activeSession.startAt);
    timeData.sessions.push({
      id:         generateId(),            // ID assigned for edit/delete support
      ...timeData.activeSession,
      endAt:      endAt.toISOString(),
      durationMs: Math.max(0, endAt - startAt),
    });
    timeData.activeSession = null;
    clearInterval(timerId);
    timerId = null;
  } else {
    const startAt = new Date();
    timeData.activeSession = {
      subject: $("#study-subject").value,
      startAt: startAt.toISOString(),
      date:    dateKey(startAt),
    };
    startTimer();
  }
  save(KEYS.time, timeData);
  renderTimeStats();
  renderSessionList();
}

// Start the 1-second timer for updating elapsed session time
function startTimer() {
  clearInterval(timerId);
  if (!timeData.activeSession) return;
  timerId = setInterval(renderTimeStats, 1000);
}

// ----------------------------------------------
// Render: Session history list
// ----------------------------------------------

// Generate HTML for a single session item
function sessionItemHtml(session) {
  const key = session.id ?? session.startAt;
  const dur = formatDuration(session.durationMs ?? 0);
  return `
    <div class="session-item">
      <div class="session-info">
        <strong>${escapeHtml(session.subject)}</strong>
        <small>${session.date} / ${dur}</small>
      </div>
      <div class="session-actions">
        <button class="icon-btn-sm" data-session-edit="${escapeHtml(key)}" type="button" aria-label="編集">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
          </svg>
        </button>
        <button class="icon-btn-sm danger" data-session-delete="${escapeHtml(key)}" type="button" aria-label="削除">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="3,6 5,6 21,6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
    </div>`;
}

// Render session history list (latest 20 entries, newest first)
function renderSessionList() {
  const el = $("#session-list");
  if (!el) return;
  const sessions = [...timeData.sessions].reverse().slice(0, 20);
  el.innerHTML = sessions.length
    ? sessions.map(sessionItemHtml).join("")
    : `<p class="empty-text">学習記録はまだありません。</p>`;
}

// ----------------------------------------------
// Render: Test management
// ----------------------------------------------

// Return tests sorted by date
function sortedTests() {
  return [...tests].sort((a, b) => a.date.localeCompare(b.date));
}

// Return only upcoming (today and future) tests
function upcomingTests() {
  return sortedTests().filter((t) => daysUntil(t.date) >= 0);
}

// Generate HTML for a test card with edit/delete buttons
function testCardHtml(test) {
  const days  = daysUntil(test.date);
  const label = countdownLabel(days);
  return `
    <article class="calendar-card glass-card ${days < 0 ? "past" : ""}">
      <div class="calendar-date">
        <span>${formatDate(test.date)}</span>
        <small>${label}</small>
      </div>
      <div class="calendar-body">
        <div class="calendar-body-top">
          <strong>${escapeHtml(test.name)}</strong>
          <div class="card-actions">
            <button class="icon-btn-sm" data-test-edit="${escapeHtml(test.id)}" type="button" aria-label="編集">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
              </svg>
            </button>
            <button class="icon-btn-sm danger" data-test-delete="${escapeHtml(test.id)}" type="button" aria-label="削除">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <polyline points="3,6 5,6 21,6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
              </svg>
            </button>
          </div>
        </div>
        <small>${escapeHtml(test.subject)} / ${test.date}</small>
      </div>
    </article>`;
}

// Render up to 2 upcoming tests on the home screen
function renderHomeTests() {
  const items = upcomingTests().slice(0, 2);
  $("#home-test-list").innerHTML = items.length
    ? items.map(testCardHtml).join("")
    : `<p class="empty-text">テスト予定はまだありません。</p>`;
}

// Render all test cards in the test management screen
function renderTests() {
  const sorted = sortedTests();
  $("#test-list").innerHTML = sorted.length
    ? sorted.map(testCardHtml).join("")
    : `<article class="calendar-card glass-card">
         <p class="empty-text">テスト名と日付を登録してください。</p>
       </article>`;
  renderHomeTests();
  renderScoreTestOptions();
}

// Refresh test select options in the score form
function renderScoreTestOptions() {
  const sel = $("#score-test");
  if (!sel) return;
  const opts = sortedTests().map(
    (t) => `<option value="${t.id}">${escapeHtml(t.name)} / ${escapeHtml(t.subject)} / ${t.date}</option>`
  );
  sel.innerHTML = opts.length
    ? opts.join("")
    : `<option value="manual">テスト未登録</option>`;
}

// Add a new test from the test form
function addTest(event) {
  event.preventDefault();
  const name    = $("#test-name").value.trim();
  const date    = $("#test-date").value;
  const subject = $("#test-subject").value;
  if (!name || !date) return;

  tests.push({ id: generateId(), name, date, subject });
  save(KEYS.tests, tests);
  event.currentTarget.reset();
  renderTests();
  // Note categories follow test subjects - refresh dropdowns now
  populateNoteCategoryOptions();
  renderMistakeNotes();
}

// ----------------------------------------------
// Render: Score analysis
// ----------------------------------------------

// Return the average score for the given items (default: all scores)
function scoreAverage(items = scores) {
  if (!items.length) return 0;
  return Math.round(items.reduce((sum, i) => sum + i.score, 0) / items.length);
}

// Return scores sorted by creation date
function sortedScores() {
  return [...scores].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// Generate HTML for a score card with an edit button
function scoreCardHtml(item) {
  return `
    <article class="score-card glass-card">
      <div class="score-card-head">
        <div>
          <strong>${escapeHtml(item.testName)}</strong>
          <small>${escapeHtml(item.subject)} / ${item.dateLabel}</small>
        </div>
        <div class="score-card-right">
          <span class="score-value">${item.score}点</span>
          <div class="card-actions">
            <button class="icon-btn-sm" data-score-edit="${escapeHtml(item.id)}" type="button" aria-label="編集">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
      ${item.memo ? `<p>${escapeHtml(item.memo)}</p>` : ""}
    </article>`;
}

// Render the full score analysis screen
function renderScores() {
  const best = scores.length ? Math.max(...scores.map((i) => i.score)) : 0;
  $("#average-score").textContent = `${scoreAverage()}点`;
  $("#best-score").textContent    = `${best}点`;
  $("#score-count").textContent   = scores.length;

  const latest = sortedScores().slice(-10);
  $("#score-chart").innerHTML = latest.length
    ? latest.map((item) => {
        const h = Math.max(8, Math.round((item.score / 100) * 150));
        return `<div class="bar-col"><i style="height:${h}px"></i><small>${item.score}</small></div>`;
      }).join("")
    : `<p class="empty-text">点数を記録するとグラフが表示されます。</p>`;

  $("#subject-score-list").innerHTML = sortedSubjects().map((subj) => {
    const items = scores.filter((s) => s.subject === subj.name);
    const avg   = scoreAverage(items);
    const color = safeColor(subj.color);
    return `
      <div class="subject-score-row">
        <strong>${escapeHtml(subj.icon)} ${escapeHtml(subj.name)}<small>${avg}点</small></strong>
        <div class="progress-track">
          <span class="progress-fill" style="width:${Math.max(4, avg)}%; background:${color}"></span>
        </div>
      </div>`;
  }).join("");

  $("#score-list").innerHTML = scores.length
    ? [...scores]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(scoreCardHtml)
        .join("")
    : `<article class="score-card glass-card">
         <p class="empty-text">点数記録はまだありません。</p>
       </article>`;

  renderScoreTestOptions();
}

// Add a new score record from the score form
function addScore(event) {
  event.preventDefault();
  const testId       = $("#score-test").value;
  const selectedTest = tests.find((t) => t.id === testId);
  const score        = Number($("#score-value").value);
  if (!Number.isFinite(score)) return;

  scores.push({
    id:        generateId(),
    testId:    selectedTest?.id ?? "",
    testName:  selectedTest?.name ?? "テスト未登録",
    subject:   $("#score-subject").value,
    score:     Math.max(0, Math.min(100, score)),
    memo:      $("#score-memo").value.trim(),
    dateLabel: selectedTest?.date ?? dateKey(),
    createdAt: new Date().toISOString(),
  });
  save(KEYS.scores, scores);
  event.currentTarget.reset();
  renderScores();
}

// ----------------------------------------------
// Render: Mistake notes
// ----------------------------------------------

// Generate HTML for a mistake note card with edit/delete buttons
function noteCardHtml(note) {
  const category = note.category || "未分類";
  const tagsHtml = note.tags?.length
    ? note.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")
    : "";
  return `
    <article class="note-card glass-card ${note.reviewed ? "reviewed" : ""}">
      ${note.imageData ? `<img class="note-image" src="${note.imageData}" alt="問題画像" />` : ""}
      <div class="note-card-head">
        <div class="note-card-title">
          <span class="note-category-chip">${escapeHtml(category)}</span>
          <strong>${escapeHtml(note.question)}</strong>
        </div>
        <div class="note-card-actions">
          <button class="review-toggle ${note.reviewed ? "active" : ""}" data-note-review="${escapeHtml(note.id)}" type="button">
            ${note.reviewed ? "復習済み" : "復習する"}
          </button>
          <button class="icon-btn-sm" data-note-edit="${escapeHtml(note.id)}" type="button" aria-label="編集">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
            </svg>
          </button>
        </div>
      </div>
      <p class="note-answer"><b>正解:</b> ${escapeHtml(note.correctAnswer)}</p>
      ${note.userAnswer ? `<p class="note-answer"><b>自分の答え:</b> ${escapeHtml(note.userAnswer)}</p>` : ""}
      ${note.memo       ? `<p class="note-memo"><b>メモ:</b> ${escapeHtml(note.memo)}</p>` : ""}
      ${tagsHtml ? `<div class="tag-list">${tagsHtml}</div>` : ""}
    </article>`;
}

// Render mistake notes filtered by status and category filters
function renderMistakeNotes() {
  const filtered = mistakes.filter((n) => {
    if (noteFilter === "reviewed" && !n.reviewed) return false;
    if (noteFilter === "open"     &&  n.reviewed) return false;
    if (noteCategoryFilter !== "all" && (n.category || "") !== noteCategoryFilter) return false;
    return true;
  });
  $("#mistake-note-list").innerHTML = filtered.length
    ? filtered.map(noteCardHtml).join("")
    : `<article class="note-card glass-card">
         <p class="empty-text">該当する間違いノートはありません。</p>
       </article>`;
}

// Insert or update a mistake note when a quiz answer is wrong
// If the same question already has a note, overwrite it and reset reviewed state
function upsertMistake(q, userAnswer) {
  const existing = mistakes.find((n) => n.questionId === q.id);
  if (existing) {
    existing.userAnswer = userAnswer;
    existing.updatedAt  = new Date().toISOString();
    existing.reviewed   = false;
  } else {
    mistakes.unshift({
      id:            generateId(),
      questionId:    q.id,
      subject:       q.subject,
      category:      "",
      question:      q.question,
      correctAnswer: q.answer,
      userAnswer,
      memo:          q.explanation ?? "",
      tags:          [q.subject, "自動保存"],
      imageData:     "",
      reviewed:      false,
      createdAt:     new Date().toISOString(),
      updatedAt:     new Date().toISOString(),
    });
  }
  save(KEYS.mistakes, mistakes);
  renderMistakeNotes();
}

// Split a comma-separated tag string into a trimmed array
function normalizeTags(value) {
  return value.split(",").map((t) => t.trim()).filter(Boolean);
}

// Add a manually entered mistake note from the form.
// - Compresses the selected image to JPEG (max 1280px wide) to stay within localStorage quota.
// - Saves event.currentTarget before await (it may be nulled after async resume).
// - Rolls back and notifies the user if save fails (e.g. quota exceeded).
async function addManualNote(event) {
  event.preventDefault();
  const formEl = event.currentTarget;
  const fileEl = $("#note-image");
  const file   = fileEl?.files?.[0];

  const imageData = await compressImageFile(file);

  const newNote = {
    id:            generateId(),
    questionId:    null,
    subject:       "",
    category:      $("#note-category")?.value ?? "",
    question:      $("#note-question").value.trim(),
    correctAnswer: $("#note-answer").value.trim(),
    userAnswer:    "",
    memo:          $("#note-memo").value.trim(),
    tags:          normalizeTags($("#note-tags").value),
    imageData,
    reviewed:      false,
    createdAt:     new Date().toISOString(),
    updatedAt:     new Date().toISOString(),
  };

  mistakes.unshift(newNote);
  const ok = save(KEYS.mistakes, mistakes);
  if (!ok) {
    // Rollback on save failure (e.g. quota exceeded by large image)
    mistakes.shift();
    alert("保存できませんでした。画像が大きすぎる可能性があります。\n画像なしで保存するか、小さい画像を選んでください。");
    return;
  }

  if (formEl) formEl.reset();
  if (fileEl) fileEl.value = "";
  renderMistakeNotes();
}

// Toggle the reviewed state of a mistake note
function toggleNoteReviewed(noteId) {
  const note = mistakes.find((n) => n.id === noteId);
  if (!note) return;
  note.reviewed  = !note.reviewed;
  note.updatedAt = new Date().toISOString();
  save(KEYS.mistakes, mistakes);
  renderMistakeNotes();
}

// ----------------------------------------------
// Render: Vocabulary
// ----------------------------------------------

// Return a deduplicated sorted list of all term categories
function termCategories() {
  return [...new Set(terms.map((t) => t.category).filter(Boolean))].sort();
}

// Return terms filtered by search keyword, category, and favorite flag
function filteredTerms() {
  const kw = termSearch.toLowerCase();
  return terms.filter((t) => {
    const matchKw  = [t.name, t.meaning, t.category].join(" ").toLowerCase().includes(kw);
    const matchCat = termCatFilter === "all" || t.category === termCatFilter;
    const matchFav = !favoriteOnly || t.favorite;
    return matchKw && matchCat && matchFav;
  });
}

// Refresh the category filter dropdown options
function renderTermCategoryOptions() {
  const current = termCatFilter;
  const options = [`<option value="all">すべて</option>`].concat(
    termCategories().map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
  );
  const sel = $("#term-category-filter");
  sel.innerHTML = options.join("");
  sel.value     = termCategories().includes(current) ? current : "all";
  termCatFilter = sel.value;
}

// Generate HTML for a term card with favorite and edit buttons
function termCardHtml(term) {
  return `
    <article class="term-card glass-card ${redSheetMode ? "red-sheet" : ""}"
             data-term-card="${escapeHtml(term.id)}">
      <div class="term-card-head">
        <div>
          <span class="tag">${escapeHtml(term.category)}</span>
          <strong>${escapeHtml(term.name)}</strong>
        </div>
        <div class="card-actions">
          <button class="favorite-button ${term.favorite ? "active" : ""}"
                  data-term-favorite="${escapeHtml(term.id)}" type="button"
                  aria-label="お気に入り切り替え"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" stroke="none" aria-hidden="true"><polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/></svg></button>
          <button class="icon-btn-sm" data-term-edit="${escapeHtml(term.id)}" type="button" aria-label="編集">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
            </svg>
          </button>
        </div>
      </div>
      <p class="term-answer">${escapeHtml(term.meaning)}</p>
    </article>`;
}

// Render the flashcard for the current term card index
function renderTermFlashcard() {
  const items = filteredTerms();
  const card  = $("#term-flashcard");
  card.classList.remove("revealed");
  if (!items.length) {
    $("#flashcard-category").textContent = "未登録";
    $("#flashcard-term").textContent     = "用語を登録してください";
    $("#flashcard-meaning").textContent  = "";
    return;
  }
  termCardIndex = termCardIndex % items.length;
  const term = items[termCardIndex];
  $("#flashcard-category").textContent = term.category;
  $("#flashcard-term").textContent     = term.name;
  $("#flashcard-meaning").textContent  = term.meaning;
}

// Render the full vocabulary screen
function renderTerms() {
  renderTermCategoryOptions();
  const items = filteredTerms();
  $("#term-list").innerHTML = items.length
    ? items.map(termCardHtml).join("")
    : `<article class="term-card glass-card">
         <p class="empty-text">用語はまだ登録されていません。</p>
       </article>`;
  renderTermFlashcard();
}

// Add a new term from the term form
function addTerm(event) {
  event.preventDefault();
  terms.unshift({
    id:        generateId(),
    name:      $("#term-name").value.trim(),
    meaning:   $("#term-meaning").value.trim(),
    category:  $("#term-category").value.trim(),
    favorite:  false,
    createdAt: new Date().toISOString(),
  });
  save(KEYS.terms, terms);
  event.currentTarget.reset();
  renderTerms();
}

// Toggle favorite flag on a term
function toggleTermFavorite(termId) {
  const term = terms.find((t) => t.id === termId);
  if (!term) return;
  term.favorite = !term.favorite;
  save(KEYS.terms, terms);
  renderTerms();
}

// Advance to the next flashcard
function nextTermCard() {
  termCardIndex++;
  renderTermFlashcard();
}

// ----------------------------------------------
// Subject management: Statistics
// ----------------------------------------------

// Return total study time in ms for the given subject name
function subjectStudyMs(subjName, sessions) {
  return sessions.reduce(
    (sum, s) => (s.subject === subjName ? sum + sessionDuration(s) : sum), 0
  );
}

// Return days until the next upcoming test for the subject (null if none)
function subjectNextDays(subjName) {
  const upcoming = tests.filter((t) => t.subject === subjName && daysUntil(t.date) >= 0);
  if (!upcoming.length) return null;
  return Math.min(...upcoming.map((t) => daysUntil(t.date)));
}

// Return the correct rate percentage for the given subject (null if unanswered)
function subjectRate(subjName) {
  const qs   = questions.filter((q) => q.subject === subjName);
  const done = qs.filter((q)  => progress.doneIds.includes(q.id));
  if (!done.length) return null;
  const wrong = mistakes.filter((m) => m.questionId && m.subject === subjName).length;
  return Math.round(Math.max(0, done.length - wrong) / done.length * 100);
}

// Return the number of unreviewed mistake notes for the given subject
function subjectMistakeCount(subjName) {
  return mistakes.filter((m) => m.subject === subjName && !m.reviewed).length;
}

// ----------------------------------------------
// Subject management: Render
// ----------------------------------------------

// Generate HTML for a single subject card
function subjectCardHtml(subj, sessions) {
  const color      = safeColor(subj.color);
  const studyMs    = subjectStudyMs(subj.name, sessions);
  const testDays   = subjectNextDays(subj.name);
  const rate       = subjectRate(subj.name);
  const mistakeCnt = subjectMistakeCount(subj.name);

  const studyLbl = studyMs > 0 ? formatDuration(studyMs) : "0分";
  const testLbl  = testDays === null ? "なし"
                 : testDays === 0    ? "今日!"
                 : `あと${testDays}日`;
  const rateLbl  = rate === null ? "-" : `${rate}%`;
  const mistLbl  = `${mistakeCnt}問`;

  return `
    <article class="subject-card glass-card" style="--subj-color:${color}">
      <div class="subject-card-top">
        <div class="subject-card-identity">
          <span class="subject-color-dot" style="background:${color}" aria-hidden="true"></span>
          <strong class="subject-card-name">${escapeHtml(subj.name)}</strong>
        </div>
        <div class="subject-card-actions">
          <button class="subj-btn" data-subject-up="${subj.id}" type="button" aria-label="上へ移動">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>
          </button>
          <button class="subj-btn" data-subject-down="${subj.id}" type="button" aria-label="下へ移動">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
          </button>
          <button class="subj-btn" data-subject-edit="${subj.id}" type="button" aria-label="編集">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
            </svg>
          </button>
          <button class="subj-btn danger" data-subject-delete="${subj.id}" type="button" aria-label="削除">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <polyline points="3,6 5,6 21,6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="subject-stats-grid">
        <div class="subject-stat">
          <span class="subject-stat-value">${studyLbl}</span>
          <small>学習時間</small>
        </div>
        <div class="subject-stat">
          <span class="subject-stat-value">${testLbl}</span>
          <small>テスト</small>
        </div>
        <div class="subject-stat">
          <span class="subject-stat-value">${rateLbl}</span>
          <small>正答率</small>
        </div>
        <div class="subject-stat">
          <span class="subject-stat-value">${mistLbl}</span>
          <small>苦手問題</small>
        </div>
      </div>
    </article>`;
}

// Render all subject cards in the subject management screen
function renderSubjects() {
  const sessions = sessionsWithActive();
  const sorted   = sortedSubjects();
  $("#subject-list").innerHTML = sorted.length
    ? sorted.map((s) => subjectCardHtml(s, sessions)).join("")
    : `<article class="subject-card glass-card">
         <p class="empty-text">科目がありません。「追加」ボタンで登録してください。</p>
       </article>`;
}

// ----------------------------------------------
// Subject management: Modal
// ----------------------------------------------

// Render color picker swatches (icon picker removed - simpler design for technical schools)
function renderPickers() {
  $("#color-picker").innerHTML = PRESET_COLORS.map((color) =>
    `<button type="button" class="color-swatch ${color === pickedColor ? "selected" : ""}"
             data-color="${color}" style="background:${color}" aria-label="${color}"></button>`
  ).join("");
}

// Open the subject add/edit modal (pass null for add mode)
function openSubjectModal(subj = null) {
  editingSubjectId = subj ? subj.id : null;
  pickedColor      = subj ? safeColor(subj.color) : PRESET_COLORS[0];

  $("#subject-modal-title").textContent = subj ? "科目を編集" : "科目を追加";
  $("#subject-name-input").value        = subj ? subj.name : "";

  renderPickers();
  openModal("#subject-modal");
  setTimeout(() => $("#subject-name-input").focus(), 80);
}

// Handle subject form submission (add or update).
// The `icon` field is kept on existing records for backward compatibility,
// but new subjects no longer store an icon.
function submitSubjectForm(event) {
  event.preventDefault();
  const name = $("#subject-name-input").value.trim();
  if (!name) return;

  if (editingSubjectId) {
    const subj = subjects.find((s) => s.id === editingSubjectId);
    if (subj) {
      subj.name  = name;
      subj.color = pickedColor;
    }
  } else {
    const maxOrder = subjects.reduce((max, s) => Math.max(max, s.order), -1);
    subjects.push({
      id:    generateId(),
      name,
      color: pickedColor,
      icon:  "",
      order: maxOrder + 1,
    });
  }

  save(KEYS.subjects, subjects);
  closeModal("#subject-modal");
  renderSubjects();
  populateSubjectSelects();
}

// ----------------------------------------------
// Subject management: CRUD / reorder
// ----------------------------------------------

// Delete a subject (study data is preserved)
function deleteSubject(id) {
  const subj = subjects.find((s) => s.id === id);
  if (!subj) return;
  if (!confirm(`「${subj.name}」を削除しますか？\n学習データは残ります。`)) return;
  subjects = subjects.filter((s) => s.id !== id);
  save(KEYS.subjects, subjects);
  renderSubjects();
  populateSubjectSelects();
}

// Move a subject up or down by swapping order values
function moveSubject(id, direction) {
  const sorted  = sortedSubjects();
  const idx     = sorted.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= sorted.length) return;

  const temp             = sorted[idx].order;
  sorted[idx].order      = sorted[swapIdx].order;
  sorted[swapIdx].order  = temp;

  save(KEYS.subjects, subjects);
  renderSubjects();
  populateSubjectSelects();
}

// ----------------------------------------------
// Generic modal open/close
// ----------------------------------------------

// Open a modal by selector and restart the slide-up animation
function openModal(selector) {
  const modal = $(selector);
  if (!modal) return;
  const sheet = modal.querySelector(".modal-sheet");
  if (sheet) {
    sheet.style.animation = "none";
    sheet.offsetHeight;   // force reflow
    sheet.style.animation = "";
  }
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
}

// Close a modal by selector
function closeModal(selector) {
  const modal = $(selector);
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  modal.hidden = true;
}

// ----------------------------------------------
// Question CRUD
// ----------------------------------------------

// Build subject <option> HTML for use in modal selects
function subjectOptionsHtml() {
  const opts = sortedSubjects()
    .map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.icon)} ${escapeHtml(s.name)}</option>`)
    .join("");
  return opts || `<option value="">（先に科目を登録してください）</option>`;
}

// Open the question add/edit modal (pass null for add mode)
function openQuestionModal(q = null) {
  editingQuestionId = q ? q.id : null;
  $("#question-modal-title").textContent = q ? "問題を編集" : "問題を追加";

  // Refresh subject select options
  $("#q-subject").innerHTML = subjectOptionsHtml();

  if (q) {
    $("#q-subject").value   = q.subject;
    $("#q-question").value  = q.question;
    (q.choices ?? []).forEach((c, i) => {
      const el = $(`#q-choice-${i}`);
      if (el) el.value = c;
    });
    const answerIdx = (q.choices ?? []).indexOf(q.answer);
    $("#q-answer").value       = String(Math.max(0, answerIdx));
    $("#q-explanation").value  = q.explanation ?? "";
    $("#q-review-level").value = String(q.reviewLevel ?? 2);
    // Edit mode: show delete button
    $("#question-delete-btn").style.display = "";
  } else {
    $("#question-form").reset();
    if (sortedSubjects().length) {
      $("#q-subject").value = sortedSubjects()[0].name;
    }
    // Add mode: hide delete button
    $("#question-delete-btn").style.display = "none";
  }

  openModal("#question-modal");
  setTimeout(() => $("#q-question").focus(), 80);
}

// Handle question form submission (add or update)
function submitQuestionForm(event) {
  event.preventDefault();
  const choices = [
    $("#q-choice-0").value.trim(),
    $("#q-choice-1").value.trim(),
    $("#q-choice-2").value.trim(),
    $("#q-choice-3").value.trim(),
  ];
  const answerIdx = Number($("#q-answer").value);

  const data = {
    subject:      $("#q-subject").value,
    question:     $("#q-question").value.trim(),
    choices,
    answer:       choices[answerIdx] ?? choices[0],
    explanation:  $("#q-explanation").value.trim(),
    reviewLevel:  Number($("#q-review-level").value),
    points:       [],
    relatedTerms: [],
  };

  if (editingQuestionId) {
    const q = questions.find((q) => q.id === editingQuestionId);
    if (q) Object.assign(q, data);
  } else {
    questions.push({
      id:        generateId(),
      ...data,
      createdAt: new Date().toISOString(),
    });
  }

  save(KEYS.questions, questions);
  closeModal("#question-modal");
  renderQuestionList();
  renderHome();
  renderQuiz();
  renderProgress();
}

// Delete a question and remove it from progress tracking
function deleteQuestion(id) {
  const q = questions.find((q) => q.id === id);
  if (!q) return;
  const preview = q.question.length > 30 ? q.question.slice(0, 30) + "..." : q.question;
  if (!confirm(`「${preview}」を削除しますか？`)) return;
  questions = questions.filter((q) => q.id !== id);
  progress.doneIds = progress.doneIds.filter((dId) => dId !== id);
  currentIndex = Math.min(currentIndex, Math.max(0, questions.length - 1));
  save(KEYS.questions, questions);
  save(KEYS.progress, progress);
  closeModal("#question-modal");
  renderQuestionList();
  renderHome();
  renderQuiz();
  renderProgress();
}

// ----------------------------------------------
// Term CRUD
// ----------------------------------------------

// Open the term edit modal
function openTermModal(term) {
  editingTermId          = term.id;
  $("#te-name").value     = term.name;
  $("#te-meaning").value  = term.meaning;
  $("#te-category").value = term.category;
  openModal("#term-modal");
  setTimeout(() => $("#te-name").focus(), 80);
}

// Save term edits from the modal form
function submitTermEdit(event) {
  event.preventDefault();
  const term = terms.find((t) => t.id === editingTermId);
  if (term) {
    term.name     = $("#te-name").value.trim();
    term.meaning  = $("#te-meaning").value.trim();
    term.category = $("#te-category").value.trim();
  }
  save(KEYS.terms, terms);
  closeModal("#term-modal");
  renderTerms();
}

// Delete a term
function deleteTerm(id) {
  const term = terms.find((t) => t.id === id);
  if (!term || !confirm(`「${term.name}」を削除しますか？`)) return;
  terms = terms.filter((t) => t.id !== id);
  save(KEYS.terms, terms);
  closeModal("#term-modal");
  renderTerms();
}

// ----------------------------------------------
// Test CRUD
// ----------------------------------------------

// Open the test edit modal
function openTestModal(test) {
  editingTestId = test.id;
  $("#te-test-subject").innerHTML = subjectOptionsHtml();
  $("#te-test-name").value    = test.name;
  $("#te-test-date").value    = test.date;
  $("#te-test-subject").value = test.subject;
  openModal("#test-modal");
  setTimeout(() => $("#te-test-name").focus(), 80);
}

// Save test edits from the modal form
function submitTestEdit(event) {
  event.preventDefault();
  const test = tests.find((t) => t.id === editingTestId);
  if (test) {
    test.name    = $("#te-test-name").value.trim();
    test.date    = $("#te-test-date").value;
    test.subject = $("#te-test-subject").value;
  }
  save(KEYS.tests, tests);
  closeModal("#test-modal");
  renderTests();
  populateNoteCategoryOptions();
  renderMistakeNotes();
}

// Delete a test
function deleteTest(id) {
  const test = tests.find((t) => t.id === id);
  if (!test || !confirm(`「${test.name}」を削除しますか？`)) return;
  tests = tests.filter((t) => t.id !== id);
  save(KEYS.tests, tests);
  closeModal("#test-modal");
  renderTests();
  populateNoteCategoryOptions();
  renderMistakeNotes();
}

// ----------------------------------------------
// Score CRUD
// ----------------------------------------------

// Open the score edit modal
function openScoreModal(score) {
  editingScoreId      = score.id;
  $("#se-score").value = score.score;
  $("#se-memo").value  = score.memo ?? "";
  openModal("#score-modal");
  setTimeout(() => $("#se-score").focus(), 80);
}

// Save score edits from the modal form
function submitScoreEdit(event) {
  event.preventDefault();
  const score = scores.find((s) => s.id === editingScoreId);
  if (score) {
    score.score = Math.max(0, Math.min(100, Number($("#se-score").value)));
    score.memo  = $("#se-memo").value.trim();
  }
  save(KEYS.scores, scores);
  closeModal("#score-modal");
  renderScores();
}

// Delete a score record
function deleteScore(id) {
  if (!confirm("この点数記録を削除しますか？")) return;
  scores = scores.filter((s) => s.id !== id);
  save(KEYS.scores, scores);
  closeModal("#score-modal");
  renderScores();
}

// ----------------------------------------------
// Note CRUD
// ----------------------------------------------

// Open the note edit modal
function openNoteModal(note) {
  editingNoteId             = note.id;
  // Refresh category options first, preserving this note's value even if
  // the originating test has since been deleted.
  populateNoteCategoryOptions(note.category ?? "");
  $("#ne-question").value    = note.question;
  $("#ne-answer").value      = note.correctAnswer;
  $("#ne-memo").value        = note.memo ?? "";
  $("#ne-category").value    = note.category ?? "";
  $("#ne-tags").value        = (note.tags ?? []).join(", ");
  openModal("#note-modal");
  setTimeout(() => $("#ne-question").focus(), 80);
}

// Save note edits from the modal form
function submitNoteEdit(event) {
  event.preventDefault();
  const note = mistakes.find((n) => n.id === editingNoteId);
  if (note) {
    note.question      = $("#ne-question").value.trim();
    note.correctAnswer = $("#ne-answer").value.trim();
    note.memo          = $("#ne-memo").value.trim();
    note.category      = $("#ne-category")?.value ?? "";
    note.tags          = normalizeTags($("#ne-tags").value);
    note.updatedAt     = new Date().toISOString();
  }
  save(KEYS.mistakes, mistakes);
  closeModal("#note-modal");
  renderMistakeNotes();
}

// Delete a mistake note
function deleteNote(id) {
  if (!confirm("このノートを削除しますか？")) return;
  mistakes = mistakes.filter((n) => n.id !== id);
  save(KEYS.mistakes, mistakes);
  closeModal("#note-modal");
  renderMistakeNotes();
}

// ----------------------------------------------
// Session CRUD
// ----------------------------------------------

// Open the session edit modal
function openSessionModal(session) {
  editingSessionKey = session.id ?? session.startAt;
  $("#sess-subject").innerHTML = subjectOptionsHtml();
  $("#sess-subject").value     = session.subject;
  $("#sess-date").value        = session.date;
  $("#sess-duration").value    = String(Math.max(1, Math.round((session.durationMs ?? 0) / 60000)));
  openModal("#session-modal");
}

// Save session edits from the modal form
function submitSessionEdit(event) {
  event.preventDefault();
  const idx = timeData.sessions.findIndex(
    (s) => (s.id ?? s.startAt) === editingSessionKey
  );
  if (idx >= 0) {
    const durationMs = Math.max(0, Number($("#sess-duration").value)) * 60000;
    timeData.sessions[idx] = {
      ...timeData.sessions[idx],
      subject:    $("#sess-subject").value,
      date:       $("#sess-date").value,
      durationMs,
    };
  }
  save(KEYS.time, timeData);
  closeModal("#session-modal");
  renderTimeStats();
  renderSessionList();
}

// Delete a study session record
function deleteSession(key) {
  if (!confirm("この学習記録を削除しますか？")) return;
  timeData.sessions = timeData.sessions.filter(
    (s) => (s.id ?? s.startAt) !== key
  );
  save(KEYS.time, timeData);
  closeModal("#session-modal");
  renderTimeStats();
  renderSessionList();
}

// ----------------------------------------------
// Data export / import
// ----------------------------------------------

// Download all app data as a JSON file (one-tap export)
function exportData() {
  const data = {
    version:    "2.0",
    exportedAt: new Date().toISOString(),
    appName:    "テスト対策アプリ",
    questions,
    subjects,
    tests,
    mistakes,
    scores,
    terms,
    timeData,
    progress,
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `テスト対策-${dateKey()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Read a JSON file and restore all app data
function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const data = JSON.parse(reader.result);

      if (!confirm(
        "現在のデータをすべて上書きしますか？\n\n" +
        "この操作は取り消せません。\n" +
        "先にエクスポートでバックアップを取ることをおすすめします。"
      )) return;

      // Restore array data safely
      if (Array.isArray(data.questions)) { questions = data.questions; save(KEYS.questions, questions); }
      if (Array.isArray(data.subjects))  { subjects  = data.subjects;  save(KEYS.subjects,  subjects);  }
      if (Array.isArray(data.tests))     { tests     = data.tests;     save(KEYS.tests,     tests);     }
      if (Array.isArray(data.mistakes))  { mistakes  = data.mistakes;  save(KEYS.mistakes,  mistakes);  }
      if (Array.isArray(data.scores))    { scores    = data.scores;    save(KEYS.scores,    scores);    }
      if (Array.isArray(data.terms))     { terms     = data.terms;     save(KEYS.terms,     terms);     }
      // Restore object data safely
      if (data.timeData && typeof data.timeData === "object") {
        timeData = { ...DEFAULT_TIME_DATA, ...data.timeData };
        save(KEYS.time, timeData);
      }
      if (data.progress && typeof data.progress === "object") {
        progress = { ...DEFAULT_PROGRESS, ...data.progress };
        save(KEYS.progress, progress);
      }

      // Reset index and re-render all screens
      currentIndex = 0;
      populateSubjectSelects();
      populateNoteCategoryOptions();
      renderProgress();
      renderHome();
      renderQuestionList();
      renderQuiz();
      renderTimeStats();
      renderSessionList();
      renderTests();
      renderMistakeNotes();
      renderScores();
      renderTerms();
      renderSubjects();

      alert("インポートが完了しました！");
    } catch (err) {
      alert("読み込みに失敗しました。JSONファイルを確認してください。\n" + err.message);
    }
  });
  reader.readAsText(file, "UTF-8");
}

// Initialize drag-and-drop import zone
function initImportDropzone() {
  const zone    = $("#import-dropzone");
  const fileBtn = $("#import-btn");
  const fileIn  = $("#import-file");

  if (!zone) return;

  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("drag-over");
  });
  zone.addEventListener("dragleave", (e) => {
    if (!zone.contains(e.relatedTarget)) zone.classList.remove("drag-over");
  });
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file?.name?.endsWith(".json") || file?.type === "application/json") {
      importData(file);
    } else {
      alert("JSONファイルをドロップしてください。");
    }
  });

  // Clicking the zone also opens the file picker
  zone.addEventListener("click", () => fileIn.click());
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileIn.click(); }
  });

  fileBtn.addEventListener("click", () => fileIn.click());
  fileIn.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) importData(file);
    e.target.value = ""; // Reset so the same file can be selected again
  });
}

// ----------------------------------------------
// Screen switching
// ----------------------------------------------

// Switch the active screen and scroll to top
function setScreen(screenId) {
  $$(".screen").forEach((el) => el.classList.toggle("active", el.id === screenId));
  $$(".tab").forEach((el) => el.classList.toggle("active", el.dataset.nav === screenId));
  window.scrollTo({ top: 0, behavior: "instant" });
}

// ----------------------------------------------
// Theme
// ----------------------------------------------

// Apply the given theme ("dark", "light", or null for system preference)
function applyTheme(theme) {
  if (theme === "dark" || theme === "light") {
    document.documentElement.dataset.theme = theme;
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = prefersDark ? "dark" : "light";
  }
}

// Toggle between dark and light theme and persist the choice
function toggleTheme() {
  const current = document.documentElement.dataset.theme;
  const next    = current === "dark" ? "light" : "dark";
  localStorage.setItem(KEYS.theme, next);
  applyTheme(next);
}

// ----------------------------------------------
// Event binding
// ----------------------------------------------

// Register all event listeners
function bindEvents() {

  // -- Navigation tabs --
  $$("[data-nav]").forEach((btn) =>
    btn.addEventListener("click", () => setScreen(btn.dataset.nav))
  );

  // -- Header --
  $("#theme-toggle").addEventListener("click", toggleTheme);

  // -- Quiz --
  $("#answer-buttons").addEventListener("click", (e) => {
    if (e.target.matches(".answer-button"))
      answer(e.target.textContent.trim(), e.target);
  });
  $("#next-button").addEventListener("click", nextQuestion);

  // Explanation panel toggle
  $("#expl-toggle").addEventListener("click", () => {
    const body   = $("#expl-body");
    const toggle = $("#expl-toggle");
    const isOpen = body.classList.toggle("open");
    body.setAttribute("aria-hidden", String(!isOpen));
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.querySelector("span").textContent = isOpen ? "閉じる" : "詳しく見る";
  });

  // -- Question list --
  $("#add-question-btn").addEventListener("click", () => openQuestionModal());

  $("#question-list").addEventListener("click", (e) => {
    const questionBtn = e.target.closest("[data-question-index]");
    const editBtn     = e.target.closest("[data-question-edit]");
    const deleteBtn   = e.target.closest("[data-question-delete]");

    if (questionBtn) {
      currentIndex = Number(questionBtn.dataset.questionIndex);
      renderHome();
      renderQuiz();
      setScreen("quiz-screen");
    } else if (editBtn) {
      const q = questions.find((q) => q.id === editBtn.dataset.questionEdit);
      if (q) openQuestionModal(q);
    } else if (deleteBtn) {
      deleteQuestion(deleteBtn.dataset.questionDelete);
    }
  });

  // -- Question modal --
  $("#question-modal-close").addEventListener("click", () => closeModal("#question-modal"));
  $("#question-modal-overlay").addEventListener("click", () => closeModal("#question-modal"));
  $("#question-form").addEventListener("submit", submitQuestionForm);
  $("#question-delete-btn").addEventListener("click", () => deleteQuestion(editingQuestionId));

  // -- Study timer --
  $("#session-toggle").addEventListener("click", toggleSession);

  // -- Session history list --
  $("#session-list").addEventListener("click", (e) => {
    const editBtn   = e.target.closest("[data-session-edit]");
    const deleteBtn = e.target.closest("[data-session-delete]");
    if (editBtn) {
      const key = editBtn.dataset.sessionEdit;
      const session = timeData.sessions.find((s) => (s.id ?? s.startAt) === key);
      if (session) openSessionModal(session);
    } else if (deleteBtn) {
      deleteSession(deleteBtn.dataset.sessionDelete);
    }
  });

  // -- Session modal --
  $("#session-modal-close").addEventListener("click", () => closeModal("#session-modal"));
  $("#session-modal-overlay").addEventListener("click", () => closeModal("#session-modal"));
  $("#session-edit-form").addEventListener("submit", submitSessionEdit);
  $("#session-delete-btn").addEventListener("click", () => deleteSession(editingSessionKey));

  // -- Test management --
  $("#test-form").addEventListener("submit", addTest);

  // Test card edit/delete - covers both test-list and home-test-list
  ["#test-list", "#home-test-list"].forEach((sel) => {
    const el = $(sel);
    if (!el) return;
    el.addEventListener("click", (e) => {
      const editBtn   = e.target.closest("[data-test-edit]");
      const deleteBtn = e.target.closest("[data-test-delete]");
      if (editBtn) {
        const test = tests.find((t) => t.id === editBtn.dataset.testEdit);
        if (test) openTestModal(test);
      } else if (deleteBtn) {
        deleteTest(deleteBtn.dataset.testDelete);
      }
    });
  });

  // -- Test modal --
  $("#test-modal-close").addEventListener("click", () => closeModal("#test-modal"));
  $("#test-modal-overlay").addEventListener("click", () => closeModal("#test-modal"));
  $("#test-edit-form").addEventListener("submit", submitTestEdit);
  $("#test-delete-btn").addEventListener("click", () => deleteTest(editingTestId));

  // -- Mistake notes --
  $("#note-form").addEventListener("submit", addManualNote);

  $$("[data-note-filter]").forEach((btn) =>
    btn.addEventListener("click", () => {
      noteFilter = btn.dataset.noteFilter;
      $$("[data-note-filter]").forEach((b) =>
        b.classList.toggle("active", b === btn)
      );
      renderMistakeNotes();
    })
  );

  // Category filter dropdown: "all", category name, or "" for 未分類
  $("#note-category-filter")?.addEventListener("change", (e) => {
    noteCategoryFilter = e.target.value;
    renderMistakeNotes();
  });

  $("#mistake-note-list").addEventListener("click", (e) => {
    const reviewBtn = e.target.closest("[data-note-review]");
    const editBtn   = e.target.closest("[data-note-edit]");
    if (reviewBtn) {
      toggleNoteReviewed(reviewBtn.dataset.noteReview);
    } else if (editBtn) {
      const note = mistakes.find((n) => n.id === editBtn.dataset.noteEdit);
      if (note) openNoteModal(note);
    }
  });

  // -- Note modal --
  $("#note-modal-close").addEventListener("click", () => closeModal("#note-modal"));
  $("#note-modal-overlay").addEventListener("click", () => closeModal("#note-modal"));
  $("#note-edit-form").addEventListener("submit", submitNoteEdit);
  $("#note-delete-btn").addEventListener("click", () => deleteNote(editingNoteId));

  // -- Score analysis --
  $("#score-form").addEventListener("submit", addScore);

  $("#score-list").addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-score-edit]");
    if (editBtn) {
      const score = scores.find((s) => s.id === editBtn.dataset.scoreEdit);
      if (score) openScoreModal(score);
    }
  });

  // -- Score modal --
  $("#score-modal-close").addEventListener("click", () => closeModal("#score-modal"));
  $("#score-modal-overlay").addEventListener("click", () => closeModal("#score-modal"));
  $("#score-edit-form").addEventListener("submit", submitScoreEdit);
  $("#score-delete-btn").addEventListener("click", () => deleteScore(editingScoreId));

  // -- Vocabulary --
  $("#term-form").addEventListener("submit", addTerm);

  $("#term-search").addEventListener("input", (e) => {
    termSearch    = e.target.value.trim();
    termCardIndex = 0;
    renderTerms();
  });

  $("#term-category-filter").addEventListener("change", (e) => {
    termCatFilter = e.target.value;
    termCardIndex = 0;
    renderTerms();
  });

  $("#red-sheet-toggle").addEventListener("click", () => {
    redSheetMode = !redSheetMode;
    $("#red-sheet-toggle").classList.toggle("active", redSheetMode);
    renderTerms();
  });

  $("#favorite-filter-toggle").addEventListener("click", () => {
    favoriteOnly  = !favoriteOnly;
    termCardIndex = 0;
    $("#favorite-filter-toggle").classList.toggle("active", favoriteOnly);
    renderTerms();
  });

  $("#term-flashcard").addEventListener("click", () =>
    $("#term-flashcard").classList.toggle("revealed")
  );

  $("#next-term-card").addEventListener("click", nextTermCard);

  $("#term-list").addEventListener("click", (e) => {
    const favBtn  = e.target.closest("[data-term-favorite]");
    const editBtn = e.target.closest("[data-term-edit]");
    const card    = e.target.closest("[data-term-card]");
    if (favBtn) {
      toggleTermFavorite(favBtn.dataset.termFavorite);
    } else if (editBtn) {
      const term = terms.find((t) => t.id === editBtn.dataset.termEdit);
      if (term) openTermModal(term);
    } else if (card) {
      card.classList.toggle("revealed");
    }
  });

  // -- Term modal --
  $("#term-modal-close").addEventListener("click", () => closeModal("#term-modal"));
  $("#term-modal-overlay").addEventListener("click", () => closeModal("#term-modal"));
  $("#term-edit-form").addEventListener("submit", submitTermEdit);
  $("#term-delete-btn").addEventListener("click", () => deleteTerm(editingTermId));

  // -- Subject management --
  $("#add-subject-btn").addEventListener("click", () => openSubjectModal());
  $("#modal-close").addEventListener("click", () => closeModal("#subject-modal"));
  $("#modal-overlay").addEventListener("click", () => closeModal("#subject-modal"));
  $("#subject-form").addEventListener("submit", submitSubjectForm);

  $("#color-picker").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-color]");
    if (!btn) return;
    pickedColor = btn.dataset.color;
    renderPickers();
  });

  $("#subject-list").addEventListener("click", (e) => {
    const editBtn = e.target.closest("[data-subject-edit]");
    const delBtn  = e.target.closest("[data-subject-delete]");
    const upBtn   = e.target.closest("[data-subject-up]");
    const downBtn = e.target.closest("[data-subject-down]");
    if (editBtn) {
      const subj = subjects.find((s) => s.id === editBtn.dataset.subjectEdit);
      if (subj) openSubjectModal(subj);
    } else if (delBtn) {
      deleteSubject(delBtn.dataset.subjectDelete);
    } else if (upBtn) {
      moveSubject(upBtn.dataset.subjectUp, "up");
    } else if (downBtn) {
      moveSubject(downBtn.dataset.subjectDown, "down");
    }
  });

  // -- Data management --
  $("#export-btn").addEventListener("click", exportData);

  // -- Escape key: close all modals --
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const modals = [
      "#subject-modal", "#question-modal", "#term-modal",
      "#test-modal", "#score-modal", "#note-modal", "#session-modal",
    ];
    modals.forEach((sel) => {
      if ($(sel)?.getAttribute("aria-hidden") !== "true") closeModal(sel);
    });
  });
}

// ----------------------------------------------
// Initialization
// ----------------------------------------------

// Return sorted unique subject names that appear in the "テスト予定" data.
// Empty/blank entries are skipped. Used as the source of note categories.
function testSubjectsForNoteCategory() {
  const names = tests.map((t) => (t.subject || "").trim()).filter(Boolean);
  return [...new Set(names)].sort();
}

// Populate the three note category <select> elements from the tests data.
// - #note-category   (add form):       blank value = "未設定" + each test subject
// - #ne-category     (edit modal):     same as add form (preserves existing value)
// - #note-category-filter (filter):    "すべて" (all) + each subject + "未分類" (empty)
//
// When opening the edit modal for a note whose category was a test subject
// that has since been removed, callers can pass `preserveExtra` so that the
// value still appears in the dropdown.
function populateNoteCategoryOptions(preserveExtra = "") {
  const subjects = testSubjectsForNoteCategory();
  const extras = preserveExtra && !subjects.includes(preserveExtra)
    ? [preserveExtra]
    : [];
  const allSubjects = [...subjects, ...extras];

  const subjectOptionsHtml = allSubjects
    .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
    .join("");

  // Add / edit dropdowns: leading "未設定" (empty value) then test subjects.
  // If no tests are registered yet, only "未設定" appears.
  const inputOptions = `<option value="">未設定</option>` + subjectOptionsHtml;

  // Filter dropdown: leading "すべて", then subjects, trailing "未分類".
  const filterOptions =
    `<option value="all">すべて</option>` +
    subjectOptionsHtml +
    `<option value="">未分類</option>`;

  ["note-category", "ne-category"].forEach((id) => {
    const el = $(`#${id}`);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = inputOptions;
    if ([...el.options].some((o) => o.value === prev)) el.value = prev;
  });

  const filterEl = $("#note-category-filter");
  if (filterEl) {
    const prev = filterEl.value || "all";
    filterEl.innerHTML = filterOptions;
    if ([...filterEl.options].some((o) => o.value === prev)) {
      filterEl.value = prev;
    } else {
      // The previously selected category no longer exists - reset to "all"
      filterEl.value     = "all";
      noteCategoryFilter = "all";
    }
  }
}

// Dynamically populate all subject <select> elements from the subjects array
function populateSubjectSelects() {
  const html = sortedSubjects()
    .map((s) => `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`)
    .join("");
  ["study-subject", "test-subject", "score-subject"].forEach((id) => {
    const el = $(`#${id}`);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = html || `<option value="">（科目を登録してください）</option>`;
    if ([...el.options].some((o) => o.value === prev)) el.value = prev;
  });
}

// Monitor online/offline status and show/hide the banner
function initOfflineBanner() {
  const banner = $("#offline-banner");
  window.addEventListener("online",  () => { banner.hidden = true;  });
  window.addEventListener("offline", () => { banner.hidden = false; });
  if (!navigator.onLine) banner.hidden = false;
}

// Register the service worker (silently skip unsupported environments)
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("./service-worker.js").catch((err) => {
    console.warn("Service Worker registration failed:", err);
  });
}

// App initialization entry point
// Order: apply theme -> populate selects -> bind events -> render all -> hide loader
function initApp() {
  // Apply theme first to avoid flash of wrong theme
  applyTheme(localStorage.getItem(KEYS.theme));

  // Follow system dark/light preference when no manual override is set
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!localStorage.getItem(KEYS.theme)) applyTheme(null);
  });

  populateSubjectSelects();
  populateNoteCategoryOptions();
  bindEvents();
  initImportDropzone();

  // Initial render of all screens
  renderProgress();
  renderHome();
  renderQuestionList();
  renderQuiz();
  renderTimeStats();
  renderSessionList();
  renderTests();
  renderMistakeNotes();
  renderScores();
  renderTerms();
  renderSubjects();
  startTimer();

  initOfflineBanner();
  registerServiceWorker();

  // Fade out and remove the loading screen
  const loadingEl = $("#app-loading");
  if (loadingEl) {
    loadingEl.classList.add("fade-out");
    loadingEl.addEventListener("transitionend", () => loadingEl.remove(), { once: true });
  }
}

// Start the app
initApp();
