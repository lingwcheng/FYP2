// === js/quiz.js ===

const currentSubject = localStorage.getItem('selectedSubject') || 'Mathematics';
const currentStandard = localStorage.getItem('selectedStandard') || 'Standard 5';

document.getElementById('sidebar-subject').innerText = currentSubject;
document.getElementById('sidebar-standard').innerText = currentStandard;

// 配合 KSSR 大纲的模拟题库
const mathDatabase = [
    { topic: "Fractions, Decimals & Percentages", kps: "", question: `[${currentStandard}] Which is equivalent to 3/4 ?`, options: ["6 / 8", "9 / 12", "12 / 16", "All of the above"], correctIndex: 3 },
    { topic: "Time", kps: "", question: `[${currentStandard}] How many minutes are in 2.5 hours?`, options: ["120 minutes", "150 minutes", "250 minutes", "100 minutes"], correctIndex: 1 },
    { topic: "Money", kps: "", question: `[${currentStandard}] RM 50.00 - RM 12.50 = ?`, options: ["RM 38.50", "RM 37.50", "RM 47.50", "RM 38.00"], correctIndex: 1 }
];

const scienceDatabase = [
    { topic: "Scientific Skills", kps: "Inferring", question: `[${currentStandard}] A plant in a dark box withered after a week. Why?`, options: ["It needs oxygen", "It lacks sunlight to make food", "It needs more soil", "It needs darkness"], correctIndex: 1 },
    { topic: "Interaction among Living Things", kps: "Predicting", question: `[${currentStandard}] If all the frogs in a paddy field are caught, what will happen to the snake population?`, options: ["Increase", "Decrease", "Remain the same", "They will eat grass"], correctIndex: 1 },
    { topic: "Measurement", kps: "Observing", question: `[${currentStandard}] When reading the volume of water, your eye level should be...`, options: ["Above the meniscus", "Below the meniscus", "At the level of the meniscus", "Anywhere"], correctIndex: 2 }
];

const mockDatabase = currentSubject === 'Science' ? scienceDatabase : mathDatabase;
let currentIndex = 0;
let selectedOption = null;
let studentScores = {}; 
let scienceKPS = {}; 

// 错题本数组！记录学生做的每一题
let reviewLog = []; 

function loadQuestion() {
    const q = mockDatabase[currentIndex];
    document.getElementById('question-text').innerText = q.question;
    document.getElementById('topic-tag').innerText = currentSubject === 'Science' ? `KPS: ${q.kps}` : `Chapter: ${q.topic}`;
    document.getElementById('current-q-num').innerText = currentIndex + 1;
    document.getElementById('attempted-q').innerText = currentIndex;
    
    let progressPercent = Math.round(((currentIndex + 1) / mockDatabase.length) * 100);
    document.getElementById('progress-fill').style.width = progressPercent + '%';
    document.getElementById('progress-text').innerText = progressPercent + '%';

    const optionsGrid = document.getElementById('options-grid');
    optionsGrid.innerHTML = '';
    selectedOption = null;

    const labels = ['A', 'B', 'C', 'D'];
    q.options.forEach((opt, index) => {
        const div = document.createElement('div');
        div.className = 'option';
        div.innerHTML = `<div class="option-label">${labels[index]}</div> ${opt}`;
        div.onclick = () => selectOption(index, div);
        optionsGrid.appendChild(div);
    });

    const nextBtn = document.getElementById('next-btn');
    if(currentIndex === mockDatabase.length - 1) {
        nextBtn.innerText = "Submit Quiz ✓";
        nextBtn.style.background = "#22c55e";
    } else {
        nextBtn.innerText = "Next Question →";
        nextBtn.style.background = "#4318FF";
    }
}

function selectOption(index, element) {
    selectedOption = index;
    document.querySelectorAll('.option').forEach(opt => opt.classList.remove('selected'));
    element.classList.add('selected');
}

function nextQuestion() {
    if (selectedOption === null) { 
        alert("Please select an answer!"); 
        return; 
    }

    const q = mockDatabase[currentIndex];
    const isCorrect = selectedOption === q.correctIndex;
    
    // 记分逻辑
    if (isCorrect) {
        studentScores[q.topic] = (studentScores[q.topic] || 0) + 1;
        if(currentSubject === 'Science') scienceKPS[q.kps] = (scienceKPS[q.kps] || 0) + 1;
    }

    // 将这题的情况丢进错题本日志里
    reviewLog.push({
        question: q.question,
        topic: q.topic,
        studentAnswer: q.options[selectedOption],
        correctAnswer: q.options[q.correctIndex],
        isCorrect: isCorrect
    });

    if (currentIndex < mockDatabase.length - 1) {
        currentIndex++;
        loadQuestion();
    } else {
        localStorage.setItem('finalScores', JSON.stringify(studentScores));
        if(currentSubject === 'Science') localStorage.setItem('kpsScores', JSON.stringify(scienceKPS));
        
        // 保存错题本记录
        localStorage.setItem('reviewLog', JSON.stringify(reviewLog));
        
        window.location.href = 'report.html';
    }
}

// 页面防作弊监控
window.addEventListener('blur', function() { 
    document.getElementById('cheat-warning').style.display = 'flex'; 
});

window.onload = function() {
    // 确保如果有需要，也会加载翻译
    if(typeof applyTranslations === 'function') applyTranslations();
    loadQuestion();
};