// === js/assessment.js ===

let currentQuiz = null;
let currentQIndex = 0;
let score = 0;
let mistakes = []; // 错题本

// 🌟 新增：倒计时系统变量 (默认设定 15 分钟，即 900 秒)
let timeLeft = 15 * 60; 
let timerInterval;

window.onload = function() {
    // 从网址抓取老师给的 PIN 码
    const urlParams = new URLSearchParams(window.location.search);
    const pin = urlParams.get('pin');
    
    // 呼叫大管家获取试卷和学生名字
    currentQuiz = window.DB.getQuiz(pin);
    const currentUser = window.DB.getCurrentUser();
    document.getElementById('student-name').innerText = "Student: " + currentUser.name;
    
    if (!currentQuiz) {
        alert("⚠️ Assessment not found or expired!");
        window.location.href = 'student.html';
        return;
    }
    
    // 开始出题并启动倒计时
    loadQuestion();
    startTimer();
};

// 🌟 新增：防作弊监控机制 (切屏/点其他地方立刻警告)
window.addEventListener('blur', function() {
    document.getElementById('cheat-warning').style.display = 'flex';
});

// 🌟 新增：倒计时逻辑
function startTimer() {
    timerInterval = setInterval(() => {
        timeLeft--;
        let minutes = Math.floor(timeLeft / 60);
        let seconds = timeLeft % 60;
        
        // 格式化时间为 mm:ss
        let timeString = `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`;
        document.getElementById('timer-display').innerText = `⏱️ ${timeString}`;

        // 如果时间到了 5 分钟内，变成深红色闪烁警告 (可选)
        if (timeLeft <= 300) {
            document.getElementById('timer-display').style.background = '#f87171';
            document.getElementById('timer-display').style.color = '#fff';
        }

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            alert("⏳ Time is up! Your assessment will be auto-submitted now.");
            submitAssessment(); // 时间到，强制交卷！
        }
    }, 1000);
}

function loadQuestion() {
    const q = currentQuiz.questions[currentQIndex];
    document.getElementById('q-counter').innerText = `Question ${currentQIndex + 1} of ${currentQuiz.questions.length}`;
    document.getElementById('q-text').innerText = q.question;
    
    const optionsGrid = document.getElementById('options-grid');
    optionsGrid.innerHTML = '';
    
    q.options.forEach((opt, idx) => {
        optionsGrid.innerHTML += `
            <label class="option-label">
                <input type="radio" name="quiz-option" value="${idx}">
                <span>${opt}</span>
            </label>
        `;
    });

    // 如果是最后一题，改变按钮文字
    if (currentQIndex === currentQuiz.questions.length - 1) {
        document.getElementById('btn-next').innerText = "Submit Assessment ✅";
    }
}

window.nextQuestion = function() {
    const selected = document.querySelector('input[name="quiz-option"]:checked');
    if (!selected) return alert("⚠️ Please select an answer before continuing!");

    const selectedIndex = parseInt(selected.value);
    const q = currentQuiz.questions[currentQIndex];

    // 自动批改系统 + 呼叫 AI 引擎
    if (selectedIndex === q.correctIndex) {
        score++;
    } else {
        // 呼叫你的专属 AI 引擎！(军师加了防呆机制，确保万无一失)
        let aiInsight = "";
        if (window.AIEngine && window.AIEngine.diagnoseMistake) {
            aiInsight = window.AIEngine.diagnoseMistake(
                q.question, 
                q.options[selectedIndex], 
                q.options[q.correctIndex], 
                q.topic || "Core Concept"
            );
        } else if (q.insights && q.insights[selectedIndex]) {
            // 作为后备方案：如果 AI 引擎文件忘记引入，就去题库自带的 insights 里抓取
            aiInsight = q.insights[selectedIndex];
        }

        mistakes.push({ 
            question: q.question, 
            topic: q.topic, // 必须记录 topic，供 Report 雷达图和 AI 使用
            yourAnswer: q.options[selectedIndex], 
            correctAnswer: q.options[q.correctIndex],
            insight: aiInsight // 成功把 AI 诊断结果存入错题本！
        });
    }

    currentQIndex++;

    if (currentQIndex < currentQuiz.questions.length) {
        loadQuestion(); // 下一题
    } else {
        submitAssessment(); // 做完了，正常交卷
    }
};

// 🌟 军师重构：把交卷逻辑独立出来，方便被时间结束强制调用
function submitAssessment() {
    clearInterval(timerInterval); // 停止倒计时

    const urlParams = new URLSearchParams(window.location.search);
    const pin = urlParams.get('pin');
    
    window.DB.saveAssessmentResult(pin, score, currentQuiz.questions.length, mistakes);
    
    alert(`🎉 Assessment Complete! Auto-grading finished.`);
    
    // 核心修复：跳转到专属测试报告页面时，必须带上 PIN 码！
    window.location.href = `assessment-report.html?pin=${pin}`;
}