// === js/student.js ===

const currentUser = { name: "Ali bin Ahmad", registeredStandard: "Standard 6" };
let currentSubject = 'Mathematics'; 
let currentStandard = currentUser.registeredStandard; 

// KSSR DLP 完整大纲前端数据库
const kssrDatabase = {
    'Mathematics': {
        'Standard 4': ['Ch 1: Numbers & Operations', 'Ch 2: Fractions, Decimals & Percentages', 'Ch 3: Money', 'Ch 4: Time', 'Ch 5: Length, Mass & Volume', 'Ch 6: Space', 'Ch 7: Coordinates, Ratio & Proportion', 'Ch 8: Data Handling'],
        'Standard 5': ['Ch 1: Numbers to 1,000,000', 'Ch 2: Fractions & Decimals', 'Ch 3: Percentages', 'Ch 4: Money', 'Ch 5: Time', 'Ch 6: Length, Mass & Volume', 'Ch 7: Shapes & Space', 'Ch 8: Coordinates', 'Ch 9: Ratio & Proportion', 'Ch 10: Data Handling', 'Ch 11: Probability', 'Ch 12: Financial Education'],
        'Standard 6': ['Ch 1: Whole Numbers & Operations', 'Ch 2: Fractions, Decimals & Percentages', 'Ch 3: Money', 'Ch 4: Time', 'Ch 5: Measurement', 'Ch 6: Space', 'Ch 7: Coordinates, Ratio & Proportion', 'Ch 8: Data Handling & Likelihood']
    },
    'Science': {
        'Standard 4': ['Unit 1: Scientific Skills', 'Unit 2: Humans', 'Unit 3: Animals', 'Unit 4: Plants', 'Unit 5: Properties of Light', 'Unit 6: Sound', 'Unit 7: Energy', 'Unit 8: Materials', 'Unit 9: Earth', 'Unit 10: Machines'],
        'Standard 5': ['Unit 1: Scientific Skills', 'Unit 2: Humans', 'Unit 3: Animals', 'Unit 4: Plants', 'Unit 5: Electricity', 'Unit 6: Heat', 'Unit 7: Rusting', 'Unit 8: Matter', 'Unit 9: Phases of the Moon and Constellations', 'Unit 10: Machines'],
        'Standard 6': ['Unit 1: Scientific Skills', 'Unit 2: Humans', 'Unit 3: Microorganisms', 'Unit 4: Interaction Among Living Things', 'Unit 5: Preservation and Conservation', 'Unit 6: Force', 'Unit 7: Speed', 'Unit 8: Food Preservation Technology', 'Unit 9: Waste Materials', 'Unit 10: Eclipse', 'Unit 11: Galaxy', 'Unit 12: Stability and Strength', 'Unit 13: Technology']
    }
};

function renderSubtopics() {
    const container = document.getElementById('subtopics-container');
    container.innerHTML = ''; 
    const chapters = kssrDatabase[currentSubject][currentStandard];
    chapters.forEach((chapter) => {
        const chip = document.createElement('div');
        chip.className = 'topic-chip';
        chip.innerHTML = chapter;
        chip.onclick = function() { this.classList.toggle(currentSubject === 'Science' ? 'selected-science' : 'selected'); };
        container.appendChild(chip);
    });
}

function selectSubject(element, subject) {
    document.querySelectorAll('.subject-card').forEach(item => { item.classList.remove('active', 'active-science'); });
    element.classList.add(subject === 'Science' ? 'active-science' : 'active');
    document.querySelectorAll('.std-pill.active, .std-pill.active-science').forEach(btn => {
        btn.className = `std-pill ${subject === 'Science' ? 'active-science' : 'active'}`;
    });
    currentSubject = subject; renderSubtopics();
}

function selectStandard(element, standard) {
    document.querySelectorAll('.std-pill').forEach(item => { item.classList.remove('active', 'active-science'); });
    element.classList.add(currentSubject === 'Science' ? 'active-science' : 'active');
    currentStandard = standard;
    document.getElementById('sidebar-standard').innerText = standard; 
    renderSubtopics();
}

function initializeUI() {
    document.getElementById('sidebar-standard').innerText = currentStandard;
    document.querySelectorAll('.std-pill').forEach(pill => {
        if(pill.innerText === currentStandard) pill.classList.add('active'); 
        else pill.classList.remove('active', 'active-science');
    });
    
    // 初始化应用多语言
    if(typeof applyTranslations === 'function') applyTranslations(); 
    renderSubtopics();
}

function startQuiz() {
    const selectedChips = document.querySelectorAll('.topic-chip.selected, .topic-chip.selected-science');
    if (selectedChips.length === 0) {
        alert(translations[currentLang].alertSelect); 
        return; 
    }
    localStorage.setItem('selectedSubject', currentSubject);
    localStorage.setItem('selectedStandard', currentStandard);
    window.location.href = 'quiz.html';
}

window.onload = initializeUI;