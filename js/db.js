// === js/db.js (Firebase Firestore 云端数据库版 - 含批量导入与 Protected FIFO 配额管理) ===
import { db } from "./firebase-config.js";
import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    writeBatch,
    query,
    where,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

export const DB = {
    // ---------------- 1. 用户资料 (users) ----------------
    async saveUserProfile(uid, profileData) {
        await setDoc(doc(db, "users", uid), {
            uid,
            ...profileData,
            updatedAt: serverTimestamp()
        });
    },

    async getUserProfile(uid) {
        const snap = await getDoc(doc(db, "users", uid));
        return snap.exists() ? snap.data() : null;
    },

    // ---------------- 2. 系统配额设置 (settings/quota) ----------------
    async getTagQuotaLimit() {
        try {
            const snap = await getDoc(doc(db, "settings", "quota"));
            if (snap.exists() && Number.isInteger(snap.data().maxPerTag) && snap.data().maxPerTag > 0) {
                return snap.data().maxPerTag;
            }
        } catch (err) {
            console.warn("Read quota fallback to 2000:", err);
        }
        return 2000;
    },

    async saveTagQuotaLimit(maxPerTag) {
        const validLimit = Math.max(1, Math.min(10000, parseInt(maxPerTag, 10) || 2000));
        await setDoc(doc(db, "settings", "quota"), {
            maxPerTag: validLimit,
            updatedAt: serverTimestamp()
        }, { merge: true });
        return validLimit;
    },

    // ---------------- 3. 标签题库 (questions) ----------------
    async getAllQuestions() {
        const snap = await getDocs(collection(db, "questions"));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    async getQuestionsByTag(tag) {
        const q = query(
            collection(db, "questions"),
            where("tags", "array-contains", tag)
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    async saveQuestion(questionData) {
        const docRef = await addDoc(collection(db, "questions"), {
            ...questionData,
            status: questionData.status || "pending",
            createdAt: serverTimestamp()
        });
        return docRef.id;
    },

    // 批量导入题目（每批 400 条，避免触及 Firestore 单次 500 写上限）
    async batchSaveQuestions(questionsArray, onProgress = null) {
        const CHUNK_SIZE = 400;
        let importedCount = 0;

        for (let i = 0; i < questionsArray.length; i += CHUNK_SIZE) {
            const chunk = questionsArray.slice(i, i + CHUNK_SIZE);
            const batch = writeBatch(db);

            chunk.forEach((qData) => {
                const newDocRef = doc(collection(db, "questions"));
                batch.set(newDocRef, {
                    ...qData,
                    status: qData.status || "approved",
                    createdAt: serverTimestamp()
                });
            });

            await batch.commit();
            importedCount += chunk.length;
            if (typeof onProgress === "function") {
                onProgress(importedCount, questionsArray.length);
            }
        }
        return importedCount;
    },

    // 分层保护 FIFO 自动淘汰机制：
    // 仅检查指定的 KSSR 主题标签；超限时优先删除最早且未被现有考卷 PIN 占用的 Dual-AI 题目，
    // 永久保护 System Bank 与 Teacher Custom 题目。
    async enforceTagQuota(topicTagsToCheck, maxPerTag, protectedIdsSet = new Set()) {
        const uniqueTags = [...new Set(topicTagsToCheck)].filter(Boolean);
        const deletedIds = new Set();
        const report = [];

        for (const tag of uniqueTags) {
            const tagQuestions = await this.getQuestionsByTag(tag);
            // 仅统计已审核通过且本次尚未被删的题目
            const approved = tagQuestions.filter(
                (q) => q.status === "approved" && !deletedIds.has(q.id)
            );

            if (approved.length <= maxPerTag) continue;

            const excess = approved.length - maxPerTag;

            // 筛选可淘汰候选：仅限 Dual-AI 来源，且不在保护名单（现有 PIN 考卷 / 本次刚批准的新题）中
            const evictable = approved
                .filter((q) => {
                    const src = q.source || (q.aiVerification ? "Dual-AI" : "Teacher Custom");
                    return src === "Dual-AI" && !protectedIdsSet.has(q.id);
                })
                .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)); // 最早的排最前

            const toDelete = evictable.slice(0, excess);
            for (const q of toDelete) {
                await this.deleteQuestion(q.id);
                deletedIds.add(q.id);
            }

            if (toDelete.length > 0) {
                report.push({
                    tag,
                    removed: toDelete.length,
                    remaining: approved.length - toDelete.length,
                    limit: maxPerTag
                });
            }
        }

        return {
            evictedCount: deletedIds.size,
            details: report
        };
    },

    // 修改题目内容
    async updateQuestion(questionId, updatedFields) {
        await updateDoc(doc(db, "questions", questionId), {
            ...updatedFields,
            updatedAt: serverTimestamp()
        });
    },

    async updateQuestionStatus(questionId, newStatus) {
        await updateDoc(doc(db, "questions", questionId), {
            status: newStatus,
            reviewedAt: serverTimestamp()
        });
    },

    async deleteQuestion(questionId) {
        await deleteDoc(doc(db, "questions", questionId));
    },

    // ---------------- 4. 测验卷与 PIN 码 (assessments) ----------------
    async saveAssessment(assessmentData) {
        const docRef = await addDoc(collection(db, "assessments"), {
            ...assessmentData,
            createdAt: serverTimestamp()
        });
        return docRef.id;
    },

    async getAllAssessments() {
        const snap = await getDocs(collection(db, "assessments"));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    async getAssessmentByPin(pin) {
        const q = query(
            collection(db, "assessments"),
            where("pin", "==", pin)
        );
        const snap = await getDocs(q);
        if (snap.empty) return null;
        const first = snap.docs[0];
        return { id: first.id, ...first.data() };
    },

    async deleteAssessment(assessmentId) {
        await deleteDoc(doc(db, "assessments", assessmentId));
    },

    // ---------------- 5. 成绩与雷达图数据 (results) ----------------
    async saveResult(resultData) {
        const docRef = await addDoc(collection(db, "results"), {
            ...resultData,
            completedAt: serverTimestamp()
        });
        return docRef.id;
    },

    async getStudentResults(studentId) {
        const q = query(
            collection(db, "results"),
            where("studentId", "==", studentId)
        );
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    async getAllResults() {
        const snap = await getDocs(collection(db, "results"));
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    },

    async updateResult(resultId, updatedFields) {
        await updateDoc(doc(db, "results", resultId), {
            ...updatedFields,
            gradedAt: serverTimestamp()
        });
    },

    async deleteResult(resultId) {
        await deleteDoc(doc(db, "results", resultId));
    }
};