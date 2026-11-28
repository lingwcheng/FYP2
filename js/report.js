// === js/report.js (云端真实报告：读取 Firestore 成绩 + 雷达图 + 老师 PBD 评语 + AI 错因诊断 Remedial) ===
import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { DB } from "./db.js";

const PBD_LABELS = {
    "TP 6": "Exemplary",
    "TP 5": "Proficient",
    "TP 4": "Satisfactory",
    "TP 3": "Moderate",
    "TP 2": "Developing",
    "TP 1": "Needs Support"
};

let currentReport = null;
let reportChartInstance = null;
let currentFilter = "mistakes"; // "mistakes" | "all"
const remedialCache = new Map(); // 缓存本次页面内已经查过的 AI 错因诊断，避免重复调接口

// DOM 引用
const sidebarStudentNameEl = document.getElementById("sidebar-student-name");
const logoutBtn = document.getElementById("logout-btn");
const reportTitleEl = document.getElementById("report-title");
const reportSubtitleEl = document.getElementById("report-subtitle");
const cardStudentNameEl = document.getElementById("card-student-name");
const accuracyRingEl = document.getElementById("accuracy-ring");
const accuracyPctEl = document.getElementById("accuracy-pct");
const scoreFractionEl = document.getElementById("score-fraction");
const submittedTimeTextEl = document.getElementById("submitted-time-text");

const chartTitleEl = document.getElementById("chart-title");
const chartSubtitleEl = document.getElementById("chart-subtitle");
const reportChartCanvasEl = document.getElementById("report-chart");

const pbdCardEl = document.getElementById("pbd-card");
const pbdGradeValEl = document.getElementById("pbd-grade-val");
const pbdRemarkBoxEl = document.getElementById("pbd-remark-box");
const statSubjectEl = document.getElementById("stat-subject");
const statStrongestEl = document.getElementById("stat-strongest");
const statWeakestEl = document.getElementById("stat-weakest");
const statMistakesEl = document.getElementById("stat-mistakes");
const statTabAlertsEl = document.getElementById("stat-tab-alerts");

const filterMistakesBtn = document.getElementById("filter-mistakes-btn");
const filterAllBtn = document.getElementById("filter-all-btn");
const reviewListEl = document.getElementById("review-list");

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
}

// ================= 1. 认证并加载 Firestore 最新成绩 =================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    const profile = await DB.getUserProfile(user.uid);
    sidebarStudentNameEl.textContent = profile?.name || user.email.split("@")[0];

    await loadReportData(user.uid);
});

logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    localStorage.removeItem("currentUser");
    window.location.href = "login.html";
});

async function loadReportData(uid) {
    try {
        const params = new URLSearchParams(window.location.search);
        const resultId = params.get("id") || localStorage.getItem("latestResultId");
        let rec = null;

        // 优先从 Firestore 读取最新记录（确保能看到老师刚刚评完的 PBD 等级和评语）
        if (resultId) {
            rec = await DB.getResultById(resultId);
        }

        // 若 URL 没有 ID，自动取该学生云端最近一次提交
        if (!rec) {
            const allMine = await DB.getStudentResults(uid);
            if (allMine.length > 0) {
                allMine.sort((a, b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0));
                rec = allMine[0];
            }
        }

        // 兜底读取刚交卷时的本地缓存
        if (!rec) {
            const cachedRaw = localStorage.getItem("latestResultData");
            if (cachedRaw) rec = JSON.parse(cachedRaw);
        }

        if (!rec) {
            reportSubtitleEl.textContent = "No assessment results found yet.";
            reviewListEl.innerHTML = '<div class="empty-state">Complete an exam or self-practice quiz first to view your diagnostic report!</div>';
            return;
        }

        currentReport = rec;
        renderOverview(rec);
        renderCompetencyChart(rec);

        // 如果全对（0 道错题），自动切换为显示全部题目
        const mistakesCount = (rec.reviewLog || []).filter((item) => !item.isCorrect).length;
        if (mistakesCount === 0) {
            currentFilter = "all";
            filterAllBtn.classList.add("active");
            filterMistakesBtn.classList.remove("active");
        }
        renderReviewList();
    } catch (err) {
        console.error("Load report failed:", err);
        reportSubtitleEl.textContent = "Failed to load report: " + err.message;
        reviewListEl.innerHTML = `<div class="empty-state">❌ Firestore Error: ${escapeHtml(err.message)}</div>`;
    }
}

// ================= 2. 渲染顶部总览卡片与老师 PBD 评分 =================
function renderOverview(rec) {
    const pct = Math.round(Number(rec.percentage) || 0);
    const score = rec.score ?? 0;
    const total = rec.totalQuestions ?? (rec.reviewLog?.length || 0);
    const mistakes = Math.max(0, total - score);
    const isPractice = rec.mode === "practice" || rec.pin === "PRACTICE";

    reportTitleEl.textContent = rec.testTitle || "Diagnostic Report";
    reportSubtitleEl.textContent = isPractice
        ? `Self-Practice Diagnostic • ${rec.subject}`
        : `Teacher Assessment (PIN #${rec.pin || "N/A"}) • ${rec.subject}`;

    cardStudentNameEl.textContent = rec.studentName || sidebarStudentNameEl.textContent;
    accuracyPctEl.textContent = `${pct}%`;
    scoreFractionEl.textContent = `${score} / ${total} Correct`;

    // 圆形进度环（周长 = 2 * π * 56 ≈ 351.86）
    const circumference = 351.86;
    const offset = circumference - (pct / 100) * circumference;
    accuracyRingEl.style.strokeDashoffset = offset;
    accuracyRingEl.style.stroke = pct >= 80 ? "#16a34a" : pct >= 60 ? "#f59e0b" : "#ef4444";

    if (rec.completedAt?.seconds) {
        submittedTimeTextEl.textContent = new Date(rec.completedAt.seconds * 1000).toLocaleString("en-MY", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    // 老师官方 PBD 等级与评语卡片
    if (isPractice) {
        pbdCardEl.className = "mini-card";
        pbdGradeValEl.textContent = "📝 Practice Mode (Not Graded)";
        pbdRemarkBoxEl.style.display = "none";
    } else if (rec.teacherPbd) {
        pbdCardEl.className = "mini-card pbd-banner";
        const lbl = PBD_LABELS[rec.teacherPbd] || "";
        pbdGradeValEl.textContent = `✅ ${rec.teacherPbd}${lbl ? " • " + lbl : ""}`;
        if (rec.teacherRemark) {
            pbdRemarkBoxEl.style.display = "block";
            pbdRemarkBoxEl.innerHTML = `💬 <strong>${escapeHtml(rec.gradedBy || "Teacher")}:</strong> ${escapeHtml(rec.teacherRemark)}`;
        } else {
            pbdRemarkBoxEl.style.display = "none";
        }
    } else {
        pbdCardEl.className = "mini-card pbd-banner pending";
        pbdGradeValEl.textContent = "⏳ Pending Teacher PBD Grade";
        pbdRemarkBoxEl.style.display = "none";
    }

    statSubjectEl.textContent = isPractice ? `${rec.subject} (Practice)` : `${rec.subject} • PIN #${rec.pin || "—"}`;
    statMistakesEl.textContent = `${mistakes} Mistake${mistakes === 1 ? "" : "s"}`;
    statMistakesEl.style.color = mistakes === 0 ? "#16a34a" : "#dc2626";

    if (!isPractice && Number(rec.tabSwitches) > 0) {
        statTabAlertsEl.style.display = "block";
        statTabAlertsEl.textContent = `⚠️ ${rec.tabSwitches} tab-switch alert(s) logged`;
    } else {
        statTabAlertsEl.style.display = "none";
    }

    // 强弱 KSSR 标签统计
    const tagEntries = Object.entries(rec.tagScores || {})
        .filter(([, s]) => (Number(s.total) || 0) > 0)
        .map(([tag, s]) => ({
            tag,
            pct: Math.round(((Number(s.correct) || 0) / Number(s.total)) * 100)
        }))
        .sort((a, b) => a.pct - b.pct);

    if (tagEntries.length > 0) {
        const weakest = tagEntries[0];
        const strongest = tagEntries[tagEntries.length - 1];
        statWeakestEl.textContent = `${weakest.tag} (${weakest.pct}%)`;
        statStrongestEl.textContent = `${strongest.tag} (${strongest.pct}%)`;
    }
}

// ================= 3. 绘制 KSSR 个人能力图（≥3 个标签用雷达图，1-2 个标签自动用柱状图更清晰） =================
function renderCompetencyChart(rec) {
    const entries = Object.entries(rec.tagScores || {})
        .filter(([, s]) => (Number(s.total) || 0) > 0)
        .map(([tag, s]) => ({
            tag,
            correct: Number(s.correct) || 0,
            total: Number(s.total) || 0,
            pct: Math.round(((Number(s.correct) || 0) / Number(s.total)) * 100)
        }));

    if (reportChartInstance) reportChartInstance.destroy();
    if (entries.length === 0) return;

    const labels = entries.map((e) => (e.tag.length > 20 ? e.tag.slice(0, 18) + "…" : e.tag));
    const values = entries.map((e) => e.pct);
    const useRadar = entries.length >= 3;

    chartTitleEl.textContent = `${rec.subject} KSSR ${useRadar ? "Competency Radar" : "Topic Mastery"}`;
    chartSubtitleEl.textContent = `${entries.length} KSSR topic(s) assessed`;

    reportChartInstance = new Chart(reportChartCanvasEl.getContext("2d"), {
        type: useRadar ? "radar" : "bar",
        data: {
            labels,
            datasets: [
                {
                    label: "Accuracy (%)",
                    data: values,
                    backgroundColor: useRadar
                        ? "rgba(67, 24, 255, 0.2)"
                        : values.map((v) => (v < 65 ? "rgba(239,68,68,0.75)" : v >= 80 ? "rgba(22,163,74,0.75)" : "rgba(245,158,11,0.75)")),
                    borderColor: useRadar ? "#4318FF" : "transparent",
                    borderWidth: 2.5,
                    borderRadius: useRadar ? 0 : 10,
                    pointBackgroundColor: values.map((v) => (v < 65 ? "#ef4444" : v >= 80 ? "#16a34a" : "#f59e0b")),
                    pointRadius: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: useRadar
                ? {
                      r: {
                          min: 0,
                          max: 100,
                          ticks: { stepSize: 20, backdropColor: "transparent", font: { size: 10 } },
                          pointLabels: { font: { size: 11, weight: "600" }, color: "#1e1b4b" }
                      }
                  }
                : {
                      y: { min: 0, max: 100, ticks: { stepSize: 20 } },
                      x: { ticks: { font: { size: 11, weight: "600" } } }
                  },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${entries[ctx.dataIndex].tag}: ${ctx.raw}% (${entries[ctx.dataIndex].correct}/${entries[ctx.dataIndex].total})`
                    }
                }
            }
        }
    });
}

// ================= 4. 逐题复盘列表 & 错题 AI Remedial =================
filterMistakesBtn.addEventListener("click", () => {
    currentFilter = "mistakes";
    filterMistakesBtn.classList.add("active");
    filterAllBtn.classList.remove("active");
    renderReviewList();
});

filterAllBtn.addEventListener("click", () => {
    currentFilter = "all";
    filterAllBtn.classList.add("active");
    filterMistakesBtn.classList.remove("active");
    renderReviewList();
});

function renderReviewList() {
    const log = currentReport?.reviewLog || [];
    if (log.length === 0) {
        reviewListEl.innerHTML = '<div class="empty-state">No question details were recorded for this submission.</div>';
        return;
    }

    const itemsWithIdx = log.map((item, idx) => ({ item, idx }));
    const visible = currentFilter === "mistakes"
        ? itemsWithIdx.filter(({ item }) => !item.isCorrect)
        : itemsWithIdx;

    if (visible.length === 0) {
        reviewListEl.innerHTML = '<div class="empty-state" style="color:#16a34a; font-style:normal; font-weight:600;">🎉 Amazing job! You made 0 mistakes on this assessment. Click "All Questions" to review every answer.</div>';
        return;
    }

    reviewListEl.innerHTML = visible
        .map(({ item, idx }) => {
            const isCorrect = Boolean(item.isCorrect);
            const cachedRem = remedialCache.get(idx);

            const remedialHtml = cachedRem ? buildRemedialContentHtml(cachedRem) : "";

            return `
                <div class="review-item ${isCorrect ? "correct" : "wrong"}">
                    <div class="item-top">
                        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                            <strong style="color:#1e1b4b;">Question ${idx + 1}</strong>
                            <span class="pill pill-tag">${escapeHtml(item.tag || "KSSR")}</span>
                            ${item.difficulty ? `<span class="pill" style="background:#fae8ff; color:#86198f;">${escapeHtml(item.difficulty)}</span>` : ""}
                        </div>
                        <span class="pill ${isCorrect ? "pill-ok" : "pill-err"}">
                            ${isCorrect ? "✓ Correct" : "✕ Incorrect"}
                        </span>
                    </div>

                    <div class="q-stem">${escapeHtml(item.questionText || item.question || "")}</div>

                    <div class="ans-compare">
                        <div class="ans-box ${isCorrect ? "student-right" : "student-wrong"}">
                            <div style="font-size:0.74rem; opacity:0.8; font-weight:600;">Your Answer</div>
                            <div style="font-weight:700; margin-top:2px;">${escapeHtml(item.studentAnswer || "Unanswered")}</div>
                        </div>
                        <div class="ans-box correct-ref">
                            <div style="font-size:0.74rem; opacity:0.8; font-weight:600;">Correct Answer</div>
                            <div style="font-weight:700; margin-top:2px;">${escapeHtml(item.correctAnswer || "")}</div>
                        </div>
                    </div>

                    ${item.explanation ? `<div class="base-exp">📘 <strong>Standard Solution:</strong> ${escapeHtml(item.explanation)}</div>` : ""}

                    ${
                        !isCorrect
                            ? `
                        <button type="button" class="ai-remedial-btn" data-remedial-idx="${idx}">
                            🤖 AI Remedial: Why did I choose this wrong answer?
                        </button>
                        <div class="remedial-panel ${cachedRem ? "show" : ""}" id="remedial-panel-${idx}">
                            ${remedialHtml}
                        </div>
                    `
                            : ""
                    }
                </div>
            `;
        })
        .join("");
}

function buildRemedialContentHtml(rem) {
    const stepsHtml = (rem.stepByStepFix || [])
        .map((s) => `<li>${escapeHtml(s)}</li>`)
        .join("");

    return `
        <div class="rem-title">🧠 Why You Likely Picked That Option (AI Misconception Analysis)</div>
        <div class="rem-text">${escapeHtml(rem.likelyReason)}</div>

        <div class="rem-title">✅ How to Solve It Correctly</div>
        <ol class="rem-steps">${stepsHtml}</ol>

        <div class="rem-tip">💡 Quick Tip: ${escapeHtml(rem.quickTip)}</div>
    `;
}

// 点击错题旁的“🤖 AI Remedial”实时调用 Gemini 3.5 Flash-Lite 分析错因
reviewListEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-remedial-idx]");
    if (!btn) return;

    const idx = parseInt(btn.dataset.remedialIdx, 10);
    const panel = document.getElementById(`remedial-panel-${idx}`);
    const item = currentReport?.reviewLog?.[idx];
    if (!item || !panel) return;

    // 若已生成过，直接展开/收起
    if (remedialCache.has(idx)) {
        panel.classList.toggle("show");
        return;
    }

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = "⏳ AI Analyzing your mistake...";
    panel.classList.add("show");
    panel.innerHTML = '<div style="font-size:0.86rem; color:#5b21b6; font-weight:600;">🔍 Analyzing why you chose "' + escapeHtml(item.studentAnswer) + '"...</div>';

    try {
        const res = await fetch("../api/ai_remedial.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                subject: item.subject || currentReport.subject || "Mathematics",
                tag: item.tag || "KSSR Standard 6",
                questionText: item.questionText || item.question || "",
                options: item.options || [],
                studentAnswer: item.studentAnswer || "Unanswered",
                correctAnswer: item.correctAnswer || "",
                explanation: item.explanation || ""
            })
        });

        const rawText = await res.text();
        let data;
        try {
            data = JSON.parse(rawText);
        } catch {
            throw new Error(`Server returned non-JSON (HTTP ${res.status}): ${rawText.slice(0, 180)}`);
        }

        if (!res.ok || !data.success) {
            throw new Error(data.error || `AI Remedial failed (HTTP ${res.status})`);
        }

        remedialCache.set(idx, data.remedial);
        panel.innerHTML = buildRemedialContentHtml(data.remedial);
        btn.textContent = "✨ Hide / Show AI Remedial";
    } catch (err) {
        console.error("AI Remedial Error:", err);
        panel.innerHTML = `<div style="color:#dc2626; font-size:0.85rem; font-weight:600;">❌ ${escapeHtml(err.message)}</div>`;
        btn.textContent = originalText;
    } finally {
        btn.disabled = false;
    }
});