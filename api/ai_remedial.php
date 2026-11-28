<?php
// api/ai_remedial.php —— 学生错题 AI Misconception Remedial（分析学生为何选了错误选项）
header('Content-Type: application/json; charset=utf-8');
set_time_limit(60);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed. Use POST.']);
    exit;
}

$secretsPath = __DIR__ . '/secrets.php';
if (!file_exists($secretsPath)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Missing api/secrets.php file.']);
    exit;
}
require_once $secretsPath;

if (!defined('GEMINI_API_KEY') || strpos(GEMINI_API_KEY, '把你的') !== false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'GEMINI_API_KEY is not configured in api/secrets.php.']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!$input || empty($input['questionText'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing question details.']);
    exit;
}

$subject       = trim($input['subject'] ?? 'Mathematics');
$tag           = trim($input['tag'] ?? 'KSSR Standard 6');
$questionText  = trim($input['questionText'] ?? '');
$options       = is_array($input['options'] ?? null) ? $input['options'] : [];
$studentAnswer = trim($input['studentAnswer'] ?? 'Unanswered');
$correctAnswer = trim($input['correctAnswer'] ?? '');
$explanation   = trim($input['explanation'] ?? '');

function callGeminiRemedial(string $url, array $payload, int $timeoutSec = 35): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'Expect:'],
        CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_UNICODE),
        CURLOPT_IPRESOLVE      => CURL_IPRESOLVE_V4,
        CURLOPT_CONNECTTIMEOUT => 12,
        CURLOPT_TIMEOUT        => $timeoutSec,
    ]);
    $raw      = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    if ($curlErr) {
        throw new Exception("Network cURL error: " . $curlErr, 0);
    }
    $decoded = json_decode($raw, true);
    if ($httpCode >= 400) {
        $apiMsg = $decoded['error']['message'] ?? substr($raw, 0, 250);
        throw new Exception("API HTTP {$httpCode}: {$apiMsg}", $httpCode);
    }
    return $decoded ?: [];
}

function parseJsonResponse(string $text): array {
    $clean = trim($text);
    $clean = preg_replace('/^```(?:json)?\s*/i', '', $clean);$clean = preg_replace('/\s*```$/', '', $clean);
    $data = json_decode($clean, true);
    if (json_last_error() === JSON_ERROR_NONE && is_array($data)) {
        return $data;
    }
    $start = strpos($clean, '{');
    $end   = strrpos($clean, '}');
    if ($start !== false && $end !== false && $end > $start) {
        $data = json_decode(substr($clean, $start, $end - $start + 1), true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($data)) {
            return $data;
        }
    }
    throw new Exception("AI returned invalid JSON format.");
}

try {
    $geminiModel = 'gemini-3.5-flash-lite';
    $geminiUrl   = "https://generativelanguage.googleapis.com/v1beta/models/{$geminiModel}:generateContent?key=" . urlencode(GEMINI_API_KEY);

    $optionsText = '';
    $letters = ['A', 'B', 'C', 'D'];
    foreach ($options as $idx => $opt) {
        $lbl = $letters[$idx] ?? ($idx + 1);
        $optionsText .= "{$lbl}. {$opt}\n";
    }

    $isSkipped = (strtolower($studentAnswer) === 'unanswered' || $studentAnswer === '');
    $mistakeInstruction = $isSkipped
        ? 'The student skipped this question. Explain why Standard 6 students often get stuck on this type of question and how to start.'
        : "The student specifically chose the WRONG option: \"{$studentAnswer}\". Diagnose the exact misconception, calculation slip, or conceptual trap that most likely led a 12-year-old Malaysian Standard 6 student to pick \"{$studentAnswer}\" instead of \"{$correctAnswer}\".";

    $prompt = <<<PROMPT
You are a warm, encouraging Malaysian KSSR Standard 6 {$subject} tutor.
Analyze a student's mistake so they truly understand why they got it wrong.

Topic Tag: {$tag}
Question: {$questionText}
Options:
{$optionsText}
Student's Choice: {$studentAnswer}
Correct Answer: {$correctAnswer}
Reference Explanation: {$explanation}

Task:
1. "likelyReason": {$mistakeInstruction} (2-3 simple, friendly sentences in clear English suitable for a 12-year-old).
2. "stepByStepFix": Give a clear, easy-to-follow 2-3 step walkthrough to get "{$correctAnswer}".
3. "quickTip": One short, memorable rule or trick so they won't fall for this trap again (max 20 words).

Return ONLY valid JSON:
{"likelyReason":"","stepByStepFix":["Step 1...","Step 2..."],"quickTip":""}
PROMPT;

    $thinkingOptions = [
        ['thinkingLevel' => 'MINIMAL'],
        ['thinkingBudget' => 0],
        null
    ];

    $res = null;
    $lastErr = null;
    foreach ($thinkingOptions as $tCfg) {
        $genConfig = [
            'temperature'      => 0.4,
            'maxOutputTokens'  => 1024,
            'responseMimeType' => 'application/json'
        ];
        if ($tCfg !== null) {
            $genConfig['thinkingConfig'] = $tCfg;
        }

        $payload = [
            'contents' => [
                ['role' => 'user', 'parts' => [['text' => $prompt]]]
            ],
            'generationConfig' => $genConfig
        ];

        try {
            $res = callGeminiRemedial($geminiUrl, $payload, 35);
            break;
        } catch (Exception $ex) {
            $lastErr = $ex;
            if ($ex->getCode() !== 400) {
                throw $ex;
            }
        }
    }

    if (!$res) {
        throw new Exception($lastErr ? $lastErr->getMessage() : "Gemini request failed.");
    }

    $parts = $res['candidates'][0]['content']['parts'] ?? [];
    $text  = '';
    foreach ($parts as $p) {
        if (!empty($p['thought'])) continue;
        if (isset($p['text'])) $text .= $p['text'];
    }
    if (!$text) {
        throw new Exception("Gemini returned an empty remedial explanation.");
    }

    $parsed = parseJsonResponse($text);
    $steps  = is_array($parsed['stepByStepFix'] ?? null)
        ? array_values(array_map('strval', $parsed['stepByStepFix']))
        : [trim((string)($parsed['stepByStepFix'] ?? $explanation))];

    echo json_encode([
        'success'  => true,
        'model'    => 'Gemini 3.5 Flash-Lite',
        'remedial' => [
            'likelyReason'  => trim((string)($parsed['likelyReason'] ?? 'You may have misread a key number or concept in the question.')),
            'stepByStepFix' => $steps,
            'quickTip'      => trim((string)($parsed['quickTip'] ?? 'Always double-check the units and re-read what the question asks.'))
        ]
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}