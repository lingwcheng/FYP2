// === js/report.js ===

window.onload = function() {
    // 1. 触发多语言翻译
    if(typeof applyTranslations === 'function') applyTranslations();

    // 2. 获取数据
    const currentSubject = localStorage.getItem('selectedSubject') || 'Science';
    const currentStandard = localStorage.getItem('selectedStandard') || 'Standard 6';
    const reviewLog = JSON.parse(localStorage.getItem('reviewLog')) || [];
    const kpsScores = JSON.parse(localStorage.getItem('kpsScores')) || {};
    const finalScores = JSON.parse(localStorage.getItem('finalScores')) || {};

    // 3. 更新侧边信息
    document.getElementById('display-subject').innerText = currentSubject;
    document.getElementById('display-standard').innerText = currentStandard;
    document.getElementById('subject-icon').innerText = currentSubject === 'Science' ? '🔬' : '📘';

    // 4. 算分与统计
    let totalQuestions = reviewLog.length;
    let correctQuestions = reviewLog.filter(q => q.isCorrect).length;
    let mistakes = totalQuestions - correctQuestions;
    let accuracy = totalQuestions === 0 ? 0 : Math.round((correctQuestions / totalQuestions) * 100);

    document.getElementById('dynamic-accuracy').innerText = accuracy + '%';
    document.getElementById('dynamic-mistakes').innerText = mistakes + ' Mistakes ⚠️';
    
    const circleUI = document.getElementById('accuracy-circle-ui');
    if(accuracy >= 80) circleUI.style.borderColor = '#00c853';
    else if(accuracy >= 50) circleUI.style.borderColor = '#f59e0b';
    else circleUI.style.borderColor = '#ef4444';

    let strongest = 'N/A';
    let maxScore = -1;
    for(let topic in finalScores) {
        if(finalScores[topic] > maxScore) { 
            maxScore = finalScores[topic]; 
            strongest = topic; 
        }
    }
    if (maxScore === 0 && totalQuestions > 0) strongest = 'Needs Review';
    document.getElementById('dynamic-strongest').innerText = strongest;

    // 🌟 5. 核心：智能分辨数学与科学，画不同的雷达图 🌟
    const canvasElement = document.getElementById('kpsChart');
    if(canvasElement) {
        let chartLabels = [];
        let chartData = [];
        let chartTitle = '';
        
        // 动态主题色：科学是绿色，数学是蓝色
        let themeColor = currentSubject === 'Science' ? '#00c853' : '#3b82f6'; 
        let themeBg = currentSubject === 'Science' ? 'rgba(0, 200, 83, 0.2)' : 'rgba(59, 130, 246, 0.2)';

        if (currentSubject === 'Science') {
            // --- 科学模式 (KPS) ---
            chartTitle = currentLang === 'ms' ? 'Kemahiran Proses Sains (KPS)' : 'Science Process Skills (KPS)';
            chartLabels = ['Inferring (推断)', 'Predicting (预测)', 'Observing (观察)', 'Classifying (分类)', 'Measuring (测量)', 'Communicating (沟通)'];
            chartData = ['Inferring', 'Predicting', 'Observing', 'Classifying', 'Measuring', 'Communicating'].map(key => {
                return kpsScores[key] && kpsScores[key] > 0 ? 100 : 30; 
            });
        } else {
            // --- 数学模式 (Chapter Mastery) ---
            chartTitle = currentLang === 'ms' ? 'Penguasaan Topik (Matematik)' : 'Chapter Mastery (Mathematics)';
            
            // 提取学生到底做了哪些章节，算出每个章节的准确率
            let topicStats = {};
            reviewLog.forEach(log => {
                if(!topicStats[log.topic]) topicStats[log.topic] = { total: 0, correct: 0 };
                topicStats[log.topic].total += 1;
                if(log.isCorrect) topicStats[log.topic].correct += 1;
            });

            chartLabels = Object.keys(topicStats);
            chartData = chartLabels.map(topic => Math.round((topicStats[topic].correct / topicStats[topic].total) * 100));

            // 雷达图至少需要 3 个角才好看，如果题太少，系统会自动补齐分析角
            if (chartLabels.length === 0) {
                chartLabels = ['Numbers', 'Operations', 'Measurement'];
                chartData = [0, 0, 0];
            } else if (chartLabels.length === 1) {
                chartLabels.push('Calculation Speed', 'Logic Accuracy');
                chartData.push(accuracy, accuracy);
            } else if (chartLabels.length === 2) {
                chartLabels.push('Overall Logic');
                chartData.push(accuracy);
            }
        }

        // 把计算好的标题扔到 HTML 里
        document.getElementById('rep-chart-title').innerText = chartTitle;

        // 召唤 Chart.js 画图
        const ctx = canvasElement.getContext('2d');
        new Chart(ctx, {
            type: 'radar',
            data: {
                labels: chartLabels,
                datasets: [{
                    label: 'Score (%)',
                    data: chartData,
                    backgroundColor: themeBg,
                    borderColor: themeColor,                    
                    borderWidth: 2,
                    pointBackgroundColor: themeColor,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: 'rgba(0, 0, 0, 0.1)' },
                        grid: { color: 'rgba(0, 0, 0, 0.05)' },
                        pointLabels: { font: { family: 'Poppins', size: 11, weight: '500' }, color: '#64748b' },
                        ticks: { display: false, min: 0, max: 100, stepSize: 20 }
                    }
                },
                plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(30, 27, 75, 0.9)', padding: 10, cornerRadius: 10 } }
            }
        });
    }
};

// 🌟 错题本弹窗 🌟
function openReviewModal() {
    const reviewLog = JSON.parse(localStorage.getItem('reviewLog')) || [];
    const container = document.getElementById('review-list');
    container.innerHTML = '';

    if(reviewLog.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#64748b;">No quiz data available to review.</p>';
    } else {
        reviewLog.forEach((log, index) => {
            let color = log.isCorrect ? '#22c55e' : '#ef4444';
            let icon = log.isCorrect ? '✅' : '❌';
            
            let htmlString = `
                <div class="review-item" style="border-left: 5px solid ${color}">
                    <div class="review-q">Q${index+1}: ${log.question}</div>
                    <div class="review-ans">Your Answer: <span style="color: ${color}; font-weight: 600;">${icon} ${log.studentAnswer}</span></div>
            `;
            if (!log.isCorrect) {
                htmlString += `<div class="review-ans">Correct Answer: <span style="color: #22c55e; font-weight: 600;">${log.correctAnswer}</span></div>`;
            }
            htmlString += `</div>`;
            container.innerHTML += htmlString;
        });
    }
    document.getElementById('review-modal').style.display = 'flex';
}

function closeReviewModal() {
    document.getElementById('review-modal').style.display = 'none';
}