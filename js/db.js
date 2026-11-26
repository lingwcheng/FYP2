// === js/db.js (Firebase Firestore 云端数据库版) ===
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

    // ---------------- 2. 标签题库 (questions) ----------------
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

    // 老师在审核时修改题目内容
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

    // ---------------- 3. 测验卷与 PIN 码 (assessments) ----------------
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

    // 供学生端输入 PIN 码进入测验使用
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

    // ---------------- 4. 成绩与雷达图数据 (results) ----------------
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
    }
};