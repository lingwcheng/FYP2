// === js/login.js (Firebase Authentication 登录版) ===
import { auth } from "./firebase-config.js";
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { DB } from "./db.js";

const loginForm = document.getElementById("login-form");
const submitBtn = document.getElementById("btn-submit");
const setupBtn = document.getElementById("setup-demo-btn");

// 1. 正式登录流程
loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("login-email").value.trim();
    const pwd = document.getElementById("login-pwd").value.trim();

    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in...";

    try {
        // 向 Firebase Authentication 验证邮箱和密码
        const userCredential = await signInWithEmailAndPassword(auth, email, pwd);
        const uid = userCredential.user.uid;

        // 去 Firestore 的 users 集合查出该用户的身份（teacher / student）
        const userProfile = await DB.getUserProfile(uid);

        if (!userProfile) {
            alert("⚠️ 账号存在，但数据库里找不到角色资料，请重新初始化账号。");
            return;
        }

        // 顺手存一份基础信息给其他尚未改造的旧页面过渡使用
        localStorage.setItem("currentUser", JSON.stringify(userProfile));

        alert(`✅ Login Successful!\nWelcome back, ${userProfile.name}.`);

        // 自动分流跳转
        const role = userProfile.role.toLowerCase();
        if (role === "teacher") {
            window.location.href = "teacher.html";
        } else if (role === "student") {
            window.location.href = "student.html";
        } else {
            alert("❌ 未知的用户角色：" + userProfile.role);
        }
    } catch (error) {
        console.error("Login Error:", error);
        alert("❌ Invalid Email or Password. Please try again!");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Login ➔";
    }
});

// 2. 首次初始化测试账号（自动写入 Authentication + Firestore users 集合）
setupBtn.addEventListener("click", async () => {
    setupBtn.disabled = true;
    setupBtn.textContent = "正在创建账号...";

    const demoAccounts = [
        { email: "teacher@edu.com", pwd: "123456", name: "Cikgu Tan", role: "teacher", grade: "" },
        { email: "student@edu.com", pwd: "123456", name: "Ali bin Abu", role: "student", grade: "Standard 6" }
    ];

    let createdCount = 0;

    for (const acc of demoAccounts) {
        try {
            const cred = await createUserWithEmailAndPassword(auth, acc.email, acc.pwd);
            await DB.saveUserProfile(cred.user.uid, {
                name: acc.name,
                email: acc.email,
                role: acc.role,
                grade: acc.grade
            });
            createdCount++;
        } catch (err) {
            if (err.code === "auth/email-already-in-use") {
                console.log(`${acc.email} 已存在，跳过。`);
            } else {
                console.error("创建失败:", err);
                alert("创建出错：" + err.message);
            }
        }
    }

    await signOut(auth); // 创建完先登出，等你手动测登录
    alert(`🎉 完成！新创建了 ${createdCount} 个账号。\n现在可以直接用 teacher@edu.com 或 student@edu.com（密码 123456）登录了！`);
    setupBtn.disabled = false;
    setupBtn.textContent = "✅ 测试账号已就绪";
});