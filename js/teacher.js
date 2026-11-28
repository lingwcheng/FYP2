// === js/teacher.js (完整定稿版：三源混合组卷 + 多选标签 + 一键去重 + 批量导入 + Protected FIFO + 真·双AI + 自创打标 + 班级/个人雷达图 & 老师 PBD 评分) ===
import { auth } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { DB } from "./db.js";

// 马来西亚 KSSR 六年级官方标签体系
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

const ALL_KSSR_TOPIC_TAGS = new Set([...KSSR_TAGS.Mathematics, ...KSSR_TAGS.Science]);

// 全局状态
let currentUserProfile = null;
let allQuestionsCache = [];
let filteredApprovedCache = [];
let allAssessmentsCache = [];
let allResultsCache = [];
let tagQuotaLimit = 2000;

let radarChartInstance = null;
let studentRadarChartInstance = null;
let radarViewMode = "weakest5";          // "weakest5" | "all"
let currentClassAvgByTag = {};           // 当前筛选条件下的全班各标签平均分（供个人弹窗虚线对比）
let activeEvalResultId = null;           // 当前正在评分的学生成绩文档 ID
let selectedEvalTp = "";                 // 老师在弹窗中选中的 TP 1 - TP 6

let selectedCartIds = new Set();
let selectedAiReviewIds = new Set();
let uncheckedAiReviewIds = new Set();
let selectedManualTags = new Set();
let selectedAiGenTags = new Set();
let selectedAutoPickTags = new Set();

// DOM 引用
const teacherNameEl = document.getElementById("teacher-name");
const logoutBtn = document.getElementById("logout-btn");
const navItems = document.querySelectorAll(".nav-item[data-view]");
const viewSections = document.querySelectorAll(".view-section");
const pendingBadgeEl = document.getElementById("pending-badge");

// 视图 1：题库、配额、三源配比抽卷与组卷
const filterSubjectEl = document.getElementById("filter-subject");
const filterTagEl = document.getElementById("filter-tag");
const filterSourceEl = document.getElementById("filter-source");
const filterSearchEl = document.getElementById("filter-search");
const dedupeBankBtn = document.getElementById("dedupe-bank-btn");
const seedSampleBtn = document.getElementById("seed-sample-btn");
const bankCountEl = document.getElementById("bank-count");
const bankListEl = document.getElementById("bank-list");

const quotaDisplayValEl = document.getElementById("quota-display-val");
const quotaLimitInputEl = document.getElementById("quota-limit-input");
const saveQuotaBtn = document.getElementById("save-quota-btn");
const runFifoNowBtn = document.getElementById("run-fifo-now-btn");

const cartCountEl = document.getElementById("cart-count");
const clearCartBtn = document.getElementById("clear-cart-btn");
const autopickTagChipsEl = document.getElementById("autopick-tag-chips");
const autopickSysEl = document.getElementById("autopick-sys");
const autopickCustomEl = document.getElementById("autopick-custom");
const autopickAiEl = document.getElementById("autopick-ai");
const autopickAvailHintEl = document.getElementById("autopick-avail-hint");
const autopickBtn = document.getElementById("autopick-btn");
const cartMixSummaryEl = document.getElementById("cart-mix-summary");
const cartListEl = document.getElementById("cart-list");
const testTitleInput = document.getElementById("test-title-input");
const generateBankTestBtn = document.getElementById("generate-bank-test-btn");
const publishedTestsListEl = document.getElementById("published-tests-list");

// 批量导入弹窗 DOM
const openImportBtn = document.getElementById("open-import-btn");
const importModal = document.getElementById("import-modal");
const closeImportModalBtn = document.getElementById("close-import-modal-btn");
const dlCsvTemplateBtn = document.getElementById("dl-csv-template-btn");
const dlJsonTemplateBtn = document.getElementById("dl-json-template-btn");
const importSourceSelect = document.getElementById("import-source-select");
const importFileInput = document.getElementById("import-file-input");
const importJsonPaste = document.getElementById("import-json-paste");
const importProgressTrack = document.getElementById("import-progress-track");
const importProgressFill = document.getElementById("import-progress-fill");
const importStatusText = document.getElementById("import-status-text");
const startImportBtn = document.getElementById("start-import-btn");

// 视图 2：双 AI 生成与审核
const aiSubjectEl = document.getElementById("ai-subject");
const aiGradeEl = document.getElementById("ai-grade");
const aiTagChipsEl = document.getElementById("ai-tag-chips");
const aiCountEl = document.getElementById("ai-count");
const aiDifficultyEl = document.getElementById("ai-difficulty");
const aiGenForm = document.getElementById("ai-gen-form");
const aiGenBtn = document.getElementById("ai-gen-btn");
const pendingCountEl = document.getElementById("pending-count");
const reviewListEl = document.getElementById("review-list");
const aiSelectedCountEl = document.getElementById("ai-selected-count");
const aiTestTitleEl = document.getElementById("ai-test-title");
const approveAddCartBtn = document.getElementById("approve-add-cart-btn");
const approveAndPublishBtn = document.getElementById("approve-and-publish-btn");
const approveOnlyBtn = document.getElementById("approve-only-btn");

// 视图 3：自创题目
const qSubjectEl = document.getElementById("q-subject");
const manualTagChipsEl = document.getElementById("manual-tag-chips");
const createForm = document.getElementById("create-q-form");
const saveQBtn = document.getElementById("save-q-btn");

// 视图 4：班级诊断分析
const analyticsSubjectFilterEl = document.getElementById("analytics-subject-filter");
const analyticsTestFilterEl = document.getElementById("analytics-test-filter");
const seedDemoResultsBtn = document.getElementById("seed-demo-results-btn");
const clearDemoResultsBtn = document.getElementById("clear-demo-results-btn");
const kpiSubmissionsEl = document.getElementById("kpi-submissions");
const kpiGradedProgressEl = document.getElementById("kpi-graded-progress");
const kpiAvgScoreEl = document.getElementById("kpi-avg-score");
const kpiAvgPbdEl = document.getElementById("kpi-avg-pbd");
const kpiWeakestTagEl = document.getElementById("kpi-weakest-tag");
const kpiWeakestPctEl = document.getElementById("kpi-weakest-pct");
const kpiStrongestTagEl = document.getElementById("kpi-strongest-tag");
const kpiStrongestPctEl = document.getElementById("kpi-strongest-pct");
const radarModeWeak5Btn = document.getElementById("radar-mode-weak5");
const radarModeAllBtn = document.getElementById("radar-mode-all");
const radarModeHintEl = document.getElementById("radar-mode-hint");
const radarCanvasEl = document.getElementById("class-radar-chart");
const radarEmptyMsgEl = document.getElementById("radar-empty-msg");
const tagMasteryListEl = document.getElementById("tag-mastery-list");
const tableCountPillEl = document.getElementById("table-count-pill");
const studentResultsTbodyEl = document.getElementById("student-results-tbody");

// 学生个人诊断 & PBD 评分弹窗 DOM
const studentEvalModal = document.getElementById("student-eval-modal");
const closeEvalModalBtn = document.getElementById("close-eval-modal-btn");
const evalStudentNameEl = document.getElementById("eval-student-name");
const evalTestMetaEl = document.getElementById("eval-test-meta");
const evalScoreBadgeEl = document.getElementById("eval-score-badge");
const studentRadarCanvasEl = document.getElementById("student-radar-chart");
const evalTagListEl = document.getElementById("eval-tag-list");
const evalRefPbdEl = document.getElementById("eval-ref-pbd");
const evalTpSelectorEl = document.getElementById("eval-tp-selector");
const evalTeacherRemarkEl = document.getElementById("eval-teacher-remark");
const savePbdGradeBtn = document.getElementById("save-pbd-grade-btn");

// PIN 弹窗
const pinModal = document.getElementById("pin-modal");
const modalTestTitleEl = document.getElementById("modal-test-title");
const modalPinCodeEl = document.getElementById("modal-pin-code");
const copyPinBtn = document.getElementById("copy-pin-btn");
const closePinModalBtn = document.getElementById("close-pin-modal-btn");

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text ?? "";
    return div.innerHTML;
}

function generateSixDigitPin() {
    return String(Math.floor(100000 + Math.random() * 900000));
}

function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function getQuestionSource(q) {
    return q.source || (q.aiVerification ? "Dual-AI" : "Teacher Custom");
}

async function copyTextToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const tmp = document.createElement("textarea");
        tmp.value = text;
        document.body.appendChild(tmp);
        tmp.select();
        document.execCommand("copy");
        document.body.removeChild(tmp);
        return true;
    }
}

function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function showPinModal(title, pin) {
    modalTestTitleEl.textContent = title;
    modalPinCodeEl.textContent = pin;
    copyPinBtn.textContent = "📋 Copy PIN";
    pinModal.classList.add("show");
}

copyPinBtn.addEventListener("click", async () => {
    await copyTextToClipboard(modalPinCodeEl.textContent);
    copyPinBtn.textContent = "✅ PIN Copied!";
    setTimeout(() => (copyPinBtn.textContent = "📋 Copy PIN"), 1800);
});

closePinModalBtn.addEventListener("click", () => {
    pinModal.classList.remove("show");
});

function switchActiveView(viewId) {
    navItems.forEach((b) => b.classList.toggle("active", b.dataset.view === viewId));
    viewSections.forEach((s) => s.classList.toggle("active", s.id === viewId));
    if (viewId === "view-analytics") {
        renderClassAnalytics();
    }
}

function getProtectedQuestionIdSet(extraProtectedIds = []) {
    const protectedSet = new Set(extraProtectedIds);
    allAssessmentsCache.forEach((assessment) => {
        (assessment.questionIds || []).forEach((id) => protectedSet.add(id));
    });
    return protectedSet;
}

function extractKssrTopicTags(questions) {
    const found = new Set();
    questions.forEach((q) => {
        (q.tags || []).forEach((t) => {
            if (ALL_KSSR_TOPIC_TAGS.has(t)) found.add(t);
        });
    });
    return Array.from(found);
}

// 系统参考 PBD 等级（仅供参考，最终由老师在弹窗中手动确认）
function getSuggestedPbd(pct) {
    if (pct >= 90) return { tp: "TP 6", label: "Exemplary" };
    if (pct >= 80) return { tp: "TP 5", label: "Proficient" };
    if (pct >= 65) return { tp: "TP 4", label: "Satisfactory" };
    if (pct >= 50) return { tp: "TP 3", label: "Moderate" };
    if (pct >= 35) return { tp: "TP 2", label: "Developing" };
    return { tp: "TP 1", label: "Needs Support" };
}

function getPbdLabel(tp) {
    const map = {
        "TP 6": "Exemplary",
        "TP 5": "Proficient",
        "TP 4": "Satisfactory",
        "TP 3": "Moderate",
        "TP 2": "Developing",
        "TP 1": "Needs Support"
    };
    return map[tp] || "";
}

// ================= 1. 登录认证与初始化 =================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }
    const [profile, savedLimit] = await Promise.all([
        DB.getUserProfile(user.uid),
        DB.getTagQuotaLimit()
    ]);

    currentUserProfile = profile || { uid: user.uid, name: user.email, role: "teacher" };
    teacherNameEl.textContent = currentUserProfile.name || "Teacher";

    tagQuotaLimit = savedLimit;
    quotaDisplayValEl.textContent = tagQuotaLimit;
    quotaLimitInputEl.value = tagQuotaLimit;

    renderManualTagChips();
    renderAiGenTagChips();
    await refreshCloudData();
});

logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    localStorage.removeItem("currentUser");
    window.location.href = "login.html";
});

navItems.forEach((btn) => {
    btn.addEventListener("click", () => switchActiveView(btn.dataset.view));
});

async function refreshCloudData() {
    try {
        const [qList, aList, rList] = await Promise.all([
            DB.getAllQuestions(),
            DB.getAllAssessments(),
            DB.getAllResults()
        ]);
        qList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        aList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        rList.sort((a, b) => (b.completedAt?.seconds || 0) - (a.completedAt?.seconds || 0));

        allQuestionsCache = qList;
        allAssessmentsCache = aList;
        allResultsCache = rList;

        const pendingList = qList.filter((q) => q.status === "pending");
        const validPendingIds = new Set(pendingList.map((q) => q.id));
        for (const id of [...selectedAiReviewIds]) {
            if (!validPendingIds.has(id)) selectedAiReviewIds.delete(id);
        }
        for (const id of [...uncheckedAiReviewIds]) {
            if (!validPendingIds.has(id)) uncheckedAiReviewIds.delete(id);
        }
        pendingList.forEach((q) => {
            if (!uncheckedAiReviewIds.has(q.id)) selectedAiReviewIds.add(q.id);
        });

        populateFilterTags();
        applyBankFilter();
        renderCart();
        renderPublishedTests();
        renderReviewQueue(pendingList);
        populateAnalyticsTestFilter();

        if (document.getElementById("view-analytics").classList.contains("active")) {
            renderClassAnalytics();
        }
    } catch (err) {
        console.error("Cloud sync error:", err);
        bankListEl.innerHTML = `<div class="empty-bank">❌ Firestore Error: ${escapeHtml(err.message)}</div>`;
    }
}

// ================= 2. 配额管理与 Protected FIFO 清理 =================
saveQuotaBtn.addEventListener("click", async () => {
    const val = parseInt(quotaLimitInputEl.value, 10);
    if (!val || val < 1 || val > 10000) {
        alert("⚠️ Please enter a valid limit between 1 and 10,000.");
        return;
    }
    saveQuotaBtn.disabled = true;
    saveQuotaBtn.textContent = "...";
    try {
        tagQuotaLimit = await DB.saveTagQuotaLimit(val);
        quotaDisplayValEl.textContent = tagQuotaLimit;
        quotaLimitInputEl.value = tagQuotaLimit;
        populateFilterTags();
        alert(`✅ Per-tag FIFO limit saved as ${tagQuotaLimit} questions.\nWhen approved questions exceed ${tagQuotaLimit} in any tag, the oldest idle Dual-AI questions will be automatically pruned.`);
    } catch (err) {
        alert("❌ Failed to save quota: " + err.message);
    } finally {
        saveQuotaBtn.disabled = false;
        saveQuotaBtn.textContent = "Save";
    }
});

runFifoNowBtn.addEventListener("click", async () => {
    runFifoNowBtn.disabled = true;
    runFifoNowBtn.textContent = "⏳...";
    try {
        const protectedSet = getProtectedQuestionIdSet();
        const result = await DB.enforceTagQuota(
            Array.from(ALL_KSSR_TOPIC_TAGS),
            tagQuotaLimit,
            protectedSet
        );
        await refreshCloudData();

        if (result.evictedCount > 0) {
            const lines = result.details
                .map((d) => `• ${d.tag}: removed ${d.removed} oldest Dual-AI Q(s) → now ${d.remaining}/${d.limit}`)
                .join("\n");
            alert(`♻️ Protected FIFO Cleanup Complete!\n${lines}`);
        } else {
            alert(`✅ All KSSR tags are within limit (${tagQuotaLimit} Qs/tag), or remaining items are protected (System Bank / Teacher Custom / Active PIN Tests).`);
        }
    } catch (err) {
        alert("❌ FIFO check failed: " + err.message);
    } finally {
        runFifoNowBtn.disabled = false;
        runFifoNowBtn.textContent = "🧹 Check";
    }
});

// ================= 3. 视图 1：题库筛选、多选标签抽卷、一键去重、PIN 列表 =================
function populateFilterTags() {
    const prevSelected = filterTagEl.value || "ALL";
    const sub = filterSubjectEl.value;
    const tags = KSSR_TAGS[sub] || [];

    const approved = allQuestionsCache.filter((q) => q.status === "approved" && q.subject === sub);
    const countMap = {};
    approved.forEach((q) => {
        (q.tags || []).forEach((t) => {
            countMap[t] = (countMap[t] || 0) + 1;
        });
    });

    filterTagEl.innerHTML =
        `<option value="ALL">All ${escapeHtml(sub)} Tags (${approved.length} Total)</option>` +
        tags
            .map((t) => {
                const cnt = countMap[t] || 0;
                return `<option value="${escapeHtml(t)}">${escapeHtml(t)} (${cnt}/${tagQuotaLimit})</option>`;
            })
            .join("");

    if (prevSelected !== "ALL" && tags.includes(prevSelected)) {
        filterTagEl.value = prevSelected;
    }

    renderAutoPickTagChips();
}

function renderAutoPickTagChips() {
    const sub = filterSubjectEl.value;
    const tags = KSSR_TAGS[sub] || [];
    const validSet = new Set(tags);

    for (const t of [...selectedAutoPickTags]) {
        if (!validSet.has(t)) selectedAutoPickTags.delete(t);
    }

    autopickTagChipsEl.innerHTML = tags
        .map((t) => {
            const isSel = selectedAutoPickTags.has(t) ? "selected" : "";
            return `<span class="tag-chip ${isSel}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`;
        })
        .join("");
}

autopickTagChipsEl.addEventListener("click", (e) => {
    if (!e.target.classList.contains("tag-chip")) return;
    const tag = e.target.dataset.tag;
    if (selectedAutoPickTags.has(tag)) {
        selectedAutoPickTags.delete(tag);
        e.target.classList.remove("selected");
    } else {
        selectedAutoPickTags.add(tag);
        e.target.classList.add("selected");
    }
    updateAutoPickAvailability();
});

filterSubjectEl.addEventListener("change", () => {
    selectedAutoPickTags.clear();
    populateFilterTags();
    applyBankFilter();
});
filterTagEl.addEventListener("change", applyBankFilter);
filterSourceEl.addEventListener("change", applyBankFilter);
filterSearchEl.addEventListener("input", applyBankFilter);

function getAutoPickPool() {
    const sub = filterSubjectEl.value;
    const chosenTags = Array.from(selectedAutoPickTags);
    return allQuestionsCache.filter((q) => {
        if (q.status !== "approved" || q.subject !== sub) return false;
        if (selectedCartIds.has(q.id)) return false;
        if (chosenTags.length > 0 && !(q.tags || []).some((t) => chosenTags.includes(t))) return false;
        return true;
    });
}

function updateAutoPickAvailability() {
    const unselected = getAutoPickPool();
    let sys = 0, custom = 0, ai = 0;
    unselected.forEach((q) => {
        const src = getQuestionSource(q);
        if (src === "System Bank") sys++;
        else if (src === "Dual-AI") ai++;
        else custom++;
    });
    if (autopickAvailHintEl) {
        autopickAvailHintEl.textContent = `Avail: ${sys} Sys | ${custom} Custom | ${ai} AI`;
    }
}

function applyBankFilter() {
    const sub = filterSubjectEl.value;
    const tag = filterTagEl.value;
    const src = filterSourceEl.value;
    const keyword = filterSearchEl.value.trim().toLowerCase();

    let list = allQuestionsCache.filter((q) => q.status === "approved" && q.subject === sub);

    if (tag !== "ALL") list = list.filter((q) => (q.tags || []).includes(tag));
    if (src !== "ALL") {
        list = list.filter((q) => getQuestionSource(q) === src);
    }
    if (keyword) {
        list = list.filter((q) => (q.questionText || "").toLowerCase().includes(keyword));
    }

    filteredApprovedCache = list;
    updateAutoPickAvailability();
    renderApprovedBank(list);
}

function renderApprovedBank(questions) {
    bankCountEl.textContent = `${questions.length} Qs`;
    if (questions.length === 0) {
        bankListEl.innerHTML = '<div class="empty-bank">No approved questions match these filters. Use "📥 Bulk Import" or "⚡ Load 8 Sample Qs"!</div>';
        return;
    }

    const activeTestQuestionIds = getProtectedQuestionIdSet();

    bankListEl.innerHTML = questions
        .map((q) => {
            const inCart = selectedCartIds.has(q.id);
            const isLocked = activeTestQuestionIds.has(q.id);
            const sourceLabel = getQuestionSource(q);

            const tagBadges = (q.tags || [])
                .map((t) => {
                    let cls = "q-tag";
                    if (t === "Mathematics" || t === "Science") cls += " tag-sub";
                    else if (t === "Standard 6") cls += " tag-std";
                    else if (["Easy", "Medium", "Hard", "KBAT"].includes(t)) cls += " tag-diff";
                    else if (t === "Teacher Custom") cls += " tag-custom";
                    return `<span class="${cls}">${escapeHtml(t)}</span>`;
                })
                .join("");

            let sourceBadge = "";
            if (sourceLabel === "Dual-AI") {
                sourceBadge = `<span class="q-tag tag-ai">✓ Dual-AI Verified</span>`;
            } else if (sourceLabel === "System Bank") {
                sourceBadge = `<span class="q-tag tag-system">🏛️ System Bank</span>`;
            } else if (sourceLabel === "Teacher Custom" && !(q.tags || []).includes("Teacher Custom")) {
                sourceBadge = `<span class="q-tag tag-custom">👩‍🏫 Teacher Custom</span>`;
            }

            const lockedBadge = isLocked
                ? `<span class="q-tag tag-locked" title="Referenced by an active Test PIN (Protected from FIFO cleanup)">🔒 In Active Test</span>`
                : "";

            const optsHtml = (q.options || [])
                .map((opt, idx) => {
                    const letter = ["A", "B", "C", "D"][idx];
                    const isCorrect = idx === q.correctIndex;
                    return `<li class="${isCorrect ? "correct-opt" : ""}">${letter}. ${escapeHtml(opt)} ${isCorrect ? "✓" : ""}</li>`;
                })
                .join("");

            return `
                <div class="q-item ${inCart ? "selected-card" : ""}">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:6px;">
                        <div class="q-tags">${tagBadges}${sourceBadge}${lockedBadge}</div>
                        <div style="display:flex; gap:6px; flex-shrink:0;">
                            <button class="btn-sm btn-add-q ${inCart ? "in-cart" : ""}" data-action="toggle-cart" data-id="${q.id}">
                                ${inCart ? "✓ Added" : "+ Add to Test"}
                            </button>
                            <button class="btn-sm btn-edit" data-action="toggle-bank-edit" data-id="${q.id}">✏️</button>
                            <button class="btn-sm btn-danger" data-action="delete-bank" data-id="${q.id}">🗑️</button>
                        </div>
                    </div>
                    <div class="q-text">${escapeHtml(q.questionText)}</div>
                    <ul class="q-options">${optsHtml}</ul>
                    ${q.explanation ? `<div class="q-explanation">💡 ${escapeHtml(q.explanation)}</div>` : ""}

                    <div class="edit-box" id="bank-edit-box-${q.id}">
                        <div class="form-group">
                            <label class="form-label">Edit Question Text</label>
                            <textarea class="form-control edit-q-text">${escapeHtml(q.questionText)}</textarea>
                        </div>
                        <div class="row-2">
                            <div class="form-group"><label class="form-label">Option A</label><input type="text" class="form-control edit-opt-0" value="${escapeHtml(q.options?.[0] || "")}"></div>
                            <div class="form-group"><label class="form-label">Option B</label><input type="text" class="form-control edit-opt-1" value="${escapeHtml(q.options?.[1] || "")}"></div>
                            <div class="form-group"><label class="form-label">Option C</label><input type="text" class="form-control edit-opt-2" value="${escapeHtml(q.options?.[2] || "")}"></div>
                            <div class="form-group"><label class="form-label">Option D</label><input type="text" class="form-control edit-opt-3" value="${escapeHtml(q.options?.[3] || "")}"></div>
                        </div>
                        <div class="row-2">
                            <div class="form-group">
                                <label class="form-label">Correct Answer</label>
                                <select class="form-control edit-correct">
                                    <option value="0" ${q.correctIndex === 0 ? "selected" : ""}>Option A</option>
                                    <option value="1" ${q.correctIndex === 1 ? "selected" : ""}>Option B</option>
                                    <option value="2" ${q.correctIndex === 2 ? "selected" : ""}>Option C</option>
                                    <option value="3" ${q.correctIndex === 3 ? "selected" : ""}>Option D</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Explanation</label>
                                <input type="text" class="form-control edit-explanation" value="${escapeHtml(q.explanation || "")}">
                            </div>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button type="button" class="btn-sm btn-add-q in-cart" data-action="save-bank-edit" data-id="${q.id}">💾 Save Changes</button>
                            <button type="button" class="btn-sm btn-outline" data-action="toggle-bank-edit" data-id="${q.id}">Cancel</button>
                        </div>
                    </div>
                </div>
            `;
        })
        .join("");
}

bankListEl.addEventListener("click", async (e) => {
    const action = e.target.dataset.action;
    const id = e.target.dataset.id;
    if (!action || !id) return;

    if (action === "toggle-cart") {
        if (selectedCartIds.has(id)) selectedCartIds.delete(id);
        else selectedCartIds.add(id);
        applyBankFilter();
        renderCart();
    } else if (action === "toggle-bank-edit") {
        document.getElementById(`bank-edit-box-${id}`)?.classList.toggle("open");
    } else if (action === "save-bank-edit") {
        const box = document.getElementById(`bank-edit-box-${id}`);
        const newText = box.querySelector(".edit-q-text").value.trim();
        const newOpts = [
            box.querySelector(".edit-opt-0").value.trim(),
            box.querySelector(".edit-opt-1").value.trim(),
            box.querySelector(".edit-opt-2").value.trim(),
            box.querySelector(".edit-opt-3").value.trim()
        ];
        const newCorrectIdx = parseInt(box.querySelector(".edit-correct").value, 10);
        const newExp = box.querySelector(".edit-explanation").value.trim();

        e.target.disabled = true;
        e.target.textContent = "Saving...";
        try {
            await DB.updateQuestion(id, {
                questionText: newText,
                options: newOpts,
                correctIndex: newCorrectIdx,
                correctAnswer: newOpts[newCorrectIdx],
                explanation: newExp
            });
            await refreshCloudData();
        } catch (err) {
            alert("❌ Update failed: " + err.message);
        }
    } else if (action === "delete-bank") {
        if (!confirm("Delete this question permanently from Cloud Firestore?")) return;
        selectedCartIds.delete(id);
        await DB.deleteQuestion(id);
        await refreshCloudData();
    }
});

// 方式 B：按所选标签 + System Bank / Teacher Custom / Dual-AI 三源配比一键随机混搭抽卷
autopickBtn.addEventListener("click", () => {
    const reqSys = Math.max(0, parseInt(autopickSysEl.value, 10) || 0);
    const reqCustom = Math.max(0, parseInt(autopickCustomEl.value, 10) || 0);
    const reqAi = Math.max(0, parseInt(autopickAiEl.value, 10) || 0);

    if (reqSys + reqCustom + reqAi === 0) {
        alert("⚠️ Please enter at least 1 question for System, Custom, or Dual-AI.");
        return;
    }

    const unselected = getAutoPickPool();
    const sysPool = shuffleArray(unselected.filter((q) => getQuestionSource(q) === "System Bank"));
    const customPool = shuffleArray(unselected.filter((q) => getQuestionSource(q) === "Teacher Custom"));
    const aiPool = shuffleArray(unselected.filter((q) => getQuestionSource(q) === "Dual-AI"));

    const pickedSys = sysPool.slice(0, reqSys);
    const pickedCustom = customPool.slice(0, reqCustom);
    const pickedAi = aiPool.slice(0, reqAi);

    const totalPicked = [...pickedSys, ...pickedCustom, ...pickedAi];
    if (totalPicked.length === 0) {
        const tagHint = selectedAutoPickTags.size > 0
            ? `\nSelected tags: ${Array.from(selectedAutoPickTags).join(", ")}`
            : "";
        alert(`⚠️ No unselected matching questions found for ${filterSubjectEl.value}.${tagHint}`);
        return;
    }

    totalPicked.forEach((q) => selectedCartIds.add(q.id));
    applyBankFilter();
    renderCart();

    const shortfalls = [];
    if (pickedSys.length < reqSys) shortfalls.push(`System Bank: ${pickedSys.length}/${reqSys}`);
    if (pickedCustom.length < reqCustom) shortfalls.push(`Teacher Custom: ${pickedCustom.length}/${reqCustom}`);
    if (pickedAi.length < reqAi) shortfalls.push(`Dual-AI: ${pickedAi.length}/${reqAi}`);

    if (shortfalls.length > 0) {
        alert(`🎲 Added ${totalPicked.length} questions to Test Paper.\nPartial match due to available pool:\n• ${shortfalls.join("\n• ")}`);
    }
});

clearCartBtn.addEventListener("click", () => {
    selectedCartIds.clear();
    applyBankFilter();
    renderCart();
});

function renderCart() {
    const chosen = allQuestionsCache.filter((q) => selectedCartIds.has(q.id));
    cartCountEl.textContent = `${chosen.length} Selected`;
    clearCartBtn.style.display = chosen.length > 0 ? "inline-block" : "none";

    if (chosen.length === 0) {
        cartMixSummaryEl.style.display = "none";
        cartListEl.innerHTML = '<div class="empty-bank" style="padding:18px;">Click "+ Add to Test", use Hybrid Auto-Pick above, or send questions from Dual-AI Generator.</div>';
        return;
    }

    let cSys = 0, cCustom = 0, cAi = 0;
    chosen.forEach((q) => {
        const src = getQuestionSource(q);
        if (src === "System Bank") cSys++;
        else if (src === "Dual-AI") cAi++;
        else cCustom++;
    });
    cartMixSummaryEl.style.display = "block";
    cartMixSummaryEl.textContent = `📊 Paper Mix: 🏛️ ${cSys} System Bank  •  👩‍🏫 ${cCustom} Custom  •  🤖 ${cAi} Dual-AI`;

    cartListEl.innerHTML = chosen
        .map((q, idx) => {
            const src = getQuestionSource(q);
            const shortTag = src === "System Bank" ? "🏛️" : src === "Dual-AI" ? "🤖" : "👩‍🏫";
            return `
                <div class="cart-item">
                    <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                        <span>${shortTag}</span> <strong>Q${idx + 1}.</strong> ${escapeHtml(q.questionText)}
                    </div>
                    <button class="btn-sm btn-danger" data-remove-cart="${q.id}">✕</button>
                </div>
            `;
        })
        .join("");
}

cartListEl.addEventListener("click", (e) => {
    const id = e.target.dataset.removeCart;
    if (!id) return;
    selectedCartIds.delete(id);
    applyBankFilter();
    renderCart();
});

generateBankTestBtn.addEventListener("click", async () => {
    const chosen = allQuestionsCache.filter((q) => selectedCartIds.has(q.id));
    if (chosen.length === 0) {
        alert("⚠️ Please select at least 1 question from the Question Bank first.");
        return;
    }

    const title = testTitleInput.value.trim() || `Standard 6 Diagnostic Test (${chosen.length} Qs)`;
    await publishAssessmentWithPin(title, chosen, generateBankTestBtn);
    selectedCartIds.clear();
    testTitleInput.value = "";
    await refreshCloudData();
});

async function publishAssessmentWithPin(title, questionObjects, triggerBtn) {
    const originalText = triggerBtn.textContent;
    triggerBtn.disabled = true;
    triggerBtn.textContent = "Generating Test PIN...";

    try {
        const pin = generateSixDigitPin();
        const subjects = [...new Set(questionObjects.map((q) => q.subject))];
        const allTags = [...new Set(questionObjects.flatMap((q) => q.tags || []))];

        await DB.saveAssessment({
            pin,
            title,
            grade: "Standard 6",
            subject: subjects.length === 1 ? subjects[0] : "Mixed (Math & Science)",
            selectedTags: allTags,
            questionIds: questionObjects.map((q) => q.id),
            questionCount: questionObjects.length,
            createdBy: currentUserProfile?.uid || "teacher",
            teacherName: currentUserProfile?.name || "Teacher"
        });

        showPinModal(title, pin);
    } catch (err) {
        console.error("Publish Test Error:", err);
        alert("❌ Failed to publish test: " + err.message);
    } finally {
        triggerBtn.disabled = false;
        triggerBtn.textContent = originalText;
    }
}

function renderPublishedTests() {
    if (allAssessmentsCache.length === 0) {
        publishedTestsListEl.innerHTML = '<div class="empty-bank" style="padding:18px;">No tests published yet.</div>';
        return;
    }

    publishedTestsListEl.innerHTML = allAssessmentsCache
        .map(
            (a) => `
            <div class="pin-card">
                <div style="min-width:0;">
                    <div style="font-weight:600; font-size:0.86rem; color:#1e1b4b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(a.title)}</div>
                    <div style="font-size:0.75rem; color:#64748b;">${escapeHtml(a.subject)} • ${a.questionIds?.length || 0} Qs</div>
                </div>
                <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                    <span class="pin-code-pill">${escapeHtml(a.pin)}</span>
                    <button class="btn-sm btn-outline" data-copy-pin="${escapeHtml(a.pin)}">📋 Copy</button>
                    <button class="btn-sm btn-danger" data-del-test="${a.id}">✕</button>
                </div>
            </div>
        `
        )
        .join("");
}

publishedTestsListEl.addEventListener("click", async (e) => {
    const pin = e.target.dataset.copyPin;
    const delId = e.target.dataset.delTest;

    if (pin) {
        await copyTextToClipboard(pin);
        e.target.textContent = "✅ Copied";
        setTimeout(() => (e.target.textContent = "📋 Copy"), 1500);
    } else if (delId) {
        if (!confirm("Delete this published test PIN?")) return;
        await DB.deleteAssessment(delId);
        await refreshCloudData();
    }
});

// ================= 4. 批量导入题库 (CSV / JSON) & 一键去重 =================
openImportBtn.addEventListener("click", () => {
    importFileInput.value = "";
    importJsonPaste.value = "";
    importStatusText.textContent = "";
    importProgressTrack.style.display = "none";
    importProgressFill.style.width = "0%";
    importModal.classList.add("show");
});

closeImportModalBtn.addEventListener("click", () => {
    importModal.classList.remove("show");
});

dlCsvTemplateBtn.addEventListener("click", () => {
    const csvSample = [
        "subject,tag,difficulty,questionText,optA,optB,optC,optD,correctIndex,explanation",
        'Mathematics,"Money",Medium,"A bicycle costs RM 650. Ali gets a 10% discount. How much does he pay?","RM 585","RM 590","RM 600","RM 640",0,"10% of RM 650 is RM 65. RM 650 - RM 65 = RM 585."',
        'Science,"Eclipses",Easy,"Which phase of the Moon occurs during a lunar eclipse?","New Moon","Full Moon","Crescent Moon","Half Moon",1,"A lunar eclipse only happens during the Full Moon phase."'
    ].join("\n");
    downloadTextFile("EduSphere_KSSR_Template.csv", "\uFEFF" + csvSample, "text/csv;charset=utf-8;");
});

dlJsonTemplateBtn.addEventListener("click", () => {
    const jsonSample = [
        {
            subject: "Mathematics",
            tag: "Money",
            difficulty: "Medium",
            questionText: "A bicycle costs RM 650. Ali gets a 10% discount. How much does he pay?",
            options: ["RM 585", "RM 590", "RM 600", "RM 640"],
            correctIndex: 0,
            explanation: "10% of RM 650 is RM 65. RM 650 - RM 65 = RM 585."
        },
        {
            subject: "Science",
            tag: "Eclipses",
            difficulty: "Easy",
            questionText: "Which phase of the Moon occurs during a lunar eclipse?",
            options: ["New Moon", "Full Moon", "Crescent Moon", "Half Moon"],
            correctIndex: 1,
            explanation: "A lunar eclipse only happens during the Full Moon phase."
        }
    ];
    downloadTextFile("EduSphere_KSSR_Template.json", JSON.stringify(jsonSample, null, 2), "application/json");
});

function parseCsvRows(csvText) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;
    const text = csvText.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];
        if (inQuotes) {
            if (ch === '"' && next === '"') {
                cell += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                cell += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ",") {
                row.push(cell.trim());
                cell = "";
            } else if (ch === "\n") {
                row.push(cell.trim());
                if (row.some((c) => c !== "")) rows.push(row);
                row = [];
                cell = "";
            } else {
                cell += ch;
            }
        }
    }
    if (cell.length > 0 || row.length > 0) {
        row.push(cell.trim());
        if (row.some((c) => c !== "")) rows.push(row);
    }
    return rows;
}

function normalizeImportedItems(rawItems, sourceLabel) {
    const validList = [];
    rawItems.forEach((item) => {
        const subject = (item.subject || "").trim() === "Science" ? "Science" : "Mathematics";
        const difficulty = ["Easy", "Medium", "Hard", "KBAT"].includes(item.difficulty) ? item.difficulty : "Medium";
        const questionText = (item.questionText || item.question || "").trim();
        const options = Array.isArray(item.options)
            ? item.options.map((o) => String(o).trim())
            : [item.optA, item.optB, item.optC, item.optD].map((o) => String(o ?? "").trim());

        let correctIndex = parseInt(item.correctIndex, 10);
        if (isNaN(correctIndex)) {
            const letterMap = { A: 0, B: 1, C: 2, D: 3 };
            correctIndex = letterMap[String(item.correctIndex || "").toUpperCase()] ?? 0;
        }
        if (correctIndex < 0 || correctIndex > 3) correctIndex = 0;

        if (!questionText || options.length < 4 || options.slice(0, 4).some((o) => !o)) return;

        const baseTags = ["Standard 6", subject, difficulty];
        if (Array.isArray(item.tags)) {
            item.tags.forEach((t) => t && baseTags.push(String(t).trim()));
        } else if (item.tag) {
            String(item.tag)
                .split("|")
                .forEach((t) => t.trim() && baseTags.push(t.trim()));
        }
        if (sourceLabel === "Teacher Custom") baseTags.push("Teacher Custom");

        const cleanOpts = options.slice(0, 4);
        validList.push({
            subject,
            tags: [...new Set(baseTags)],
            difficulty,
            questionText,
            options: cleanOpts,
            correctIndex,
            correctAnswer: cleanOpts[correctIndex],
            explanation: String(item.explanation || "").trim(),
            status: "approved",
            source: sourceLabel,
            aiVerification: null
        });
    });
    return validList;
}

startImportBtn.addEventListener("click", async () => {
    const file = importFileInput.files?.[0];
    const pasted = importJsonPaste.value.trim();
    const sourceLabel = importSourceSelect.value;

    if (!file && !pasted) {
        alert("⚠️ Please upload a .CSV/.JSON file or paste a JSON array first.");
        return;
    }

    startImportBtn.disabled = true;
    importStatusText.textContent = "Parsing file...";
    importProgressTrack.style.display = "block";
    importProgressFill.style.width = "10%";

    try {
        let rawItems = [];

        if (file) {
            const fileText = await file.text();
            if (file.name.toLowerCase().endsWith(".csv")) {
                const rows = parseCsvRows(fileText);
                if (rows.length < 2) throw new Error("CSV file must include a header row and at least 1 question.");
                const headers = rows[0].map((h) => h.trim());
                for (let r = 1; r < rows.length; r++) {
                    const obj = {};
                    headers.forEach((h, idx) => (obj[h] = rows[r][idx] ?? ""));
                    rawItems.push(obj);
                }
            } else {
                const parsed = JSON.parse(fileText);
                rawItems = Array.isArray(parsed) ? parsed : (parsed.questions || []);
            }
        } else {
            const parsed = JSON.parse(pasted);
            rawItems = Array.isArray(parsed) ? parsed : (parsed.questions || []);
        }

        const readyToSave = normalizeImportedItems(rawItems, sourceLabel);
        if (readyToSave.length === 0) {
            throw new Error("No valid questions found. Please check the template format.");
        }

        importStatusText.textContent = `Uploading ${readyToSave.length} questions to Firebase Firestore...`;
        await DB.batchSaveQuestions(readyToSave, (done, total) => {
            const pct = Math.round((done / total) * 100);
            importProgressFill.style.width = `${pct}%`;
            importStatusText.textContent = `Uploaded ${done} / ${total} questions (${pct}%)...`;
        });

        await refreshCloudData();
        importStatusText.textContent = `✅ Successfully imported ${readyToSave.length} questions!`;
        alert(`✅ Bulk Import Complete! ${readyToSave.length} questions added to your Cloud Question Bank.`);
        importModal.classList.remove("show");
    } catch (err) {
        console.error("Bulk Import Error:", err);
        importStatusText.textContent = "❌ " + err.message;
        alert("❌ Bulk Import Failed:\n" + err.message);
    } finally {
        startImportBtn.disabled = false;
    }
});

// 一键扫描并删除题库中的重复题目（按 科目 + 题干 判重，保留最早入库或已在活跃考卷中的那一份）
dedupeBankBtn.addEventListener("click", async () => {
    const activeProtected = getProtectedQuestionIdSet();
    const seen = new Map();
    const duplicatesToDelete = [];

    const sorted = [...allQuestionsCache].sort(
        (a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)
    );

    sorted.forEach((q) => {
        const key = `${q.subject}::${(q.questionText || "").trim().toLowerCase()}`;
        if (!seen.has(key)) {
            seen.set(key, q);
        } else {
            const existing = seen.get(key);
            if (activeProtected.has(q.id) && !activeProtected.has(existing.id)) {
                duplicatesToDelete.push(existing);
                seen.set(key, q);
            } else {
                duplicatesToDelete.push(q);
            }
        }
    });

    if (duplicatesToDelete.length === 0) {
        alert("✅ No duplicate questions found in your Cloud Question Bank!");
        return;
    }

    if (!confirm(`Found ${duplicatesToDelete.length} duplicate question(s) in Firestore.\nDelete all duplicates and keep 1 clean copy of each?`)) {
        return;
    }

    dedupeBankBtn.disabled = true;
    dedupeBankBtn.textContent = `⏳ Cleaning ${duplicatesToDelete.length}...`;

    try {
        for (const dup of duplicatesToDelete) {
            selectedCartIds.delete(dup.id);
            await DB.deleteQuestion(dup.id);
        }
        await refreshCloudData();
        alert(`🧹 Successfully removed ${duplicatesToDelete.length} duplicate question(s)!`);
    } catch (err) {
        alert("❌ Cleanup failed: " + err.message);
    } finally {
        dedupeBankBtn.disabled = false;
        dedupeBankBtn.textContent = "🧹 Remove Duplicates";
    }
});

seedSampleBtn.addEventListener("click", async () => {
    if (!confirm("Add 8 verified Standard 6 KSSR sample questions (Math & Science) to your Cloud Question Bank?")) return;
    seedSampleBtn.disabled = true;
    seedSampleBtn.textContent = "⏳ Importing...";

    const samples = [
        {
            subject: "Mathematics",
            tags: ["Standard 6", "Mathematics", "Fractions, Decimals & Percentages", "Medium"],
            difficulty: "Medium",
            questionText: "Convert 2 3/5 into a percentage.",
            options: ["235%", "260%", "230%", "250%"],
            correctIndex: 1,
            explanation: "2 3/5 = 13/5. Multiply by 100%: (13/5) × 100% = 260%."
        },
        {
            subject: "Mathematics",
            tags: ["Standard 6", "Mathematics", "Money", "KBAT"],
            difficulty: "KBAT",
            questionText: "A laptop costs RM 2,400. A store offers a 15% discount. What is the price after discount?",
            options: ["RM 2,040", "RM 2,160", "RM 1,980", "RM 2,250"],
            correctIndex: 0,
            explanation: "Discount = 15% × RM 2,400 = RM 360. Final price = RM 2,400 - RM 360 = RM 2,040."
        },
        {
            subject: "Mathematics",
            tags: ["Standard 6", "Mathematics", "Time", "Medium"],
            difficulty: "Medium",
            questionText: "Kuala Lumpur is 8 hours ahead of London. If it is 10:30 a.m. in London, what time is it in Kuala Lumpur?",
            options: ["2:30 a.m.", "6:30 p.m.", "7:30 p.m.", "5:30 p.m."],
            correctIndex: 1,
            explanation: "10:30 a.m. + 8 hours = 18:30, which is 6:30 p.m."
        },
        {
            subject: "Mathematics",
            tags: ["Standard 6", "Mathematics", "Coordinates, Ratio & Proportion", "Easy"],
            difficulty: "Easy",
            questionText: "The ratio of red marbles to blue marbles is 2 : 5. If there are 10 red marbles, how many blue marbles are there?",
            options: ["15", "20", "25", "30"],
            correctIndex: 2,
            explanation: "2 parts = 10, so 1 part = 5. Blue marbles = 5 × 5 = 25."
        },
        {
            subject: "Science",
            tags: ["Standard 6", "Science", "Eclipses", "Easy"],
            difficulty: "Easy",
            questionText: "Which alignment causes an eclipse of the Sun (Solar Eclipse)?",
            options: ["Sun – Earth – Moon", "Sun – Moon – Earth", "Earth – Sun – Moon", "Moon – Sun – Earth"],
            correctIndex: 1,
            explanation: "A solar eclipse happens when the Moon moves directly between the Sun and the Earth."
        },
        {
            subject: "Science",
            tags: ["Standard 6", "Science", "Microorganisms", "Medium"],
            difficulty: "Medium",
            questionText: "Which microorganism is commonly used to make bread dough rise?",
            options: ["Virus", "Yeast (Fungi)", "Protozoa", "Algae"],
            correctIndex: 1,
            explanation: "Yeast breathes and releases carbon dioxide gas, causing the dough to rise."
        },
        {
            subject: "Science",
            tags: ["Standard 6", "Science", "Force", "KBAT"],
            difficulty: "KBAT",
            questionText: "Why do car tyres have deep treads (grooves) on their surface?",
            options: ["To reduce air resistance", "To increase friction and prevent skidding on wet roads", "To make tyres lighter", "To reduce gravitational force"],
            correctIndex: 1,
            explanation: "Treads channel water away and increase friction between tyres and the road surface."
        },
        {
            subject: "Science",
            tags: ["Standard 6", "Science", "Food Preservation", "Medium"],
            difficulty: "Medium",
            questionText: "Salted fish lasts much longer than fresh fish because salt removes which requirement for bacterial growth?",
            options: ["Air", "Water (Moisture)", "Sunlight", "Carbon dioxide"],
            correctIndex: 1,
            explanation: "Salting removes moisture from food so microorganisms cannot grow or reproduce."
        }
    ];

    try {
        const prepared = samples.map((q) => ({
            ...q,
            correctAnswer: q.options[q.correctIndex],
            status: "approved",
            source: "System Bank",
            aiVerification: null
        }));
        await DB.batchSaveQuestions(prepared);
        await refreshCloudData();
        alert("✅ 8 KSSR Standard 6 sample questions added to your Cloud Question Bank!");
    } catch (err) {
        alert("❌ Import failed: " + err.message);
    } finally {
        seedSampleBtn.disabled = false;
        seedSampleBtn.textContent = "⚡ Load 8 Sample Qs";
    }
});

// ================= 5. 视图 2：双 AI 多标签生成 + 审核 + 在线修改 + 混合入篮 + FIFO 自动清理 =================
function renderAiGenTagChips(preselectTags = null) {
    const subject = aiSubjectEl.value;
    const tags = KSSR_TAGS[subject] || [];
    selectedAiGenTags.clear();

    aiTagChipsEl.innerHTML = tags
        .map((t) => `<span class="tag-chip" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`)
        .join("");

    const chips = aiTagChipsEl.querySelectorAll(".tag-chip");
    if (Array.isArray(preselectTags) && preselectTags.length > 0) {
        chips.forEach((chip) => {
            if (preselectTags.includes(chip.dataset.tag)) {
                chip.classList.add("selected");
                selectedAiGenTags.add(chip.dataset.tag);
            }
        });
    } else if (chips[0]) {
        chips[0].classList.add("selected");
        selectedAiGenTags.add(chips[0].dataset.tag);
    }
}

aiTagChipsEl.addEventListener("click", (e) => {
    if (!e.target.classList.contains("tag-chip")) return;
    const tag = e.target.dataset.tag;
    if (selectedAiGenTags.has(tag)) {
        selectedAiGenTags.delete(tag);
        e.target.classList.remove("selected");
    } else {
        selectedAiGenTags.add(tag);
        e.target.classList.add("selected");
    }
});

aiSubjectEl.addEventListener("change", () => renderAiGenTagChips());

aiGenForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const subject = aiSubjectEl.value;
    const grade = aiGradeEl.value;
    const count = Math.min(15, Math.max(1, parseInt(aiCountEl.value, 10) || 1));
    const difficulty = aiDifficultyEl.value;
    const chosenTags = Array.from(selectedAiGenTags);

    if (chosenTags.length === 0) {
        alert("⚠️ Please select at least one KSSR tag for AI generation.");
        return;
    }

    aiGenBtn.disabled = true;
    aiGenBtn.textContent = `⏳ Step 1: Gemini Drafting ${count} Qs → Step 2: Groq Verifying...`;

    try {
        const response = await fetch("../api/ai_handler.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subject, grade, tags: chosenTags, difficulty, count })
        });

        const rawText = await response.text();
        let result;
        try {
            result = JSON.parse(rawText);
        } catch {
            throw new Error(`Server returned non-JSON (HTTP ${response.status}): ${rawText.slice(0, 200)}`);
        }

        if (!response.ok || !result.success) {
            throw new Error(result.error || `Dual-AI API request failed (HTTP ${response.status}).`);
        }

        const drafts = result.questions || [];
        if (drafts.length === 0) {
            throw new Error("No valid questions were returned by the AI pipeline.");
        }

        for (const draft of drafts) {
            const newId = await DB.saveQuestion({
                subject,
                tags: [grade, subject, draft.tag, draft.difficulty],
                difficulty: draft.difficulty,
                questionText: draft.questionText,
                options: draft.options,
                correctIndex: draft.correctIndex,
                correctAnswer: draft.options[draft.correctIndex],
                explanation: draft.explanation,
                status: "pending",
                source: "Dual-AI",
                aiVerification: {
                    generator: result.generatorModel || "Gemini 3.5 Flash-Lite",
                    reviewer: result.reviewerModel || "GPT-OSS 120B (Groq)",
                    status: draft.verificationStatus || "Verified",
                    notes: draft.reviewNotes
                }
            });
            selectedAiReviewIds.add(newId);
            uncheckedAiReviewIds.delete(newId);
        }

        if (!aiTestTitleEl.value.trim()) {
            aiTestTitleEl.value = `${grade} ${subject} AI Test (${chosenTags.slice(0, 2).join(", ")})`;
        }

        await refreshCloudData();
        const timingNote = result.timings
            ? `\n(Gemini: ${result.timings.geminiSec}s | Groq: ${result.timings.groqSec}s)`
            : "";
        alert(`🤖 ${drafts.length} Dual-AI questions generated & verified!${timingNote}\nReview, edit, or uncheck unwanted ones on the right.`);
    } catch (err) {
        console.error("Dual-AI Gen Error:", err);
        alert("❌ Dual-AI Generation Failed:\n" + err.message);
    } finally {
        aiGenBtn.disabled = false;
        aiGenBtn.textContent = "✨ Generate & Cross-Verify";
    }
});

function renderReviewQueue(pendingQuestions) {
    pendingCountEl.textContent = `${pendingQuestions.length} Pending`;

    if (pendingQuestions.length > 0) {
        pendingBadgeEl.style.display = "inline-block";
        pendingBadgeEl.textContent = pendingQuestions.length;
    } else {
        pendingBadgeEl.style.display = "none";
    }

    updateAiSelectedCounter(pendingQuestions);

    if (pendingQuestions.length === 0) {
        reviewListEl.innerHTML = '<div class="empty-bank">No pending AI drafts. Select tags & quantity on the left to generate questions!</div>';
        return;
    }

    reviewListEl.innerHTML = pendingQuestions
        .map((q, idx) => {
            const isChecked = selectedAiReviewIds.has(q.id);
            const tagBadges = (q.tags || []).map((t) => `<span class="q-tag">${escapeHtml(t)}</span>`).join("");
            const optsHtml = (q.options || [])
                .map((opt, i) => {
                    const letter = ["A", "B", "C", "D"][i];
                    const isCorrect = i === q.correctIndex;
                    return `<li class="${isCorrect ? "correct-opt" : ""}">${letter}. ${escapeHtml(opt)} ${isCorrect ? "✓" : ""}</li>`;
                })
                .join("");
            const aiInfo = q.aiVerification || {};
            const statusText = aiInfo.status ? ` [${escapeHtml(aiInfo.status)}]` : "";

            return `
                <div class="q-item pending-card ${isChecked ? "selected-card" : ""}" data-card-id="${q.id}">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:600; font-size:0.86rem; color:#1e1b4b;">
                            <input type="checkbox" class="ai-keep-checkbox" data-id="${q.id}" ${isChecked ? "checked" : ""} style="width:17px; height:17px; accent-color:#16a34a; cursor:pointer;">
                            Keep Q#${idx + 1} in Test
                        </label>
                        <div style="display:flex; gap:6px;">
                            <button type="button" class="btn-sm btn-edit" data-action="toggle-edit" data-id="${q.id}">✏️ Edit</button>
                            <button type="button" class="btn-sm btn-danger" data-action="discard-pending" data-id="${q.id}">✕ Remove</button>
                        </div>
                    </div>

                    <div class="q-tags">${tagBadges}</div>
                    <div class="q-text">${escapeHtml(q.questionText)}</div>
                    <ul class="q-options">${optsHtml}</ul>
                    <div class="q-explanation">💡 <strong>Explanation:</strong> ${escapeHtml(q.explanation || "")}</div>

                    <div class="ai-report-box">
                        <strong>✨ Generator:</strong> ${escapeHtml(aiInfo.generator || "Gemini 3.5 Flash-Lite")} &nbsp;|&nbsp;
                        <strong>🔍 Reviewer (${escapeHtml(aiInfo.reviewer || "GPT-OSS 120B (Groq)")}${statusText}):</strong> ${escapeHtml(aiInfo.notes || "Verified.")}
                    </div>

                    <div class="edit-box" id="edit-box-${q.id}">
                        <div class="form-group">
                            <label class="form-label">Edit Question Text</label>
                            <textarea class="form-control edit-q-text">${escapeHtml(q.questionText)}</textarea>
                        </div>
                        <div class="row-2">
                            <div class="form-group"><label class="form-label">Option A</label><input type="text" class="form-control edit-opt-0" value="${escapeHtml(q.options?.[0] || "")}"></div>
                            <div class="form-group"><label class="form-label">Option B</label><input type="text" class="form-control edit-opt-1" value="${escapeHtml(q.options?.[1] || "")}"></div>
                            <div class="form-group"><label class="form-label">Option C</label><input type="text" class="form-control edit-opt-2" value="${escapeHtml(q.options?.[2] || "")}"></div>
                            <div class="form-group"><label class="form-label">Option D</label><input type="text" class="form-control edit-opt-3" value="${escapeHtml(q.options?.[3] || "")}"></div>
                        </div>
                        <div class="row-2">
                            <div class="form-group">
                                <label class="form-label">Correct Answer</label>
                                <select class="form-control edit-correct">
                                    <option value="0" ${q.correctIndex === 0 ? "selected" : ""}>Option A</option>
                                    <option value="1" ${q.correctIndex === 1 ? "selected" : ""}>Option B</option>
                                    <option value="2" ${q.correctIndex === 2 ? "selected" : ""}>Option C</option>
                                    <option value="3" ${q.correctIndex === 3 ? "selected" : ""}>Option D</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Explanation</label>
                                <input type="text" class="form-control edit-explanation" value="${escapeHtml(q.explanation || "")}">
                            </div>
                        </div>
                        <div style="display:flex; gap:8px;">
                            <button type="button" class="btn-sm btn-add-q in-cart" data-action="save-edit" data-id="${q.id}">💾 Save Changes</button>
                            <button type="button" class="btn-sm btn-outline" data-action="toggle-edit" data-id="${q.id}">Cancel</button>
                        </div>
                    </div>
                </div>
            `;
        })
        .join("");
}

function updateAiSelectedCounter(pendingList) {
    const count = pendingList.filter((q) => selectedAiReviewIds.has(q.id)).length;
    aiSelectedCountEl.textContent = count;
}

reviewListEl.addEventListener("change", (e) => {
    if (!e.target.classList.contains("ai-keep-checkbox")) return;
    const id = e.target.dataset.id;
    const card = reviewListEl.querySelector(`[data-card-id="${id}"]`);
    if (e.target.checked) {
        selectedAiReviewIds.add(id);
        uncheckedAiReviewIds.delete(id);
        card?.classList.add("selected-card");
    } else {
        selectedAiReviewIds.delete(id);
        uncheckedAiReviewIds.add(id);
        card?.classList.remove("selected-card");
    }
    const pendingList = allQuestionsCache.filter((q) => q.status === "pending");
    updateAiSelectedCounter(pendingList);
});

reviewListEl.addEventListener("click", async (e) => {
    const action = e.target.dataset.action;
    const id = e.target.dataset.id;
    if (!action || !id) return;

    if (action === "toggle-edit") {
        document.getElementById(`edit-box-${id}`)?.classList.toggle("open");
    } else if (action === "save-edit") {
        const box = document.getElementById(`edit-box-${id}`);
        const newText = box.querySelector(".edit-q-text").value.trim();
        const newOpts = [
            box.querySelector(".edit-opt-0").value.trim(),
            box.querySelector(".edit-opt-1").value.trim(),
            box.querySelector(".edit-opt-2").value.trim(),
            box.querySelector(".edit-opt-3").value.trim()
        ];
        const newCorrectIdx = parseInt(box.querySelector(".edit-correct").value, 10);
        const newExp = box.querySelector(".edit-explanation").value.trim();

        e.target.disabled = true;
        e.target.textContent = "Saving...";
        try {
            await DB.updateQuestion(id, {
                questionText: newText,
                options: newOpts,
                correctIndex: newCorrectIdx,
                correctAnswer: newOpts[newCorrectIdx],
                explanation: newExp
            });
            await refreshCloudData();
        } catch (err) {
            alert("Update failed: " + err.message);
        }
    } else if (action === "discard-pending") {
        selectedAiReviewIds.delete(id);
        uncheckedAiReviewIds.delete(id);
        await DB.updateQuestionStatus(id, "rejected");
        await refreshCloudData();
    }
});

// 方式 A：审核通过勾选的 AI 题 + 直接塞进右侧“当前组卷篮”，方便与 System Bank / Custom 混搭发同一个 PIN
approveAddCartBtn.addEventListener("click", async () => {
    const pendingChosen = allQuestionsCache.filter(
        (q) => q.status === "pending" && selectedAiReviewIds.has(q.id)
    );
    if (pendingChosen.length === 0) {
        alert("⚠️ Please check at least 1 AI question to approve & add to your Test Paper.");
        return;
    }

    approveAddCartBtn.disabled = true;
    approveAddCartBtn.textContent = "Approving & Adding...";

    try {
        const newlyApprovedIds = [];
        for (const q of pendingChosen) {
            await DB.updateQuestionStatus(q.id, "approved");
            selectedCartIds.add(q.id);
            newlyApprovedIds.push(q.id);
            selectedAiReviewIds.delete(q.id);
            uncheckedAiReviewIds.delete(q.id);
        }

        const affectedTags = extractKssrTopicTags(pendingChosen);
        const fifoResult = await DB.enforceTagQuota(
            affectedTags,
            tagQuotaLimit,
            getProtectedQuestionIdSet([...newlyApprovedIds, ...selectedCartIds])
        );

        if (!testTitleInput.value.trim() && aiTestTitleEl.value.trim()) {
            testTitleInput.value = aiTestTitleEl.value.trim();
        }
        aiTestTitleEl.value = "";

        await refreshCloudData();
        switchActiveView("view-bank");

        let msg = `✅ ${pendingChosen.length} Dual-AI question(s) approved and added to your Selected Test Paper!\nYou can now mix in System Bank or Teacher Custom questions and generate 1 unified PIN.`;
        if (fifoResult.evictedCount > 0) {
            const summary = fifoResult.details
                .map((d) => `• ${d.tag}: auto-removed ${d.removed} oldest Dual-AI Q(s) (Limit: ${d.limit})`)
                .join("\n");
            msg += `\n\n♻️ Protected FIFO Quota Triggered:\n${summary}`;
        }
        alert(msg);
    } catch (err) {
        alert("❌ Failed: " + err.message);
    } finally {
        approveAddCartBtn.disabled = false;
        approveAddCartBtn.textContent = "➕ Approve & Add to Test Paper";
    }
});

// 独立发布：审核通过并立刻生成 PIN
approveAndPublishBtn.addEventListener("click", async () => {
    const pendingChosen = allQuestionsCache.filter(
        (q) => q.status === "pending" && selectedAiReviewIds.has(q.id)
    );
    if (pendingChosen.length === 0) {
        alert("⚠️ Please check at least 1 AI question to approve & publish.");
        return;
    }

    approveAndPublishBtn.disabled = true;
    approveAndPublishBtn.textContent = "Approving, Checking Quota & Publishing...";

    try {
        for (const q of pendingChosen) {
            await DB.updateQuestionStatus(q.id, "approved");
        }

        const title = aiTestTitleEl.value.trim() || `Standard 6 AI Test (${pendingChosen.length} Qs)`;
        await publishAssessmentWithPin(title, pendingChosen, approveAndPublishBtn);

        const newlyApprovedIds = pendingChosen.map((q) => q.id);
        const affectedTags = extractKssrTopicTags(pendingChosen);
        const fifoResult = await DB.enforceTagQuota(
            affectedTags,
            tagQuotaLimit,
            getProtectedQuestionIdSet(newlyApprovedIds)
        );

        pendingChosen.forEach((q) => {
            selectedAiReviewIds.delete(q.id);
            uncheckedAiReviewIds.delete(q.id);
        });
        aiTestTitleEl.value = "";
        await refreshCloudData();

        if (fifoResult.evictedCount > 0) {
            const summary = fifoResult.details
                .map((d) => `• ${d.tag}: auto-removed ${d.removed} oldest Dual-AI Q(s) (Limit: ${d.limit})`)
                .join("\n");
            alert(`♻️ Protected FIFO Quota Triggered:\n${summary}`);
        }
    } catch (err) {
        alert("Failed: " + err.message);
        approveAndPublishBtn.disabled = false;
        approveAndPublishBtn.textContent = "🎯 Approve & Generate PIN Now";
    }
});

// 仅审核入库
approveOnlyBtn.addEventListener("click", async () => {
    const pendingChosen = allQuestionsCache.filter(
        (q) => q.status === "pending" && selectedAiReviewIds.has(q.id)
    );
    if (pendingChosen.length === 0) {
        alert("⚠️ Please check at least 1 question to approve.");
        return;
    }
    approveOnlyBtn.disabled = true;
    try {
        for (const q of pendingChosen) {
            await DB.updateQuestionStatus(q.id, "approved");
            selectedAiReviewIds.delete(q.id);
            uncheckedAiReviewIds.delete(q.id);
        }

        const newlyApprovedIds = pendingChosen.map((q) => q.id);
        const affectedTags = extractKssrTopicTags(pendingChosen);
        const fifoResult = await DB.enforceTagQuota(
            affectedTags,
            tagQuotaLimit,
            getProtectedQuestionIdSet(newlyApprovedIds)
        );

        await refreshCloudData();

        let msg = `✅ ${pendingChosen.length} questions approved and saved to your Cloud Question Bank!`;
        if (fifoResult.evictedCount > 0) {
            const summary = fifoResult.details
                .map((d) => `• ${d.tag}: auto-removed ${d.removed} oldest Dual-AI Q(s) (Limit: ${d.limit})`)
                .join("\n");
            msg += `\n\n♻️ Protected FIFO Quota Triggered:\n${summary}`;
        }
        alert(msg);
    } finally {
        approveOnlyBtn.disabled = false;
    }
});

// ================= 6. 视图 3：老师自创题目 =================
function renderManualTagChips() {
    const subject = qSubjectEl.value;
    const tags = KSSR_TAGS[subject] || [];
    selectedManualTags.clear();

    manualTagChipsEl.innerHTML = tags
        .map((t) => `<span class="tag-chip" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`)
        .join("");

    const first = manualTagChipsEl.querySelector(".tag-chip");
    if (first) {
        first.classList.add("selected");
        selectedManualTags.add(first.dataset.tag);
    }
}

manualTagChipsEl.addEventListener("click", (e) => {
    if (!e.target.classList.contains("tag-chip")) return;
    const tag = e.target.dataset.tag;
    if (selectedManualTags.has(tag)) {
        selectedManualTags.delete(tag);
        e.target.classList.remove("selected");
    } else {
        selectedManualTags.add(tag);
        e.target.classList.add("selected");
    }
});

qSubjectEl.addEventListener("change", renderManualTagChips);

createForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const subject = qSubjectEl.value;
    const difficulty = document.getElementById("q-difficulty").value;
    const customTag = document.getElementById("q-custom-tag").value.trim();
    const questionText = document.getElementById("q-text").value.trim();
    const options = [
        document.getElementById("opt-A").value.trim(),
        document.getElementById("opt-B").value.trim(),
        document.getElementById("opt-C").value.trim(),
        document.getElementById("opt-D").value.trim()
    ];
    const correctIndex = parseInt(document.getElementById("q-correct").value, 10);
    const explanation = document.getElementById("q-explanation").value.trim();

    if (selectedManualTags.size === 0 && !customTag) {
        alert("⚠️ Please select at least one KSSR topic tag.");
        return;
    }

    const tagsArray = [
        "Standard 6",
        subject,
        ...Array.from(selectedManualTags),
        difficulty,
        "Teacher Custom"
    ];
    if (customTag) tagsArray.push(customTag);

    saveQBtn.disabled = true;
    saveQBtn.textContent = "Saving to Firestore...";

    try {
        await DB.saveQuestion({
            subject,
            tags: [...new Set(tagsArray)],
            difficulty,
            questionText,
            options,
            correctIndex,
            correctAnswer: options[correctIndex],
            explanation,
            status: "approved",
            source: "Teacher Custom",
            aiVerification: null
        });

        createForm.reset();
        renderManualTagChips();
        await refreshCloudData();
        alert('✅ Custom question saved into Cloud Question Bank with tag "Teacher Custom"!');
    } catch (err) {
        alert("❌ Save failed: " + err.message);
    } finally {
        saveQBtn.disabled = false;
        saveQBtn.textContent = "💾 Save Custom Question to Cloud Bank";
    }
});

// ================= 7. 视图 4：班级平均雷达图 + 点击学生查看个人雷达图 & 手动评定 PBD =================
function populateAnalyticsTestFilter() {
    const subject = analyticsSubjectFilterEl.value;
    const prev = analyticsTestFilterEl.value || "ALL";

    const testMap = new Map();
    allResultsCache
        .filter((r) => r.subject === subject)
        .forEach((r) => {
            const key = r.pin || r.testTitle || "General";
            if (!testMap.has(key)) {
                testMap.set(key, `${r.testTitle || "Assessment"} (PIN: ${r.pin || "N/A"})`);
            }
        });

    analyticsTestFilterEl.innerHTML =
        `<option value="ALL">All ${escapeHtml(subject)} Assessments</option>` +
        Array.from(testMap.entries())
            .map(([pin, label]) => `<option value="${escapeHtml(pin)}">${escapeHtml(label)}</option>`)
            .join("");

    if (prev !== "ALL" && testMap.has(prev)) {
        analyticsTestFilterEl.value = prev;
    }
}

analyticsSubjectFilterEl.addEventListener("change", () => {
    populateAnalyticsTestFilter();
    renderClassAnalytics();
});
analyticsTestFilterEl.addEventListener("change", renderClassAnalytics);

radarModeWeak5Btn.addEventListener("click", () => {
    radarViewMode = "weakest5";
    radarModeWeak5Btn.classList.add("active");
    radarModeAllBtn.classList.remove("active");
    renderClassAnalytics();
});

radarModeAllBtn.addEventListener("click", () => {
    radarViewMode = "all";
    radarModeAllBtn.classList.add("active");
    radarModeWeak5Btn.classList.remove("active");
    renderClassAnalytics();
});

function renderClassAnalytics() {
    const subject = analyticsSubjectFilterEl.value;
    const selectedTestKey = analyticsTestFilterEl.value;

    const filtered = allResultsCache.filter((r) => {
        if (r.subject !== subject) return false;
        if (selectedTestKey !== "ALL" && (r.pin || r.testTitle || "General") !== selectedTestKey) return false;
        return true;
    });

    const gradedCount = filtered.filter((r) => Boolean(r.teacherPbd)).length;
    kpiSubmissionsEl.textContent = filtered.length;
    kpiGradedProgressEl.textContent = `${gradedCount} / ${filtered.length} graded by teacher`;
    tableCountPillEl.textContent = `${filtered.length} Records`;

    if (filtered.length === 0) {
        currentClassAvgByTag = {};
        kpiAvgScoreEl.textContent = "--%";
        kpiAvgPbdEl.textContent = "Waiting for results";
        kpiWeakestTagEl.textContent = "--";
        kpiWeakestPctEl.textContent = "Lowest class accuracy";
        kpiStrongestTagEl.textContent = "--";
        kpiStrongestPctEl.textContent = "Highest class accuracy";

        if (radarChartInstance) {
            radarChartInstance.destroy();
            radarChartInstance = null;
        }
        radarCanvasEl.style.display = "none";
        radarEmptyMsgEl.style.display = "block";
        tagMasteryListEl.innerHTML = '<div class="empty-bank">No diagnostic data for this subject yet.</div>';
        studentResultsTbodyEl.innerHTML = '<tr><td colspan="7" class="empty-bank">No student submissions found.</td></tr>';
        return;
    }

    const avgPct = Math.round(
        filtered.reduce((sum, r) => sum + (Number(r.percentage) || 0), 0) / filtered.length
    );
    const avgRef = getSuggestedPbd(avgPct);
    kpiAvgScoreEl.textContent = `${avgPct}%`;
    kpiAvgPbdEl.textContent = `Class Avg Ref: ${avgRef.tp} (${avgRef.label})`;

    const subjectTags = KSSR_TAGS[subject] || [];
    const tagAgg = {};
    subjectTags.forEach((t) => {
        tagAgg[t] = { correct: 0, total: 0 };
    });

    filtered.forEach((r) => {
        const ts = r.tagScores || {};
        Object.entries(ts).forEach(([tag, stat]) => {
            if (!tagAgg[tag]) tagAgg[tag] = { correct: 0, total: 0 };
            tagAgg[tag].correct += Number(stat.correct) || 0;
            tagAgg[tag].total += Number(stat.total) || 0;
        });
    });

    const testedStats = Object.entries(tagAgg)
        .filter(([, s]) => s.total > 0)
        .map(([tag, s]) => ({
            tag,
            correct: s.correct,
            total: s.total,
            pct: Math.round((s.correct / s.total) * 100)
        }));

    currentClassAvgByTag = {};
    testedStats.forEach((item) => {
        currentClassAvgByTag[item.tag] = item.pct;
    });

    if (testedStats.length > 0) {
        const sortedAsc = [...testedStats].sort((a, b) => a.pct - b.pct);
        const weakest = sortedAsc[0];
        const strongest = sortedAsc[sortedAsc.length - 1];

        kpiWeakestTagEl.textContent = weakest.tag;
        kpiWeakestPctEl.textContent = `${weakest.pct}% accuracy (${weakest.correct}/${weakest.total})`;
        kpiStrongestTagEl.textContent = strongest.tag;
        kpiStrongestPctEl.textContent = `${strongest.pct}% accuracy (${strongest.correct}/${strongest.total})`;

        let chartStats = testedStats;
        if (radarViewMode === "weakest5" && testedStats.length > 5) {
            chartStats = sortedAsc.slice(0, 5);
            radarModeHintEl.textContent = `Showing the 5 weakest out of ${testedStats.length} tested tags (Class Avg)`;
        } else {
            radarModeHintEl.textContent = `Showing all ${testedStats.length} tested tags (Combined Class Avg)`;
        }

        radarCanvasEl.style.display = "block";
        radarEmptyMsgEl.style.display = "none";

        const radarLabels = chartStats.map((x) =>
            x.tag.length > 20 ? x.tag.slice(0, 18) + "…" : x.tag
        );
        const radarValues = chartStats.map((x) => x.pct);

        if (radarChartInstance) radarChartInstance.destroy();
        radarChartInstance = new Chart(radarCanvasEl.getContext("2d"), {
            type: "radar",
            data: {
                labels: radarLabels,
                datasets: [
                    {
                        label: `Class Avg (%)`,
                        data: radarValues,
                        backgroundColor: "rgba(147, 51, 234, 0.22)",
                        borderColor: "#9333ea",
                        borderWidth: 2.5,
                        pointBackgroundColor: radarValues.map((v) =>
                            v < 65 ? "#ef4444" : v >= 80 ? "#16a34a" : "#f59e0b"
                        ),
                        pointBorderColor: "#fff",
                        pointRadius: 5,
                        pointHoverRadius: 7
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        min: 0,
                        max: 100,
                        ticks: { stepSize: 20, backdropColor: "transparent", font: { size: 11 } },
                        pointLabels: { font: { size: 11, weight: "600" }, color: "#1e1b4b" },
                        grid: { color: "rgba(148, 163, 184, 0.25)" }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${chartStats[ctx.dataIndex].tag}: ${ctx.raw}%`
                        }
                    }
                }
            }
        });

        tagMasteryListEl.innerHTML = sortedAsc
            .map((item) => {
                const isWeak = item.pct < 65;
                const barColor = isWeak ? "#ef4444" : item.pct >= 80 ? "#16a34a" : "#f59e0b";
                return `
                    <div class="mastery-row ${isWeak ? "weak-row" : ""}">
                        <div class="mastery-top">
                            <span style="color:#1e1b4b;">${isWeak ? "⚠️ " : ""}${escapeHtml(item.tag)}</span>
                            <span style="color:${barColor}; font-weight:700;">${item.pct}% (${item.correct}/${item.total})</span>
                        </div>
                        <div class="bar-track">
                            <div class="bar-fill" style="width:${item.pct}%; background:${barColor};"></div>
                        </div>
                    </div>
                `;
            })
            .join("");
    }

    studentResultsTbodyEl.innerHTML = filtered
        .map((r) => {
            const pct = Math.round(Number(r.percentage) || 0);
            const refPbd = getSuggestedPbd(pct);

            let weakestStudentTag = "—";
            const entries = Object.entries(r.tagScores || {}).filter(([, s]) => (s.total || 0) > 0);
            if (entries.length > 0) {
                entries.sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total);
                const wPct = Math.round((entries[0][1].correct / entries[0][1].total) * 100);
                weakestStudentTag = `${entries[0][0]} (${wPct}%)`;
            }

            const pbdCellHtml = r.teacherPbd
                ? `<span class="pbd-pill pbd-graded">✅ ${escapeHtml(r.teacherPbd)} • ${escapeHtml(getPbdLabel(r.teacherPbd))}</span>`
                : `<span class="pbd-pill pbd-pending">⏳ Pending (Ref: ${refPbd.tp})</span>`;

            const dateStr = r.completedAt?.seconds
                ? new Date(r.completedAt.seconds * 1000).toLocaleString("en-MY", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit"
                  })
                : "Just now";

            return `
                <tr class="clickable-row" data-result-id="${r.id}">
                    <td>
                        <strong>${escapeHtml(r.studentName || "Student")}</strong>
                        ${r.isDemo ? ' <span class="q-tag" style="font-size:0.65rem;">Demo</span>' : ""}
                    </td>
                    <td>${escapeHtml(r.testTitle || "Diagnostic Test")} <span style="color:#6d28d9; font-family:monospace; font-weight:600;">#${escapeHtml(r.pin || "—")}</span></td>
                    <td><strong>${r.score ?? 0}/${r.totalQuestions ?? 0}</strong> (${pct}%)</td>
                    <td style="color:#b91c1c; font-weight:500;">${escapeHtml(weakestStudentTag)}</td>
                    <td>${pbdCellHtml}</td>
                    <td style="color:#64748b; font-size:0.78rem;">${escapeHtml(dateStr)}</td>
                    <td>
                        <button type="button" class="btn-sm btn-add-q" data-inspect-id="${r.id}">
                            ${r.teacherPbd ? "✏️ Edit Grade" : "🔍 Inspect & Grade"}
                        </button>
                    </td>
                </tr>
            `;
        })
        .join("");
}

studentResultsTbodyEl.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-inspect-id]");
    const row = e.target.closest("tr[data-result-id]");
    const resultId = btn?.dataset.inspectId || row?.dataset.resultId;
    if (!resultId) return;
    openStudentEvalModal(resultId);
});

function openStudentEvalModal(resultId) {
    const rec = allResultsCache.find((r) => r.id === resultId);
    if (!rec) return;

    activeEvalResultId = resultId;
    const pct = Math.round(Number(rec.percentage) || 0);
    const refPbd = getSuggestedPbd(pct);

    evalStudentNameEl.textContent = `👤 ${rec.studentName || "Student"}`;
    evalTestMetaEl.textContent = `${rec.testTitle || "Diagnostic Test"} • ${rec.subject} • PIN #${rec.pin || "N/A"}`;
    evalScoreBadgeEl.textContent = `${rec.score ?? 0}/${rec.totalQuestions ?? 0} (${pct}%)`;
    evalRefPbdEl.textContent = `System Reference: ${refPbd.tp} (${refPbd.label})`;

    selectedEvalTp = rec.teacherPbd || refPbd.tp;
    updateTpButtonSelection();
    evalTeacherRemarkEl.value = rec.teacherRemark || "";

    const tagEntries = Object.entries(rec.tagScores || {})
        .filter(([, stat]) => (Number(stat.total) || 0) > 0)
        .map(([tag, stat]) => {
            const c = Number(stat.correct) || 0;
            const t = Number(stat.total) || 0;
            return { tag, correct: c, total: t, pct: Math.round((c / t) * 100) };
        });

    const sortedWeakFirst = [...tagEntries].sort((a, b) => a.pct - b.pct);

    evalTagListEl.innerHTML = sortedWeakFirst.length
        ? sortedWeakFirst
              .map((item) => {
                  const isWeak = item.pct < 65;
                  const barColor = isWeak ? "#ef4444" : item.pct >= 80 ? "#16a34a" : "#f59e0b";
                  const clsAvg = currentClassAvgByTag[item.tag];
                  const clsHint = clsAvg !== undefined ? ` • Class Avg ${clsAvg}%` : "";
                  return `
                      <div class="mastery-row ${isWeak ? "weak-row" : ""}" style="padding:8px 12px;">
                          <div class="mastery-top" style="margin-bottom:4px; font-size:0.8rem;">
                              <span>${isWeak ? "⚠️ " : ""}${escapeHtml(item.tag)}</span>
                              <span style="color:${barColor}; font-weight:700;">${item.pct}% (${item.correct}/${item.total})<span style="color:#64748b; font-weight:500;">${clsHint}</span></span>
                          </div>
                          <div class="bar-track" style="height:6px;">
                              <div class="bar-fill" style="width:${item.pct}%; background:${barColor};"></div>
                          </div>
                      </div>
                  `;
              })
              .join("")
        : '<div class="empty-bank" style="padding:14px;">No per-tag breakdown recorded.</div>';

    studentEvalModal.classList.add("show");

    const labels = tagEntries.map((x) => (x.tag.length > 18 ? x.tag.slice(0, 16) + "…" : x.tag));
    const studentVals = tagEntries.map((x) => x.pct);
    const classAvgVals = tagEntries.map((x) => currentClassAvgByTag[x.tag] ?? 0);

    if (studentRadarChartInstance) studentRadarChartInstance.destroy();
    studentRadarChartInstance = new Chart(studentRadarCanvasEl.getContext("2d"), {
        type: "radar",
        data: {
            labels,
            datasets: [
                {
                    label: rec.studentName || "Student",
                    data: studentVals,
                    backgroundColor: "rgba(147, 51, 234, 0.24)",
                    borderColor: "#9333ea",
                    borderWidth: 2.5,
                    pointBackgroundColor: studentVals.map((v) =>
                        v < 65 ? "#ef4444" : v >= 80 ? "#16a34a" : "#f59e0b"
                    ),
                    pointBorderColor: "#fff",
                    pointRadius: 5
                },
                {
                    label: "Class Average",
                    data: classAvgVals,
                    backgroundColor: "rgba(100, 116, 139, 0.06)",
                    borderColor: "#94a3b8",
                    borderWidth: 2,
                    borderDash: [5, 4],
                    pointRadius: 3,
                    pointBackgroundColor: "#94a3b8"
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    min: 0,
                    max: 100,
                    ticks: { stepSize: 20, backdropColor: "transparent", font: { size: 10 } },
                    pointLabels: { font: { size: 10, weight: "600" }, color: "#1e1b4b" }
                }
            },
            plugins: {
                legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: (ctx) => `${ctx.dataset.label} — ${tagEntries[ctx.dataIndex].tag}: ${ctx.raw}%`
                    }
                }
            }
        }
    });
}

function updateTpButtonSelection() {
    evalTpSelectorEl.querySelectorAll(".tp-btn").forEach((btn) => {
        btn.classList.toggle("selected", btn.dataset.tp === selectedEvalTp);
    });
}

evalTpSelectorEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".tp-btn");
    if (!btn) return;
    selectedEvalTp = btn.dataset.tp;
    updateTpButtonSelection();
});

closeEvalModalBtn.addEventListener("click", () => {
    studentEvalModal.classList.remove("show");
    activeEvalResultId = null;
});

savePbdGradeBtn.addEventListener("click", async () => {
    if (!activeEvalResultId || !selectedEvalTp) {
        alert("⚠️ Please select a PBD band (TP 1 – TP 6) first.");
        return;
    }

    savePbdGradeBtn.disabled = true;
    savePbdGradeBtn.textContent = "Saving PBD Grade...";

    try {
        await DB.updateResult(activeEvalResultId, {
            teacherPbd: selectedEvalTp,
            teacherRemark: evalTeacherRemarkEl.value.trim(),
            gradedBy: currentUserProfile?.name || "Teacher"
        });

        studentEvalModal.classList.remove("show");
        activeEvalResultId = null;
        await refreshCloudData();
        alert(`✅ Official PBD Grade (${selectedEvalTp}) saved to Firestore!`);
    } catch (err) {
        console.error("Save PBD Error:", err);
        alert("❌ Failed to save PBD grade: " + err.message);
    } finally {
        savePbdGradeBtn.disabled = false;
        savePbdGradeBtn.textContent = "💾 Confirm & Save PBD Grade to Firestore";
    }
});

seedDemoResultsBtn.addEventListener("click", async () => {
    if (!confirm("Add 7 realistic Standard 6 demo student results (covering all 8 Math & 8 Science tags) to Firestore?")) return;
    seedDemoResultsBtn.disabled = true;
    seedDemoResultsBtn.textContent = "⏳ Loading...";

    const demoRecords = [
        {
            studentId: "demo_s1",
            studentName: "Ahmad Faiz",
            pin: "482910",
            testTitle: "Standard 6 Math Full-Syllabus Paper",
            subject: "Mathematics",
            score: 18,
            totalQuestions: 24,
            percentage: 75,
            isDemo: true,
            tagScores: {
                "Whole Numbers & Operations": { correct: 3, total: 3 },
                "Fractions, Decimals & Percentages": { correct: 2, total: 3 },
                "Money": { correct: 3, total: 3 },
                "Time": { correct: 1, total: 3 },
                "Measurement": { correct: 2, total: 3 },
                "Space": { correct: 2, total: 3 },
                "Coordinates, Ratio & Proportion": { correct: 3, total: 3 },
                "Data Handling & Likelihood": { correct: 2, total: 3 }
            }
        },
        {
            studentId: "demo_s2",
            studentName: "Nur Aisyah",
            pin: "482910",
            testTitle: "Standard 6 Math Full-Syllabus Paper",
            subject: "Mathematics",
            score: 22,
            totalQuestions: 24,
            percentage: 92,
            isDemo: true,
            tagScores: {
                "Whole Numbers & Operations": { correct: 3, total: 3 },
                "Fractions, Decimals & Percentages": { correct: 3, total: 3 },
                "Money": { correct: 3, total: 3 },
                "Time": { correct: 2, total: 3 },
                "Measurement": { correct: 3, total: 3 },
                "Space": { correct: 2, total: 3 },
                "Coordinates, Ratio & Proportion": { correct: 3, total: 3 },
                "Data Handling & Likelihood": { correct: 3, total: 3 }
            }
        },
        {
            studentId: "demo_s3",
            studentName: "Tan Wei Ming",
            pin: "482910",
            testTitle: "Standard 6 Math Full-Syllabus Paper",
            subject: "Mathematics",
            score: 12,
            totalQuestions: 24,
            percentage: 50,
            isDemo: true,
            tagScores: {
                "Whole Numbers & Operations": { correct: 3, total: 3 },
                "Fractions, Decimals & Percentages": { correct: 1, total: 3 },
                "Money": { correct: 2, total: 3 },
                "Time": { correct: 0, total: 3 },
                "Measurement": { correct: 1, total: 3 },
                "Space": { correct: 1, total: 3 },
                "Coordinates, Ratio & Proportion": { correct: 2, total: 3 },
                "Data Handling & Likelihood": { correct: 2, total: 3 }
            }
        },
        {
            studentId: "demo_s4",
            studentName: "Kavitha Nair",
            pin: "482910",
            testTitle: "Standard 6 Math Full-Syllabus Paper",
            subject: "Mathematics",
            score: 16,
            totalQuestions: 24,
            percentage: 67,
            isDemo: true,
            tagScores: {
                "Whole Numbers & Operations": { correct: 3, total: 3 },
                "Fractions, Decimals & Percentages": { correct: 1, total: 3 },
                "Money": { correct: 3, total: 3 },
                "Time": { correct: 1, total: 3 },
                "Measurement": { correct: 2, total: 3 },
                "Space": { correct: 1, total: 3 },
                "Coordinates, Ratio & Proportion": { correct: 3, total: 3 },
                "Data Handling & Likelihood": { correct: 2, total: 3 }
            }
        },
        {
            studentId: "demo_s5",
            studentName: "Daniel Lim",
            pin: "719305",
            testTitle: "Standard 6 Science Screening",
            subject: "Science",
            score: 17,
            totalQuestions: 24,
            percentage: 71,
            isDemo: true,
            tagScores: {
                "Microorganisms": { correct: 3, total: 3 },
                "Force": { correct: 1, total: 3 },
                "Speed": { correct: 2, total: 3 },
                "Food Preservation": { correct: 3, total: 3 },
                "Waste Material": { correct: 3, total: 3 },
                "Eclipses": { correct: 1, total: 3 },
                "Galaxies": { correct: 2, total: 3 },
                "Stability & Strength": { correct: 2, total: 3 }
            }
        },
        {
            studentId: "demo_s6",
            studentName: "Siti Hajar",
            pin: "719305",
            testTitle: "Standard 6 Science Screening",
            subject: "Science",
            score: 14,
            totalQuestions: 24,
            percentage: 58,
            isDemo: true,
            tagScores: {
                "Microorganisms": { correct: 3, total: 3 },
                "Force": { correct: 1, total: 3 },
                "Speed": { correct: 1, total: 3 },
                "Food Preservation": { correct: 2, total: 3 },
                "Waste Material": { correct: 2, total: 3 },
                "Eclipses": { correct: 1, total: 3 },
                "Galaxies": { correct: 2, total: 3 },
                "Stability & Strength": { correct: 2, total: 3 }
            }
        },
        {
            studentId: "demo_s7",
            studentName: "Marcus Wong",
            pin: "719305",
            testTitle: "Standard 6 Science Screening",
            subject: "Science",
            score: 21,
            totalQuestions: 24,
            percentage: 88,
            isDemo: true,
            tagScores: {
                "Microorganisms": { correct: 3, total: 3 },
                "Force": { correct: 2, total: 3 },
                "Speed": { correct: 3, total: 3 },
                "Food Preservation": { correct: 3, total: 3 },
                "Waste Material": { correct: 3, total: 3 },
                "Eclipses": { correct: 2, total: 3 },
                "Galaxies": { correct: 2, total: 3 },
                "Stability & Strength": { correct: 3, total: 3 }
            }
        }
    ];

    try {
        for (const rec of demoRecords) {
            await DB.saveResult(rec);
        }
        await refreshCloudData();
        alert("✅ 7 demo student results loaded! Try toggling 'Weakest 5 Focus' vs 'All Tested Tags' and click any student to assign their PBD grade.");
    } catch (err) {
        alert("❌ Failed to load demo results: " + err.message);
    } finally {
        seedDemoResultsBtn.disabled = false;
        seedDemoResultsBtn.textContent = "⚡ Load Demo Class Results";
    }
});

clearDemoResultsBtn.addEventListener("click", async () => {
    const demoOnes = allResultsCache.filter((r) => r.isDemo === true);
    if (demoOnes.length === 0) {
        alert("No demo records found to clear.");
        return;
    }
    if (!confirm(`Delete ${demoOnes.length} demo student result(s)? Real student submissions will NOT be touched.`)) return;

    clearDemoResultsBtn.disabled = true;
    try {
        for (const r of demoOnes) {
            await DB.deleteResult(r.id);
        }
        await refreshCloudData();
        alert("🗑️ Demo results cleared.");
    } catch (err) {
        alert("❌ Clear failed: " + err.message);
    } finally {
        clearDemoResultsBtn.disabled = false;
    }
});