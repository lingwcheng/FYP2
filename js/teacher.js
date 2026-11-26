// === js/teacher.js (完整版：题库选题组卷 + 双AI多标签生成审核修改 + 自创打标 + PIN发布) ===
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

// 全局状态
let currentUserProfile = null;
let allQuestionsCache = [];
let allAssessmentsCache = [];
let selectedCartIds = new Set();        // 题库里选进“试卷篮”的题目 ID
let selectedAiReviewIds = new Set();    // AI 审核队列里勾选保留的题目 ID
let selectedManualTags = new Set();     // 自创题选中的标签
let selectedAiGenTags = new Set();      // AI 出题多选的标签

// DOM 引用
const teacherNameEl = document.getElementById("teacher-name");
const logoutBtn = document.getElementById("logout-btn");
const navItems = document.querySelectorAll(".nav-item[data-view]");
const viewSections = document.querySelectorAll(".view-section");
const pendingBadgeEl = document.getElementById("pending-badge");

// 视图 1：题库与组卷
const filterSubjectEl = document.getElementById("filter-subject");
const filterTagEl = document.getElementById("filter-tag");
const filterSourceEl = document.getElementById("filter-source");
const filterSearchEl = document.getElementById("filter-search");
const seedSampleBtn = document.getElementById("seed-sample-btn");
const bankCountEl = document.getElementById("bank-count");
const bankListEl = document.getElementById("bank-list");
const cartCountEl = document.getElementById("cart-count");
const cartListEl = document.getElementById("cart-list");
const testTitleInput = document.getElementById("test-title-input");
const generateBankTestBtn = document.getElementById("generate-bank-test-btn");
const publishedTestsListEl = document.getElementById("published-tests-list");

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
const approveAndPublishBtn = document.getElementById("approve-and-publish-btn");
const approveOnlyBtn = document.getElementById("approve-only-btn");

// 视图 3：自创题目
const qSubjectEl = document.getElementById("q-subject");
const manualTagChipsEl = document.getElementById("manual-tag-chips");
const createForm = document.getElementById("create-q-form");
const saveQBtn = document.getElementById("save-q-btn");

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

// ================= 1. 登录认证与初始化 =================
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }
    const profile = await DB.getUserProfile(user.uid);
    currentUserProfile = profile || { uid: user.uid, name: user.email, role: "teacher" };
    teacherNameEl.textContent = currentUserProfile.name || "Teacher";

    renderManualTagChips();
    renderAiGenTagChips();
    populateFilterTags();
    await refreshCloudData();
});

logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    localStorage.removeItem("currentUser");
    window.location.href = "login.html";
});

// 侧边栏切换
navItems.forEach((btn) => {
    btn.addEventListener("click", () => {
        navItems.forEach((b) => b.classList.remove("active"));
        viewSections.forEach((s) => s.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(btn.dataset.view).classList.add("active");
    });
});

// 统一刷新题库与已发布测验
async function refreshCloudData() {
    try {
        const [qList, aList] = await Promise.all([
            DB.getAllQuestions(),
            DB.getAllAssessments()
        ]);
        qList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        aList.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

        allQuestionsCache = qList;
        allAssessmentsCache = aList;

        // 默认把当前所有 pending AI 题勾选进审核保留列表（方便直接编辑发布）
        const pendingList = qList.filter((q) => q.status === "pending");
        const validPendingIds = new Set(pendingList.map((q) => q.id));
        for (const id of [...selectedAiReviewIds]) {
            if (!validPendingIds.has(id)) selectedAiReviewIds.delete(id);
        }
        pendingList.forEach((q) => {
            if (!q._uncheckedByTeacher) selectedAiReviewIds.add(q.id);
        });

        applyBankFilter();
        renderCart();
        renderPublishedTests();
        renderReviewQueue(pendingList);
    } catch (err) {
        console.error("Cloud sync error:", err);
        bankListEl.innerHTML = `<div class="empty-bank">❌ Firestore Error: ${escapeHtml(err.message)}</div>`;
    }
}

// ================= 2. 视图 1：题库筛选、选题组卷、PIN 列表 =================
function populateFilterTags() {
    const sub = filterSubjectEl.value;
    const tags = sub === "ALL" ? [...KSSR_TAGS.Mathematics, ...KSSR_TAGS.Science] : (KSSR_TAGS[sub] || []);
    filterTagEl.innerHTML =
        `<option value="ALL">All KSSR Tags</option>` +
        tags.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
}

filterSubjectEl.addEventListener("change", () => {
    populateFilterTags();
    applyBankFilter();
});
filterTagEl.addEventListener("change", applyBankFilter);
filterSourceEl.addEventListener("change", applyBankFilter);
filterSearchEl.addEventListener("input", applyBankFilter);

function applyBankFilter() {
    const sub = filterSubjectEl.value;
    const tag = filterTagEl.value;
    const src = filterSourceEl.value;
    const keyword = filterSearchEl.value.trim().toLowerCase();

    let list = allQuestionsCache.filter((q) => q.status === "approved");

    if (sub !== "ALL") list = list.filter((q) => q.subject === sub);
    if (tag !== "ALL") list = list.filter((q) => (q.tags || []).includes(tag));
    if (src !== "ALL") {
        list = list.filter((q) => {
            const qSource = q.source || (q.aiVerification ? "Dual-AI" : "Teacher Custom");
            return qSource === src;
        });
    }
    if (keyword) {
        list = list.filter((q) => (q.questionText || "").toLowerCase().includes(keyword));
    }

    renderApprovedBank(list);
}

function renderApprovedBank(questions) {
    bankCountEl.textContent = `${questions.length} Qs`;
    if (questions.length === 0) {
        bankListEl.innerHTML = '<div class="empty-bank">No approved questions match these filters. Click "⚡ Load 8 Sample KSSR Qs" or add questions!</div>';
        return;
    }

    bankListEl.innerHTML = questions
        .map((q) => {
            const inCart = selectedCartIds.has(q.id);
            const sourceLabel = q.source || (q.aiVerification ? "Dual-AI" : "Teacher Custom");

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

            const sourceBadge =
                sourceLabel === "Dual-AI"
                    ? `<span class="q-tag tag-ai">✓ Dual-AI Verified</span>`
                    : sourceLabel === "Teacher Custom" && !(q.tags || []).includes("Teacher Custom")
                    ? `<span class="q-tag tag-custom">👩‍🏫 Teacher Custom</span>`
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
                        <div class="q-tags">${tagBadges}${sourceBadge}</div>
                        <div style="display:flex; gap:6px; flex-shrink:0;">
                            <button class="btn-sm btn-add-q ${inCart ? "in-cart" : ""}" data-action="toggle-cart" data-id="${q.id}">
                                ${inCart ? "✓ Added" : "+ Add to Test"}
                            </button>
                            <button class="btn-sm btn-danger" data-action="delete-bank" data-id="${q.id}">🗑️</button>
                        </div>
                    </div>
                    <div class="q-text">${escapeHtml(q.questionText)}</div>
                    <ul class="q-options">${optsHtml}</ul>
                    ${q.explanation ? `<div class="q-explanation">💡 ${escapeHtml(q.explanation)}</div>` : ""}
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
    } else if (action === "delete-bank") {
        if (!confirm("Delete this question permanently from Cloud Firestore?")) return;
        selectedCartIds.delete(id);
        await DB.deleteQuestion(id);
        await refreshCloudData();
    }
});

// 渲染右侧“当前组卷篮”
function renderCart() {
    const chosen = allQuestionsCache.filter((q) => selectedCartIds.has(q.id));
    cartCountEl.textContent = `${chosen.length} Selected`;

    if (chosen.length === 0) {
        cartListEl.innerHTML = '<div class="empty-bank" style="padding:18px;">Click "+ Add to Test" on questions from the left bank.</div>';
        return;
    }

    cartListEl.innerHTML = chosen
        .map(
            (q, idx) => `
            <div class="cart-item">
                <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    <strong>Q${idx + 1}.</strong> ${escapeHtml(q.questionText)}
                </div>
                <button class="btn-sm btn-danger" data-remove-cart="${q.id}">✕</button>
            </div>
        `
        )
        .join("");
}

cartListEl.addEventListener("click", (e) => {
    const id = e.target.dataset.removeCart;
    if (!id) return;
    selectedCartIds.delete(id);
    applyBankFilter();
    renderCart();
});

// 从题库篮生成正式测验 + 6 位 PIN
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

// 公共函数：将选中的题目打包写入 Firestore assessments 并弹出 PIN
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

// 渲染已发布的测验与 PIN 列表（随时可重新 Copy PIN）
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

// 一键加载 8 道 KSSR 六年级种子题库（演示用，后续支持批量导入 50-100 题/标签）
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
        for (const q of samples) {
            await DB.saveQuestion({
                ...q,
                correctAnswer: q.options[q.correctIndex],
                status: "approved",
                source: "System Bank",
                aiVerification: null
            });
        }
        await refreshCloudData();
        alert("✅ 8 KSSR Standard 6 sample questions added to your Cloud Question Bank!");
    } catch (err) {
        alert("❌ Import failed: " + err.message);
    } finally {
        seedSampleBtn.disabled = false;
        seedSampleBtn.textContent = "⚡ Load 8 Sample KSSR Qs";
    }
});

// ================= 3. 视图 2：双 AI 多标签生成 + 审核 + 在线修改 + 一键发 PIN =================
function renderAiGenTagChips() {
    const subject = aiSubjectEl.value;
    const tags = KSSR_TAGS[subject] || [];
    selectedAiGenTags.clear();

    aiTagChipsEl.innerHTML = tags
        .map((t) => `<span class="tag-chip" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`)
        .join("");

    // 默认选中前两个标签方便测试多选
    const chips = aiTagChipsEl.querySelectorAll(".tag-chip");
    if (chips[0]) {
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

aiSubjectEl.addEventListener("change", renderAiGenTagChips);

// 触发双 AI 批量生成（下一阶段将内部替换为 fetch('../api/ai_handler.php')）
aiGenForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const subject = aiSubjectEl.value;
    const grade = aiGradeEl.value;
    const count = Math.min(20, Math.max(1, parseInt(aiCountEl.value, 10) || 1));
    const difficulty = aiDifficultyEl.value;
    const chosenTags = Array.from(selectedAiGenTags);

    if (chosenTags.length === 0) {
        alert("⚠️ Please select at least one KSSR tag for AI generation.");
        return;
    }

    aiGenBtn.disabled = true;
    aiGenBtn.textContent = `⏳ Generating ${count} Qs (Gemini → ChatGPT Verify)...`;

    try {
        await new Promise((r) => setTimeout(r, 900));

        const drafts = buildMockDualAiBatch(subject, grade, chosenTags, difficulty, count);

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
                    generator: "Gemini 2.5 Flash",
                    reviewer: "ChatGPT (GPT-4o-mini)",
                    status: "Verified",
                    notes: draft.reviewNotes
                }
            });
            selectedAiReviewIds.add(newId);
        }

        if (!aiTestTitleEl.value.trim()) {
            aiTestTitleEl.value = `${grade} ${subject} AI Test (${chosenTags.slice(0, 2).join(", ")})`;
        }

        await refreshCloudData();
        alert(`🤖 ${count} Dual-AI questions generated & cross-verified!\nReview, edit, or uncheck unwanted questions on the right, then click "Approve Selected & Generate PIN".`);
    } catch (err) {
        console.error("AI Gen Error:", err);
        alert("❌ Generation failed: " + err.message);
    } finally {
        aiGenBtn.disabled = false;
        aiGenBtn.textContent = "✨ Generate & Cross-Verify";
    }
});

// 渲染待审核队列（支持勾选保留/取消 + 在线编辑 + 删除不要的题）
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
                        <strong>✨ Generator:</strong> ${escapeHtml(aiInfo.generator || "Gemini")} &nbsp;|&nbsp;
                        <strong>🔍 Reviewer (${escapeHtml(aiInfo.reviewer || "ChatGPT")}):</strong> ${escapeHtml(aiInfo.notes || "Verified.")}
                    </div>

                    <!-- 折叠式在线编辑表单 -->
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

// 审核列表的勾选、编辑、保存修改、移除事件
reviewListEl.addEventListener("change", (e) => {
    if (!e.target.classList.contains("ai-keep-checkbox")) return;
    const id = e.target.dataset.id;
    const card = reviewListEl.querySelector(`[data-card-id="${id}"]`);
    if (e.target.checked) {
        selectedAiReviewIds.add(id);
        card?.classList.add("selected-card");
    } else {
        selectedAiReviewIds.delete(id);
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
        const box = document.getElementById(`edit-box-${id}`);
        box?.classList.toggle("open");
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
        await DB.updateQuestionStatus(id, "rejected");
        await refreshCloudData();
    }
});

// 按钮 A：审核通过勾选的 AI 题 + 直接生成 Test PIN
approveAndPublishBtn.addEventListener("click", async () => {
    const pendingChosen = allQuestionsCache.filter(
        (q) => q.status === "pending" && selectedAiReviewIds.has(q.id)
    );
    if (pendingChosen.length === 0) {
        alert("⚠️ Please check at least 1 AI question to approve & publish.");
        return;
    }

    approveAndPublishBtn.disabled = true;
    approveAndPublishBtn.textContent = "Approving & Publishing...";

    try {
        for (const q of pendingChosen) {
            await DB.updateQuestionStatus(q.id, "approved");
        }
        const title = aiTestTitleEl.value.trim() || `Standard 6 AI Test (${pendingChosen.length} Qs)`;
        await publishAssessmentWithPin(title, pendingChosen, approveAndPublishBtn);
        pendingChosen.forEach((q) => selectedAiReviewIds.delete(q.id));
        aiTestTitleEl.value = "";
        await refreshCloudData();
    } catch (err) {
        alert("Failed: " + err.message);
        approveAndPublishBtn.disabled = false;
        approveAndPublishBtn.textContent = "🎯 Approve Selected & Generate PIN";
    }
});

// 按钮 B：仅审核通过并存入云端题库（不立即出卷）
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
        }
        await refreshCloudData();
        alert(`✅ ${pendingChosen.length} questions approved and added to your Cloud Question Bank!`);
    } finally {
        approveOnlyBtn.disabled = false;
    }
});

// 模拟双 AI 批量生成器（阶段四替换为 PHP 调真 Gemini + ChatGPT API）
function buildMockDualAiBatch(subject, grade, chosenTags, difficultyMode, count) {
    const diffCycle = ["Easy", "Medium", "Hard", "KBAT"];
    const results = [];

    for (let i = 0; i < count; i++) {
        const tag = chosenTags[i % chosenTags.length];
        const diff = difficultyMode === "Mixed" ? diffCycle[i % diffCycle.length] : difficultyMode;

        if (subject === "Science") {
            results.push({
                tag,
                difficulty: diff,
                questionText: `[${tag} #${i + 1}] Which scientific observation best explains a key concept in Standard 6 "${tag}"?`,
                options: [
                    `Correct principle directly aligned with ${tag} (KSSR)`,
                    `Common misconception about ${tag}`,
                    `Unrelated physical property`,
                    `Reversed cause-and-effect statement`
                ],
                correctIndex: 0,
                explanation: `Under Malaysia KSSR ${grade} Science (${tag}), option A accurately describes the scientific relationship.`,
                reviewNotes: `ChatGPT cross-check passed for #${i + 1}: Matches KSSR Standard 6 (${tag}), clear distractors, difficulty=${diff}.`
            });
        } else {
            const a = (i + 2) * 3;
            const b = (i + 1) * 4;
            const sum = a + b;
            results.push({
                tag,
                difficulty: diff,
                questionText: `[${tag} #${i + 1}] In a Standard 6 ${tag} problem, a student combines ${a} units and ${b} units. What is the total?`,
                options: [`${sum} units`, `${sum + 2} units`, `${Math.abs(a - b)} units`, `${a * b} units`],
                correctIndex: 0,
                explanation: `Add both values carefully: ${a} + ${b} = ${sum} units.`,
                reviewNotes: `ChatGPT independently recalculated (${a} + ${b} = ${sum}). Confirmed accurate for KSSR Standard 6 (${tag}, ${diff}).`
            });
        }
    }
    return results;
}

// ================= 4. 视图 3：老师自创题目（自动加 Teacher Custom 标签） =================
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

    // 自动附带 "Teacher Custom" 标签
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