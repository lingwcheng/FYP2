// === js/student.js (云端完整版：PIN 码进考场 + System Bank 隔离自测 + 查看老师 PBD 评语与成绩) ===
import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { DB } from "./db.js";

// 与老师端 100% 对齐的马来西亚 KSSR 六年级标签体系
const KSSR_TAGS = {
    Mathematics: [
        "Whole Numbers & Operations",
        "Fractions, Decimals & Percentages",
        "Money",
        "Time",
        "Measurement",
        "Space",
        "Coordinates, Ratio & Proportion",
        "Data Handling & Likelihood"
    ],
    Science: [
        "Scientific Skills",
        "Humans",
        "Microorganisms",
        "Interaction Among Living Things",
        "Preservation & Conservation",
        "Force",
        "Speed",
        "Food Preservation",
        "Waste Material",
        "Eclipses",
        "Galaxies",
        "Stability & Strength",
        "Technology"
    ]
};

const PBD_LABELS = {
    "TP 6": "Exemplary",
    "TP 5": "Proficient",
    "TP 4": "Satisfactory",
    "TP 3": "Moderate",
    "TP 2": "Developing",
    "TP 1": "Needs Support"
};

// 全局状态
let currentUser = null;
let currentProfile = null;
let approvedBankCache = [];
let studentResultsCache = [];
let matchedAssessment = null;
let practiceSubject = "Mathematics";
let selectedPracticeTags = new Set();

// DOM 引用
const studentNameEl = document.getElementById("student-name");
const logoutBtn = document.getElementById("logout-btn");
const navItems = document.querySelectorAll(".nav-item[data-view]");
const viewSections = document.querySelectorAll(".view-section");
const resultsCountBadgeEl = document.getElementById("results-count-badge");

// 视图 1：PIN 码考场
const pinInputEl = document.getElementById("pin-input");
const pinErrorMsgEl = document.getElementById("pin-error-msg");
const findExamBtn = document.getElementById("find-exam-btn");
const examPreviewCard = document.getElementById("exam-preview-card");
const previewTitleEl = document.getElementById("preview-title");
const previewSubjectEl = document.getElementById("preview-subject");
const previewCountEl = document.getElementById("preview-count");
const previewTeacherEl = document.getElementById("preview-teacher");
const startPinExamBtn = document.getElementById("start-pin-exam-btn");

// 视图 2：云端自测练习
const mathCardEl = document.getElementById("math-card");
const scienceCardEl = document.getElementById("science-card");
const subtopicsContainerEl = document.getElementById("subtopics-container");
const practiceQCountEl = document.getElementById("practice-q-count");
const practicePoolHintEl = document.getElementById("practice-pool-hint");
const startPracticeBtn = document.getElementById("start-practice-btn");

// 视图 3：我的成绩与 PBD
const refreshResultsBtn = document.getElementById("refresh-results-btn");
const studentResultsListEl = document.getElementById("student-results-list");

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
}

// ================= 1. 认证与初始化 =================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }
    currentUser = user;
    const profile = await DB.getUserProfile(user.uid);
    currentProfile = profile || { uid: user.uid, name: user.email.split("@")[0], role: "student" };
    studentNameEl.textContent = currentProfile.name || "Student";

    // 若从 report.html 带参数跳回来直接切到对应 tab
    const urlTab = new URLSearchParams(window.location.search).get("tab");
    if (urlTab === "results") switchView("view-results");
    else if (urlTab === "practice") switchView("view-practice");

    await loadCloudStudentData();
});

logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    localStorage.removeItem("currentUser");
    window.location.href = "login.html";
});

function switchView(viewId) {
    navItems.forEach((b) => b.classList.toggle("active", b.dataset.view === viewId));
    viewSections.forEach((s) => s.classList.toggle("active", s.id === viewId));
}

navItems.forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
});

async function loadCloudStudentData() {
    try {
        const [allQs, myResults] = await Promise.all([
            DB.getAllQuestions(),
            DB.getStudentResults(currentUser.uid)
        ]);

        // 题库隔离：学生 Self-Practice 只读取 System Bank，防止提前泄题给正式考试
        approvedBankCache = allQs.filter((q) => q.status === "approved" && q.source === "System Bank");
        myResults.sort((a, b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0));
        studentResultsCache = myResults;

        renderPracticeTopics();
        renderStudentResults();
    } catch (err) {
        console.error("Student cloud load error:", err);
        studentResultsListEl.innerHTML = `<div class="empty-state">❌ Firestore Error: ${escapeHtml(err.message)}</div>`;
    }
}

// ================= 2. 视图 1：通过 6 位 PIN 码查找并进入老师测验 =================
pinInputEl.addEventListener("input", () => {
    pinInputEl.value = pinInputEl.value.replace(/\D/g, "").slice(0, 6);
    pinErrorMsgEl.textContent = "";
    examPreviewCard.classList.remove("show");
    matchedAssessment = null;
});

pinInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") findExamBtn.click();
});

findExamBtn.addEventListener("click", async () => {
    const pin = pinInputEl.value.trim();
    if (pin.length !== 6) {
        pinErrorMsgEl.textContent = "⚠️ Please enter a valid 6-digit PIN code.";
        return;
    }

    findExamBtn.disabled = true;
    findExamBtn.textContent = "⏳ Searching Cloud Firestore...";
    pinErrorMsgEl.textContent = "";
    examPreviewCard.classList.remove("show");

    try {
        const assessment = await DB.getAssessmentByPin(pin);
        if (!assessment) {
            pinErrorMsgEl.textContent = `❌ No active exam found for PIN "${pin}". Please double-check with your teacher.`;
            return;
        }

        matchedAssessment = assessment;
        previewTitleEl.textContent = assessment.title || "Standard 6 Diagnostic Assessment";
        previewSubjectEl.textContent = `📘 ${assessment.subject || "STEM"}`;
        previewCountEl.textContent = `📝 ${assessment.questionIds?.length || assessment.questionCount || 0} Questions`;
        previewTeacherEl.textContent = `👩‍🏫 ${assessment.teacherName || "Teacher"}`;
        examPreviewCard.classList.add("show");
    } catch (err) {
        console.error("PIN lookup error:", err);
        pinErrorMsgEl.textContent = "❌ Connection error: " + err.message;
    } finally {
        findExamBtn.disabled = false;
        findExamBtn.textContent = "🔍 Find Assessment";
    }
});

startPinExamBtn.addEventListener("click", () => {
    if (!matchedAssessment) return;
    sessionStorage.setItem(
        "activeQuizSession",
        JSON.stringify({
            mode: "assessment",
            pin: matchedAssessment.pin,
            assessmentId: matchedAssessment.id
        })
    );
    window.location.href = `quiz.html?mode=assessment&pin=${encodeURIComponent(matchedAssessment.pin)}`;
});

// ================= 3. 视图 2：云端标签自测练习（仅 System Bank） =================
function selectPracticeSubject(subject) {
    practiceSubject = subject;
    selectedPracticeTags.clear();
    mathCardEl.classList.remove("active", "active-science");
    scienceCardEl.classList.remove("active", "active-science");

    if (subject === "Science") scienceCardEl.classList.add("active-science");
    else mathCardEl.classList.add("active");

    renderPracticeTopics();
}

mathCardEl.addEventListener("click", () => selectPracticeSubject("Mathematics"));
scienceCardEl.addEventListener("click", () => selectPracticeSubject("Science"));

function renderPracticeTopics() {
    const tags = KSSR_TAGS[practiceSubject] || [];
    const subjectQs = approvedBankCache.filter((q) => q.subject === practiceSubject);

    subtopicsContainerEl.innerHTML = tags
        .map((tag) => {
            const count = subjectQs.filter((q) => (q.tags || []).includes(tag)).length;
            const isSelected = selectedPracticeTags.has(tag);
            const selectedCls = isSelected ? (practiceSubject === "Science" ? "selected-science" : "selected") : "";
            return `
                <div class="topic-chip ${selectedCls}" data-tag="${escapeHtml(tag)}">
                    ${escapeHtml(tag)} <span style="opacity:0.75; font-size:0.76rem;">(${count})</span>
                </div>
            `;
        })
        .join("");

    updatePracticePoolHint();
}

const MAX_PRACTICE_QUESTIONS = 40;

function updatePracticePoolHint() {
    const matching = getMatchingPracticeQuestions();
    if (selectedPracticeTags.size === 0) {
        practicePoolHintEl.textContent = "Select at least 1 topic above";
    } else {
        practicePoolHintEl.textContent = `(${matching.length} System Bank Qs available)`;
    }
}

function getMatchingPracticeQuestions() {
    if (selectedPracticeTags.size === 0) return [];
    const chosen = Array.from(selectedPracticeTags);
    return approvedBankCache.filter(
        (q) => q.subject === practiceSubject && (q.tags || []).some((t) => chosen.includes(t))
    );
}

practiceQCountEl.addEventListener("change", () => {
    const val = parseInt(practiceQCountEl.value, 10);
    if (isNaN(val) || val < 1) {
        practiceQCountEl.value = 1;
    } else if (val > MAX_PRACTICE_QUESTIONS) {
        practiceQCountEl.value = MAX_PRACTICE_QUESTIONS;
    }
});

subtopicsContainerEl.addEventListener("click", (e) => {
    const chip = e.target.closest(".topic-chip");
    if (!chip) return;
    const tag = chip.dataset.tag;
    const activeCls = practiceSubject === "Science" ? "selected-science" : "selected";

    if (selectedPracticeTags.has(tag)) {
        selectedPracticeTags.delete(tag);
        chip.classList.remove(activeCls);
    } else {
        selectedPracticeTags.add(tag);
        chip.classList.add(activeCls);
    }
    updatePracticePoolHint();
});

startPracticeBtn.addEventListener("click", () => {
    if (selectedPracticeTags.size === 0) {
        alert("⚠️ Please select at least one KSSR topic chip first.");
        return;
    }
    const pool = getMatchingPracticeQuestions();
    if (pool.length === 0) {
        alert("⚠️ No System Bank practice questions found for the selected topic(s) yet. Ask your teacher to bulk-import System Bank questions!");
        return;
    }

    const desiredCount = parseInt(practiceQCountEl.value, 10);
    if (isNaN(desiredCount) || desiredCount < 1 || desiredCount > MAX_PRACTICE_QUESTIONS) {
        alert(`⚠️ Please enter a number between 1 and ${MAX_PRACTICE_QUESTIONS} questions.`);
        practiceQCountEl.focus();
        return;
    }

    const finalCount = Math.min(desiredCount, pool.length);
    if (desiredCount > pool.length) {
        const proceed = confirm(
            `You requested ${desiredCount} questions, but only ${pool.length} System Bank question(s) are available for the selected topic(s).\nStart practice with ${pool.length} question(s)?`
        );
        if (!proceed) return;
    }

    sessionStorage.setItem(
        "activeQuizSession",
        JSON.stringify({
            mode: "practice",
            subject: practiceSubject,
            tags: Array.from(selectedPracticeTags),
            count: finalCount
        })
    );
    window.location.href = "quiz.html?mode=practice";
});

// ================= 4. 视图 3：我的历史成绩、老师官方 PBD 等级与评语 =================
refreshResultsBtn.addEventListener("click", async () => {
    refreshResultsBtn.textContent = "⏳ Refreshing...";
    await loadCloudStudentData();
    refreshResultsBtn.textContent = "🔄 Refresh";
});

function renderStudentResults() {
    if (studentResultsCache.length > 0) {
        resultsCountBadgeEl.style.display = "inline-block";
        resultsCountBadgeEl.textContent = studentResultsCache.length;
    } else {
        resultsCountBadgeEl.style.display = "none";
    }

    if (studentResultsCache.length === 0) {
        studentResultsListEl.innerHTML = '<div class="empty-state">You have not completed any exams or practice quizzes yet. Enter a Teacher PIN to start!</div>';
        return;
    }

    studentResultsListEl.innerHTML = studentResultsCache
        .map((r) => {
            const pct = Math.round(Number(r.percentage) || 0);
            const isPractice = r.mode === "practice" || r.pin === "PRACTICE";
            const cardCls = isPractice ? "practice" : r.teacherPbd ? "graded" : "pending";

            let badgeHtml = "";
            if (isPractice) {
                badgeHtml = `<span class="pbd-pill pbd-practice">📝 Self-Practice</span>`;
            } else if (r.teacherPbd) {
                const tpLabel = PBD_LABELS[r.teacherPbd] || "";
                badgeHtml = `<span class="pbd-pill pbd-graded">✅ Official PBD: ${escapeHtml(r.teacherPbd)} ${tpLabel ? "• " + escapeHtml(tpLabel) : ""}</span>`;
            } else {
                badgeHtml = `<span class="pbd-pill pbd-pending">⏳ Waiting for Teacher PBD Grade</span>`;
            }

            const dateStr = r.completedAt?.seconds
                ? new Date(r.completedAt.seconds * 1000).toLocaleString("en-MY", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                  })
                : "Just now";

            const remarkHtml = r.teacherRemark
                ? `<div class="remark-box">💬 <strong>Teacher Remark (${escapeHtml(r.gradedBy || "Teacher")}):</strong> ${escapeHtml(r.teacherRemark)}</div>`
                : "";

            const tabInfo = !isPractice && Number(r.tabSwitches) > 0
                ? `<span style="color:#dc2626; font-size:0.76rem; font-weight:600;"> • ⚠️ ${r.tabSwitches} tab switch(es)</span>`
                : "";

            return `
                <div class="result-card ${cardCls}">
                    <div style="flex:1; min-width:240px;">
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:6px;">
                            <strong style="font-size:1.02rem; color:#1e1b4b;">${escapeHtml(r.testTitle || "Diagnostic Quiz")}</strong>
                            ${badgeHtml}
                        </div>
                        <div style="font-size:0.82rem; color:#64748b;">
                            📘 ${escapeHtml(r.subject)} &nbsp;•&nbsp;
                            ${isPractice ? "Practice Mode" : `PIN #${escapeHtml(r.pin || "—")}`} &nbsp;•&nbsp;
                            🕒 ${escapeHtml(dateStr)}${tabInfo}
                        </div>
                        ${remarkHtml}
                    </div>

                    <div style="display:flex; align-items:center; gap:14px; flex-shrink:0;">
                        <div style="text-align:right;">
                            <div style="font-size:1.35rem; font-weight:700; color:#4318FF;">${pct}%</div>
                            <div style="font-size:0.78rem; color:#64748b;">${r.score ?? 0} / ${r.totalQuestions ?? 0} Correct</div>
                        </div>
                        <button type="button" class="btn-report" data-open-report="${r.id}">
                            🔍 Review & AI Remedial
                        </button>
                    </div>
                </div>
            `;
        })
        .join("");
}

studentResultsListEl.addEventListener("click", (e) => {
    const id = e.target.dataset.openReport;
    if (!id) return;
    const rec = studentResultsCache.find((r) => r.id === id);
    if (rec) {
        localStorage.setItem("latestResultId", rec.id);
        localStorage.setItem("latestResultData", JSON.stringify(rec));
    }
    window.location.href = `report.html?id=${encodeURIComponent(id)}`;
});