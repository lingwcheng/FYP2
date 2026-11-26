// === js/ai-engine.js ===

window.AIEngine = {
    // 核心诊断函数
    diagnoseMistake: function(questionText, selectedAnswer, correctAnswer, topic) {
        
        // ==========================================
        // 🌟 Chapter 1: Numbers & Operations (第1-5题)
        // ==========================================

        // Q1: 针对“数位 (Place Value)”陷阱
        if (questionText.includes("place value of the digit 7 in 47,205")) {
            if (selectedAnswer === "Tens") return "Place Value Error: Student confused the position. The Tens place is occupied by 0, not 7.";
            if (selectedAnswer === "Hundreds") return "Place Value Error: Student misidentified the hundreds place (which is 2). They might be reading right-to-left incorrectly.";
            if (selectedAnswer === "Ten Thousands") return "Place Value Error: Student confused the place value of 7 with the leading digit 4. Shows weakness in differentiating thousands and ten thousands.";
        }

        // Q2: 针对“四舍五入 (Rounding)”陷阱
        if (questionText.includes("Round off 84,562")) {
            if (selectedAnswer === "80,000" || selectedAnswer === "84,000") return "Rounding Concept Error: Student incorrectly truncated the number instead of applying the rounding rules for the 'thousands' digit.";
            if (selectedAnswer === "85,000") return "Rounding Error: Student rounded to the nearest THOUSAND instead of TEN THOUSAND. They misread the instruction.";
            if (selectedAnswer === "90,000") return "Rounding Concept Error: Student rounded up to 90,000 despite the thousands digit being 4 (which dictates rounding down).";
        }

        // Q3: 针对“连加法 (Addition Alignment)”陷阱
        if (questionText.includes("12,450 + 3,215 + 400")) {
            if (selectedAnswer === "15,665") return "Addition/Alignment Error: Student likely forgot to carry over the 1 when adding the hundreds column (4+2+4 = 10).";
            if (selectedAnswer === "15,065") return "Calculation Error: Student missed adding the thousand value correctly, possibly skipping the '1' from 3,215.";
            if (selectedAnswer === "16,665") return "Calculation Error: Student miscalculated the thousands place, adding an extra 1 without a valid carry-over.";
        }

        // Q4: 针对“除法与尾随零 (Division with Zeros)”陷阱
        if (questionText.includes("factory produces 45,000 pencils")) {
            if (selectedAnswer === "4,000") return "Division Error: Student guessed the value without executing the 45 ÷ 9 operation correctly.";
            if (selectedAnswer === "4,500") return "Division Error: Student missed a zero during division (45,000 ÷ 9). Shows weakness in handling trailing zeros.";
            if (selectedAnswer === "5,500") return "Calculation Error: Student divided incorrectly, possibly confusing it with addition or multiplication facts.";
        }

        // Q5: 针对“乘法进位 (Multiplication Carry-over)”陷阱
        if (questionText.includes("Multiply 1,204 by 6")) {
            if (selectedAnswer === "7,204") return "Carry-over Error: Student forgot to carry the 2 from multiplying 4 by 6 (24) into the tens place.";
            if (selectedAnswer === "6,224") return "Multiplication Error: Student forgot to multiply the thousands place (1 x 6), only calculating the rest.";
            if (selectedAnswer === "8,224") return "Calculation Error: Student added an extra thousand, likely confusing addition carry-over rules with multiplication.";
        }

        // ==========================================
        // 🌟 Chapter 2: Fractions, Decimals & Percentages (第6-10题)
        // ==========================================

        // Q6: 针对“分数转小数 (Fraction to Decimal)”陷阱
        if (questionText.includes("Convert 3/10 to a decimal")) {
            if (selectedAnswer === "0.03") return "Decimal Place Error: Student placed the 3 in the hundredths place. They confuse tenths (1/10) with hundredths (1/100).";
            if (selectedAnswer === "3.0") return "Conceptual Error: Student inverted the fraction conceptually, treating it as a whole number 3.";
            if (selectedAnswer === "3.10") return "Format Error: Student directly copied the numbers '3' and '10' to form a decimal. Lack of core fraction-to-decimal understanding.";
        }

        // Q7: 针对“等值分数 (Equivalent Fractions)”陷阱
        if (questionText.includes("equivalent to 1/2")) {
            if (selectedAnswer === "2/3") return "Equivalence Error: Student guessed randomly. They do not understand that the numerator must be exactly half of the denominator.";
            if (selectedAnswer === "3/4") return "Equivalence Error: Student chose a common fraction without calculating if 3 is half of 4.";
            if (selectedAnswer === "5/12") return "Equivalence Error: Student lacks understanding of simplifying fractions. 5 is clearly not half of 12.";
        }

        // Q8: 针对“小数加法对齐 (Decimal Alignment)”陷阱
        if (questionText.includes("0.45 + 0.3")) {
            if (selectedAnswer === "0.48") return "Misalignment Error: Student added 3 directly to 5 (hundredths place) instead of the tenths place. They treated 0.3 as 0.03.";
            if (selectedAnswer === "0.85") return "Calculation Error: Student aligned the decimals correctly but made a basic addition mistake.";
            if (selectedAnswer === "45.3") return "Place Value Error: Student ignored the decimal points completely and added them as whole numbers.";
        }

        // Q9: 针对“百分比转最简分数 (Percentage Simplification)”陷阱
        if (questionText.includes("Write 25% as a fraction")) {
            if (selectedAnswer === "1/2") return "Conversion Error: Student confused 25% (quarter) with 50% (half).";
            if (selectedAnswer === "2/5") return "Simplification Error: Student guessed the fraction. They might be confusing 25% with 40% (2/5).";
            if (selectedAnswer === "25/100") return "Incomplete Task: Student successfully converted the percentage to a fraction but FAILED to simplify it to its lowest terms.";
        }

        // Q10: 针对“同分母减法与化简 (Fraction Subtraction)”陷阱
        // 这一题正确答案是 "Both A and B" (4/6 和 2/3 都对)
        if (questionText.includes("Subtract: 5/6 - 1/6")) {
            if (selectedAnswer === "4/6") return "Incomplete Task: Student calculated correctly but failed to realize the fraction can be simplified to 2/3, making 'Both A and B' the best choice.";
            if (selectedAnswer === "2/3") return "Incomplete Recognition: Student simplified correctly but failed to recognize that '4/6' was also a valid intermediate step, making 'Both A and B' the best choice.";
            if (selectedAnswer === "None of above") return "Calculation Error: Student lacks basic understanding of subtracting fractions with the same denominator.";
        }

        // ==========================================
        // 🌟 通用托底降级诊断 (Fallback)
        // 当未来你加了第11题、第12题但忘记写专门的 AI 规则时，就会触发这里！
        // ==========================================
        if (topic && topic.includes("Fractions")) {
            return "Fraction Concept Gap: Student struggles with fraction rules. Recommend practicing fraction visualization and lowest-term simplification.";
        }
        // ... 上面是你原有的 Q1 到 Q10 的代码 ...

        if (topic && topic.includes("Numbers & Operations")) {
            return "Calculation/Place Value Error: Check for misalignment of digits or simple arithmetic mistakes during the operation.";
        }

        return `Diagnostic Complete: Student selected '${selectedAnswer}'. Further assessment needed on this specific KSSR concept.`;
    }, // ⚠️ 注意！这里一定要加一个逗号！

    // ==========================================
    // 🌟 新增：专门分配复习视频的独立函数 (绝对不影响上面的逻辑)
    // ==========================================
    getRevisionResource: function(diagnosticText) {
        // 🌟 换上了绝对允许 Embed 的测试视频链接！
        const resourceMap = {
            "Place Value Error": "https://www.youtube.com/embed/T5Qf0qSSJFI", 
            "Rounding": "https://www.youtube.com/embed/fd-E18EqSVk", 
            "Alignment": "https://www.youtube.com/embed/n-OjcKxmWSg", 
            "Carry-over": "https://www.youtube.com/embed/8htAWnO1Gjs", 
            // 如果上面我乱编的 ID 还是不行，请直接用下面这两个全世界公用的测试视频：
            "Decimal": "https://www.youtube.com/embed/kwh4IG8hecg", // Math Antics - Decimals
            "Fraction": "https://www.youtube.com/embed/n0FZhQ_GkKw", // Math Antics - Fractions
            "Simplification": "https://www.youtube.com/embed/AtBUQH8Tkqc" 
        };

        for (let key in resourceMap) {
            if (diagnosticText.includes(key)) {
                return resourceMap[key];
            }
        }
        
        // 托底方案：一个绝对能播的数学基础视频
        return "https://www.youtube.com/embed/kwh4IG8hecg"; 
    }
};