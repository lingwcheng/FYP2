// === js/settings.js ===

// 1. 全局多语言翻译字典 (Dictionary)
const translations = {
    'en': {
        // Sidebar 通用 (去掉了 Dashboard)
        navProf: "My Profile", navPrac: "Custom Practice", navRes: "Results", navSet: "Settings",
        
        // --- Index (Home) 页面 ---
        homeTitle1: "Where Learning", homeTitle2: "Meets Inspiration",
        homeSub: "Join a dynamic community of educators and learners shaping the future together.",
        roleTeacher: "TEACHER", roleStudent: "STUDENT",
        descTeacher: "Empower minds. Share knowledge. Shape the future.",
        descStudent: "Explore new ideas. Learn with purpose. Achieve your goals.",
        btnJoin: "Join Now →",
        
        // --- Student 页面 ---
        title: "Build Your Own Quiz",
        sub: "Select a subject, your standard, and mix multiple chapters based on the KSSR DLP syllabus.",
        step1: "1. Choose Subject", step2: "2. Select Standard", step3: "3. Pick Chapters (KSSR Syllabus)",
        math: "Mathematics", mathDesc: "Numbers, Operations, Measurement & more",
        sci: "Science", sciDesc: "Scientific Skills, Humans, Earth & Space",
        btnGen: "Generate Custom Quiz →",
        
        // --- Report 页面 ---
        reportTitle: "Diagnostic Report",
        reportSub: "Comprehensive overview of your academic performance",
        accLabel: "Accuracy",
        basedOn: "Based on latest KSSR Quiz",
        kpsTitle: "Science Process Skills (KPS)",
        intervTitle: "Targeted Intervention",
        intervDesc: "Review your mistakes to understand your weak points.",
        btnReview: "Review Mistakes",

        // Settings 弹窗通用
        modalTitle: "Settings", modalDesc: "Select Language / Pilih Bahasa",
        alertWIP: "This feature will be integrated in FYP 2!",
        alertSelect: "Wait! Please select at least one chapter to practice."
    },
    'ms': {
        // Sidebar 通用 (去掉了 Dashboard)
        navProf: "Profil Saya", navPrac: "Latihan Tersuai", navRes: "Keputusan", navSet: "Tetapan",
        
        // --- Index (Home) 页面 ---
        homeTitle1: "Di Mana Pembelajaran", homeTitle2: "Bertemu Inspirasi",
        homeSub: "Sertai komuniti pendidik dan pelajar yang dinamik untuk membentuk masa depan bersama.",
        roleTeacher: "GURU", roleStudent: "PELAJAR",
        descTeacher: "Perkasa minda. Kongsi ilmu. Bentuk masa depan.",
        descStudent: "Teroka idea baharu. Belajar dengan tujuan. Capai matlamat.",
        btnJoin: "Sertai Sekarang →",
        
        // --- Student 页面 ---
        title: "Bina Kuiz Anda Sendiri",
        sub: "Pilih subjek, tahun anda, dan campurkan pelbagai bab berdasarkan silibus KSSR DLP.",
        step1: "1. Pilih Subjek", step2: "2. Pilih Tahun", step3: "3. Pilih Bab (Silibus KSSR)",
        math: "Matematik", mathDesc: "Nombor, Operasi, Ukuran & lain-lain",
        sci: "Sains", sciDesc: "Kemahiran Saintifik, Manusia, Bumi & Angkasa",
        btnGen: "Jana Kuiz Tersuai →",
        
        // --- Report 页面 ---
        reportTitle: "Laporan Diagnostik",
        reportSub: "Gambaran menyeluruh mengenai prestasi akademik anda",
        accLabel: "Ketepatan",
        basedOn: "Berdasarkan Kuiz KSSR terkini",
        kpsTitle: "Kemahiran Proses Sains (KPS)",
        intervTitle: "Intervensi Sasaran",
        intervDesc: "Semak kesilapan anda untuk memahami kelemahan anda.",
        btnReview: "Semak Kesilapan",

        // Settings 弹窗通用
        modalTitle: "Tetapan", modalDesc: "Pilih Bahasa / Select Language",
        alertWIP: "Ciri ini akan diintegrasikan dalam FYP 2!",
        alertSelect: "Tunggu! Sila pilih sekurang-kurangnya satu bab untuk latihan."
    }
};

let currentLang = localStorage.getItem('siteLanguage') || 'en';

function applyTranslations() {
    const dict = translations[currentLang];
    
    // 遍历字典，如果页面上有这个 ID，就把文字换掉！(超强自动适配)
    const elementsToTranslate = {
        'nav-prof': dict.navProf, 'nav-prac': dict.navPrac, 'nav-res': dict.navRes, 'nav-set': dict.navSet,
        'txt-title': dict.title, 'txt-sub': dict.sub, 'txt-step1': dict.step1, 'txt-step2': dict.step2, 'txt-step3': dict.step3,
        'txt-math': dict.math, 'txt-math-desc': dict.mathDesc, 'txt-sci': dict.sci, 'txt-sci-desc': dict.sciDesc, 'btn-gen': dict.btnGen,
        'modal-title': dict.modalTitle, 'modal-desc': dict.modalDesc,
        'home-t1': dict.homeTitle1, 'home-t2': dict.homeTitle2, 'home-sub': dict.homeSub,
        'role-t': dict.roleTeacher, 'desc-t': dict.descTeacher, 'btn-join-t': dict.btnJoin,
        'role-s': dict.roleStudent, 'desc-s': dict.descStudent, 'btn-join-s': dict.btnJoin,
        'rep-title': dict.reportTitle, 'rep-sub': dict.reportSub, 'rep-acc': dict.accLabel, 'rep-based': dict.basedOn,
        'rep-kps': dict.kpsTitle, 'rep-interv': dict.intervTitle, 'rep-interv-desc': dict.intervDesc, 'rep-btn-rev': dict.btnReview
    };

    for (let id in elementsToTranslate) {
        if (document.getElementById(id)) {
            document.getElementById(id).innerText = elementsToTranslate[id];
        }
    }

    if(document.getElementById('lang-en')) {
        document.getElementById('lang-en').classList.remove('active');
        document.getElementById('lang-ms').classList.remove('active');
        document.getElementById(`lang-${currentLang}`).classList.add('active');
    }
}

function openSettings() { if(document.getElementById('settings-modal')) document.getElementById('settings-modal').style.display = 'flex'; }
function closeSettings() { if(document.getElementById('settings-modal')) document.getElementById('settings-modal').style.display = 'none'; }
function setLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('siteLanguage', lang);
    applyTranslations();
    setTimeout(closeSettings, 300); 
}
function showWIP() { alert(translations[currentLang].alertWIP); }

// 如果页面没有专门的 window.onload，就默认执行一次翻译
if (typeof window.onload !== 'function') {
    window.onload = applyTranslations;
}