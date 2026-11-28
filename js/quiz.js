// === js/quiz.js (云端真实考场：拉取 PIN 考卷/System Bank 自测题 + 防作弊切屏计数 + 交卷写入 Firestore) ===
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { DB } from "./db.js";

const ALL_KSSR_TOPIC_TAGS = new Set([
    "Whole Numbers & Operations",
    "Fractions, Decimals & Percentages",
    "Money",
    "Time",
    "Measurement",
    "Space",
    "Coordinates, Ratio & Proportion",
    "Data Handling & Likelihood",
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
]);

// 全局考试状态
let currentUser = null;
let currentProfile = null;
let quizMode = "assessment"; // "assessment" | "practice"
let activeAssessment = null;
let quizQuestions = [];
let userAnswers = [];
let currentIndex = 0;

let timerInterval = null;
let remainingSeconds = 0;
let tabSwitchCount = 0;
let lastCheatTimestamp = 0;
let isSubmitting = false;

// DOM 引用
const sidebarStudentNameEl = document.getElementById("sidebar-student-name");
const sidebarTitleEl = document.getElementById("sidebar-title");
const sidebarMetaEl = document.getElementById("sidebar-meta");
const totalQEl = document.getElementById("total-q");
const totalQTopEl = document.getElementById("total-q-top");
const attemptedQEl = document.getElementById("attempted-q");
const tabSwitchCountEl = document.getElementById("tab-switch-count");
const qNavGridEl = document.getElementById("q-nav-grid");
const leaveQuizBtn = document.getElementById("leave-quiz-btn");

const cheatWarningEl = document.getElementById("cheat-warning");
const warnNumEl = document.getElementById("warn-num");
const closeWarnBtn = document.getElementById("close-warn-btn");

const currentQNumEl = document.getElementById("current-q-num");
const progressFillEl = document.getElementById("progress-fill");
const progressTextEl = document.getElementById("progress-text");
const timerBoxEl = document.getElementById("timer-box");
const timerDisplayEl = document.getElementById("timer-display");

const topicTagEl = document.getElementById("topic-tag");
const diffTagEl = document.getElementById("diff-tag");
const questionTextEl = document.getElementById("question-text");
const optionsGridEl = document.getElementById("options-grid");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
}

// 从题目 tags 中提取真正的 KSSR 知识点标签（排除 Standard 6 / Mathematics / Easy 等元标签）
function getQuestionTopicTag(q) {
    const tags = q.tags || [];
    const matched = tags.find((t) => ALL_KSSR_TOPIC_TAGS.has(t));
    if (matched) return matched;
    const ignored = new Set(["Standard 6", "Mathematics", "Science", "Easy", "Medium", "Hard", "KBAT", "Teacher Custom"]);
    return tags.find((t) => !ignored.has(t)) || "General KSSR";
}

// ================= 1. 初始化并从 Firestore 拉取考卷 =================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }
    currentUser = user;
    const profile = await DB.getUserProfile(user.uid);
    currentProfile = profile || { uid: user.uid, name: user.email.split("@")[0], role: "student" };
    sidebarStudentNameEl.textContent = currentProfile.name || "Student";

    await loadQuizFromCloud();
});

async function loadQuizFromCloud() {
    try {
        const params = new URLSearchParams(window.location.search);
        const sessionRaw = sessionStorage.getItem("activeQuizSession");
        const sessionData = sessionRaw ? JSON.parse(sessionRaw) : {};

        quizMode = params.get("mode") || sessionData.mode || "assessment";
        const allQuestions = await DB.getAllQuestions();
        const qMap = new Map(allQuestions.map((q) => [q.id, q]));

        if (quizMode === "assessment") {
            const pin = params.get("pin") || sessionData.pin;
            if (!pin) {
                alert("⚠️ Missing Assessment PIN. Returning to Student Dashboard.");
                window.location.href = "student.html";
                return;
            }

            const assessment = await DB.getAssessmentByPin(pin);
            if (!assessment) {
                alert(`❌ Assessment PIN "${pin}" not found or has been removed.`);
                window.location.href = "student.html";
                return;
            }

            activeAssessment = assessment;
            quizQuestions = (assessment.questionIds || [])
                .map((id) => qMap.get(id))
                .filter(Boolean);

            sidebarTitleEl.textContent = assessment.title || "Teacher Assessment";
            sidebarMetaEl.textContent = `${assessment.subject} • PIN #${assessment.pin}`;
        } else {
            // 云端自测练习模式（严格隔离：仅抽取 System Bank）
            const subject = sessionData.subject || "Mathematics";
            const chosenTags = sessionData.tags || [];
            const desiredCount = sessionData.count || 5;

            const pool = allQuestions.filter(
                (q) =>
                    q.status === "approved" &&
                    q.source === "System Bank" &&
                    q.subject === subject &&
                    (chosenTags.length === 0 || (q.tags || []).some((t) => chosenTags.includes(t)))
            );

            // 随机洗牌抽取
            for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }

            quizQuestions = pool.slice(0, Math.min(desiredCount, pool.length));
            activeAssessment = {
                pin: "PRACTICE",
                title: `Custom Practice (${subject})`,
                subject
            };
            sidebarTitleEl.textContent = `Custom Practice`;
            sidebarMetaEl.textContent = `${subject} • ${chosenTags.slice(0, 2).join(", ")}${chosenTags.length > 2 ? "…" : ""}`;
        }

        if (quizQuestions.length === 0) {
            alert("⚠️ No questions available in this assessment. Returning to dashboard.");
            window.location.href = "student.html";
            return;
        }

        userAnswers = new Array(quizQuestions.length).fill(null);
        totalQEl.textContent = quizQuestions.length;
        totalQTopEl.textContent = quizQuestions.length;

        // 每道题默认配 90 秒倒计时
        remainingSeconds = Math.max(180, quizQuestions.length * 90);
        startTimer();
        renderQuestion();
    } catch (err) {
        console.error("Load quiz failed:", err);
        alert("❌ Failed to load quiz from Firestore: " + err.message);
        window.location.href = "student.html";
    }
}

// ================= 2. 题目渲染、题号导航与切换 =================
function renderQuestion() {
    const q = quizQuestions[currentIndex];
    const topic = getQuestionTopicTag(q);

    topicTagEl.textContent = `📌 ${topic}`;
    if (q.difficulty) {
        diffTagEl.style.display = "inline-block";
        diffTagEl.textContent = q.difficulty;
    } else {
        diffTagEl.style.display = "none";
    }

    questionTextEl.textContent = `${currentIndex + 1}. ${q.questionText}`;
    currentQNumEl.textContent = currentIndex + 1;

    const answeredCount = userAnswers.filter((a) => a !== null).length;
    attemptedQEl.textContent = answeredCount;

    const pct = Math.round(((currentIndex + 1) / quizQuestions.length) * 100);
    progressFillEl.style.width = `${pct}%`;
    progressTextEl.textContent = `${pct}%`;

    const letters = ["A", "B", "C", "D"];
    optionsGridEl.innerHTML = (q.options || [])
        .map((opt, idx) => {
            const isSelected = userAnswers[currentIndex] === idx;
            return `
                <div class="option ${isSelected ? "selected" : ""}" data-opt-index="${idx}">
                    <div class="option-label">${letters[idx]}</div>
                    <div>${escapeHtml(opt)}</div>
                </div>
            `;
        })
        .join("");

    prevBtn.style.visibility = currentIndex === 0 ? "hidden" : "visible";

    if (currentIndex === quizQuestions.length - 1) {
        nextBtn.textContent = "Submit Assessment ✓";
        nextBtn.className = "btn btn-submit";
    } else {
        nextBtn.textContent = "Next Question →";
        nextBtn.className = "btn btn-next";
    }

    renderNavDots();
}

function renderNavDots() {
    qNavGridEl.innerHTML = quizQuestions
        .map((_, idx) => {
            const cls = [
                "q-dot",
                userAnswers[idx] !== null ? "answered" : "",
                idx === currentIndex ? "current" : ""
            ]
                .filter(Boolean)
                .join(" ");
            return `<button type="button" class="${cls}" data-jump="${idx}">${idx + 1}</button>`;
        })
        .join("");
}

optionsGridEl.addEventListener("click", (e) => {
    const optEl = e.target.closest(".option");
    if (!optEl) return;
    const chosenIdx = parseInt(optEl.dataset.optIndex, 10);
    userAnswers[currentIndex] = chosenIdx;
    renderQuestion();
});

qNavGridEl.addEventListener("click", (e) => {
    const jumpIdx = e.target.dataset.jump;
    if (jumpIdx === undefined) return;
    currentIndex = parseInt(jumpIdx, 10);
    renderQuestion();
});

prevBtn.addEventListener("click", () => {
    if (currentIndex > 0) {
        currentIndex--;
        renderQuestion();
    }
});

nextBtn.addEventListener("click", async () => {
    if (currentIndex < quizQuestions.length - 1) {
        currentIndex++;
        renderQuestion();
        return;
    }

    const unanswered = userAnswers.filter((a) => a === null).length;
    if (unanswered > 0) {
        const proceed = confirm(
            `You still have ${unanswered} unanswered question(s). Are you sure you want to submit now?`
        );
        if (!proceed) return;
    } else {
        if (!confirm("Submit your answers now?")) return;
    }

    await submitAssessment(false);
});

leaveQuizBtn.addEventListener("click", () => {
    if (confirm("Leave this assessment? Your unsaved progress will be lost.")) {
        window.location.href = "student.html";
    }
});

// ================= 3. 倒计时与防作弊切屏监测 =================
function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(() => {
        remainingSeconds--;
        updateTimerDisplay();
        if (remainingSeconds <= 0) {
            clearInterval(timerInterval);
            alert("⏰ Time is up! Your assessment is being submitted automatically.");
            submitAssessment(true);
        }
    }, 1000);
}

function updateTimerDisplay() {
    const mins = Math.floor(Math.max(0, remainingSeconds) / 60);
    const secs = Math.max(0, remainingSeconds) % 60;
    timerDisplayEl.textContent = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    timerBoxEl.classList.toggle("urgent", remainingSeconds <= 60);
}

function recordTabSwitch() {
    if (isSubmitting || quizQuestions.length === 0) return;
    const now = Date.now();
    // 1.5 秒内防抖，防止一次切屏同时触发 blur 和 visibilitychange 被记两次
    if (now - lastCheatTimestamp < 1500) return;
    lastCheatTimestamp = now;

    tabSwitchCount++;
    tabSwitchCountEl.textContent = tabSwitchCount;
    warnNumEl.textContent = tabSwitchCount;
    cheatWarningEl.classList.add("show");
}

document.addEventListener("visibilitychange", () => {
    if (document.hidden) recordTabSwitch();
});

window.addEventListener("blur", () => {
    recordTabSwitch();
});

closeWarnBtn.addEventListener("click", () => {
    cheatWarningEl.classList.remove("show");
});

// ================= 4. 自动阅卷、计算标签雷达数据并写入 Firestore =================
async function submitAssessment(isAutoSubmit = false) {
    if (isSubmitting) return;
    isSubmitting = true;
    clearInterval(timerInterval);

    nextBtn.disabled = true;
    nextBtn.textContent = "⏳ Submitting to Cloud...";

    try {
        let correctCount = 0;
        const tagScores = {};
        const reviewLog = [];
        const subjectCounter = {};

        quizQuestions.forEach((q, idx) => {
            const topic = getQuestionTopicTag(q);
            const studentIdx = userAnswers[idx];
            const isCorrect = studentIdx !== null && studentIdx === q.correctIndex;

            if (isCorrect) correctCount++;

            if (!tagScores[topic]) tagScores[topic] = { correct: 0, total: 0 };
            tagScores[topic].total++;
            if (isCorrect) tagScores[topic].correct++;

            const qSub = q.subject || "Mathematics";
            subjectCounter[qSub] = (subjectCounter[qSub] || 0) + 1;

            reviewLog.push({
                questionId: q.id,
                tag: topic,
                subject: qSub,
                difficulty: q.difficulty || "Medium",
                questionText: q.questionText,
                options: q.options || [],
                studentIndex: studentIdx,
                correctIndex: q.correctIndex,
                studentAnswer: studentIdx !== null ? (q.options?.[studentIdx] ?? "No Answer") : "Unanswered",
                correctAnswer: q.options?.[q.correctIndex] ?? q.correctAnswer ?? "",
                isCorrect,
                explanation: q.explanation || ""
            });
        });

        const totalQuestions = quizQuestions.length;
        const percentage = Math.round((correctCount / totalQuestions) * 100);

        // 决定主科目（确保与老师端 Class Analytics 的 Mathematics / Science 筛选对齐）
        let resolvedSubject = activeAssessment?.subject || "Mathematics";
        if (resolvedSubject !== "Mathematics" && resolvedSubject !== "Science") {
            resolvedSubject = (subjectCounter.Science || 0) > (subjectCounter.Mathematics || 0)
                ? "Science"
                : "Mathematics";
        }

        const resultPayload = {
            studentId: currentUser.uid,
            studentName: currentProfile?.name || "Student",
            mode: quizMode,
            pin: activeAssessment?.pin || "PRACTICE",
            testTitle: activeAssessment?.title || "Standard 6 Diagnostic Quiz",
            subject: resolvedSubject,
            score: correctCount,
            totalQuestions,
            percentage,
            tagScores,
            reviewLog,
            tabSwitches: tabSwitchCount,
            autoSubmitted: isAutoSubmit,
            teacherPbd: null,
            teacherRemark: "",
            isDemo: false
        };

        const savedResultId = await DB.saveResult(resultPayload);

        // 缓存一份供 report.html 立即展示与 AI Remedial 分析使用
        localStorage.setItem("latestResultId", savedResultId);
        localStorage.setItem("latestResultData", JSON.stringify({ id: savedResultId, ...resultPayload }));

        window.location.href = `report.html?id=${encodeURIComponent(savedResultId)}`;
    } catch (err) {
        console.error("Submit assessment error:", err);
        alert("❌ Failed to submit assessment: " + err.message);
        isSubmitting = false;
        nextBtn.disabled = false;
        nextBtn.textContent = "Submit Assessment ✓";
    }
}