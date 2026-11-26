// === js/assessment-report.js ===
window.onload = function() {
    const currentUser = window.DB.getCurrentUser();
    const results = window.DB.getAssessmentResults();
    const listArea = document.getElementById('results-list');
    
    // 1. 抓取网址里的 PIN 码
    const urlParams = new URLSearchParams(window.location.search);
    const targetPin = urlParams.get('pin');

    let subtitleText = targetPin ? `Assessment Result (PIN: ${targetPin})` : `Historical Assessment Records`;
    document.getElementById('role-subtitle').innerText = `Viewing as: ${currentUser.role} (${currentUser.name}) | ${subtitleText}`;
    document.getElementById('btn-back').href = currentUser.role === 'Teacher' ? 'teacher.html' : 'student.html';

    if (results.length === 0) {
        listArea.innerHTML = '<p style="text-align: center; color:#64748b; margin-top: 50px;">No assessment records found yet.</p>';
        return;
    }

    // 2. 智能过滤逻辑
    let displayResults = [...results].reverse();
    if (targetPin) {
        displayResults = displayResults.filter(res => res.pin === targetPin);
    }
    if (currentUser.role === 'Student') {
        displayResults = displayResults.filter(res => res.studentName === currentUser.name);
    }

    if (displayResults.length === 0) {
        listArea.innerHTML = '<p style="text-align: center; color:#64748b; margin-top: 50px;">No records match your current view.</p>';
        return;
    }

    listArea.innerHTML = '';

    function calculateTP(accuracy) {
        if (accuracy >= 90) return { level: 'TP 6', desc: 'Cemerlang', color: '#16a34a' };
        if (accuracy >= 80) return { level: 'TP 5', desc: 'Sangat Baik', color: '#10b981' }; 
        if (accuracy >= 65) return { level: 'TP 4', desc: 'Baik', color: '#3b82f6' };
        if (accuracy >= 50) return { level: 'TP 3', desc: 'Memuaskan', color: '#f59e0b' };
        if (accuracy >= 30) return { level: 'TP 2', desc: 'Terhad', color: '#ef4444' };
        return { level: 'TP 1', desc: 'Tahu', color: '#991b1b' }; 
    }

    displayResults.forEach((res, index) => {
        const tpData = calculateTP(res.accuracy);
        const ringColor = res.accuracy >= 80 ? '#10b981' : (res.accuracy >= 50 ? '#f59e0b' : '#ef4444');
        const mistakesCount = res.mistakes ? res.mistakes.length : 0;
        let mistakesDetails = '';
        
        if (mistakesCount > 0) {
            mistakesDetails = res.mistakes.map(m => {
                const aiDiagnosticText = m.insight 
                    ? m.insight 
                    : `Student struggles with <i>${m.topic || 'Core Concept'}</i>. Recommend reviewing Chapter notes before next assessment.`;

                // 🌟 新增：调用 AI 引擎找出对应的视频 URL (加入防崩溃保险)
                let videoUrl = "https://www.youtube.com/embed/IgA2g9z2zM8"; 
                if (window.AIEngine && window.AIEngine.getRevisionResource) {
                    videoUrl = window.AIEngine.getRevisionResource(aiDiagnosticText);
                }

                return `
                <div style="margin-bottom: 12px; font-size: 0.9rem; border-bottom: 1px dashed #e2e8f0; padding-bottom: 10px;">
                    <div style="color: #1e1b4b; font-weight: 600; margin-bottom: 5px;">Q: ${m.question}</div>
                    <div style="color: #ef4444;">❌ You answered: ${m.yourAnswer}</div>
                    <div style="color: #16a34a;">✅ Correct: ${m.correctAnswer}</div>
                    <div style="margin-top: 8px; padding: 10px; background: #e0e7ff; border-radius: 8px; font-size: 0.85rem; color: #4318FF; border-left: 4px solid #4318FF;">
                        <b style="font-size: 0.9rem;">🤖 AI Diagnostic:</b> <br>
                        ${aiDiagnosticText}
                        
                        <!-- 🌟 新增：针对性复习按钮 -->
                        <button onclick="openRevisionModal('${videoUrl}')" style="display: block; margin-top: 10px; background-color: #f59e0b; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; font-family: 'Poppins', sans-serif; box-shadow: 0 2px 4px rgba(245, 158, 11, 0.3);">
                            🎬 Fix this concept
                        </button>
                    </div>
                </div>
                `;
            }).join('');
        } else {
            mistakesDetails = `<div style="color: #16a34a; font-weight: 600;">🌟 Perfect! No mistakes made.</div>`;
        }

        listArea.innerHTML += `
            <div style="margin-bottom: 50px;">
                <div class="dashboard-grid">
                    <div class="glass-card">
                        <div class="avatar-large">${res.studentName === 'Cikgu Siti' ? '👩‍🏫' : '👦🏽'}</div>
                        <div class="student-name">${res.studentName}</div>
                        <div class="badge-blue">Standard 6</div>
                        <div class="circular-chart" style="background: conic-gradient(${ringColor} ${res.accuracy}%, #f1f5f9 0);">
                            <div class="inner-circle">
                                <h2 style="color: ${ringColor}">${res.accuracy}%</h2>
                                <span>Accuracy</span>
                            </div>
                        </div>
                        <p style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase;">Based on Assessment PIN: ${res.pin}</p>
                    </div>

                    <div class="glass-card">
                        <div class="chart-title">Skill Mastery</div>
                        <canvas id="radar-${index}" style="width: 100%; max-height: 250px;"></canvas>
                    </div>

                    <div class="stats-column">
                        <div class="stat-pill">
                            <div class="icon-box icon-blue">📘</div>
                            <div class="stat-info"><h4>Subject</h4><p>Live Assessment</p></div>
                        </div>
                        <div class="stat-pill">
                            <div class="icon-box icon-green">🏆</div>
                            <div class="stat-info"><h4>System PBD</h4><p>${tpData.level} - ${tpData.desc}</p></div>
                        </div>
                        <div class="stat-pill">
                            <div class="icon-box icon-red">📉</div>
                            <div class="stat-info"><h4>Mistakes Made</h4><p>${mistakesCount} Mistakes ⚠️</p></div>
                        </div>
                    </div>
                </div>

                <div class="intervention-banner">
                    <div class="banner-left">
                        <div class="bulb-icon">💡</div>
                        <div>
                            <h3 style="margin: 0 0 5px 0; color: #1e1b4b; font-size: 1.2rem;">Targeted Intervention</h3>
                            <p style="margin: 0; color: #64748b; font-size: 0.9rem;">Review mistakes to understand weak points.</p>
                        </div>
                    </div>
                    <button class="btn-orange" onclick="toggleMistakes('mistakes-${index}')">Review Mistakes</button>
                </div>
                
                <div id="mistakes-${index}" class="mistakes-dropdown">
                    <h3 style="color: #ef4444; margin-top: 0; margin-bottom: 20px;">Review Details</h3>
                    ${mistakesDetails}
                </div>
            </div>
        `;
    });

    // 3. 渲染 Chart.js 雷达图
    displayResults.forEach((res, index) => {
        const ctx = document.getElementById(`radar-${index}`).getContext('2d');
        const quiz = window.DB.getQuiz(res.pin);
        const subject = (quiz && quiz.questions && quiz.questions.length > 0) ? quiz.questions[0].subject : 'Mathematics';
        
        const chartTitleEl = document.getElementById(`radar-${index}`).previousElementSibling;
        if (chartTitleEl) {
            chartTitleEl.innerText = subject === 'Science' ? 'Skill Mastery (KPS)' : 'Proses Matematik (Math Processes)';
        }

        let baseTP = 1;
        if (res.accuracy >= 90) baseTP = 6;
        else if (res.accuracy >= 80) baseTP = 5;
        else if (res.accuracy >= 65) baseTP = 4;
        else if (res.accuracy >= 50) baseTP = 3;
        else if (res.accuracy >= 30) baseTP = 2;

        let chartLabels = [];
        let mockDataTP = [];

        if (subject === 'Science') {
            chartLabels = ['Observing', 'Inferring', 'Predicting', 'Communicating', 'Interpreting', 'Experimenting'];
            mockDataTP = [
                Math.min(6, baseTP + 1), Math.max(1, baseTP - 1), baseTP, 
                Math.min(6, baseTP), Math.max(1, baseTP - 1), baseTP
            ];
        } else {
            chartLabels = ['Problem Solving', 'Reasoning', 'Communication', 'Connection', 'Representation'];
            mockDataTP = [
                Math.max(1, baseTP - 1), Math.max(1, baseTP - 1), Math.min(6, baseTP + 1), baseTP, baseTP
            ];
        }

        new Chart(ctx, {
            type: 'radar',
            data: {
                labels: chartLabels,
                datasets: [{
                    label: 'Tahap Penguasaan (TP)',
                    data: mockDataTP,
                    backgroundColor: subject === 'Science' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(67, 24, 255, 0.15)',
                    borderColor: subject === 'Science' ? '#22c55e' : '#4318FF',
                    pointBackgroundColor: subject === 'Science' ? '#22c55e' : '#4318FF',
                    borderWidth: 2,
                }]
            },
            options: {
                scales: {
                    r: {
                        min: 0, max: 6,
                        ticks: { stepSize: 1, display: false },
                        angleLines: { color: 'rgba(0,0,0,0.05)' },
                        grid: { color: 'rgba(0,0,0,0.1)' },
                        pointLabels: { font: { size: 10, family: 'Poppins', weight: '600' }, color: '#64748b' }
                    }
                },
                plugins: { 
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) { return ` Tahap Penguasaan: TP ${context.raw}`; }
                        }
                    }
                }
            }
        });
    });
};

window.toggleMistakes = function(id) {
    const el = document.getElementById(id);
    if (el.style.display === 'none' || el.style.display === '') {
        el.style.display = 'block';
    } else {
        el.style.display = 'none';
    }
};