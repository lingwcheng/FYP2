<?php
// api/ai_handler.php —— Dual-AI Backend (Gemini 3.5 Flash-Lite + Groq GPT-OSS 120B)
header('Content-Type: application/json; charset=utf-8');
set_time_limit(120);

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

if (
    !defined('GEMINI_API_KEY') || !defined('GROQ_API_KEY') ||
    strpos(GEMINI_API_KEY, '把你的') !== false ||
    strpos(GROQ_API_KEY, '把你的') !== false
) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Please paste your real GEMINI_API_KEY and GROQ_API_KEY into api/secrets.php first.']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid JSON request body.']);
    exit;
}

$subject    = trim($input['subject'] ?? 'Mathematics');
$grade      = trim($input['grade'] ?? 'Standard 6');
$tags       = is_array($input['tags'] ?? null) ? $input['tags'] : [];
$difficulty = trim($input['difficulty'] ?? 'Mixed');
$count      = max(1, min(15, intval($input['count'] ?? 3)));

if (empty($tags)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'At least one KSSR tag is required.']);
    exit;
}

function callJsonApi(string $url, array $headers, array $payload, int $timeoutSec = 50): array {
    $headers[] = 'Expect:';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => $headers,
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
        $apiMsg = $decoded['error']['message'] ?? substr($raw, 0, 300);
        throw new Exception("API HTTP {$httpCode}: {$apiMsg}", $httpCode);
    }
    return $decoded ?: [];
}

function extractJsonObject(string $text): array {
    $clean = trim($text);
    $clean = preg_replace('/^```(?:json)?\s*/i', '', $clean);$clean = preg_replace('/\s*```$/', '', $clean);
    $data = json_decode($clean, true);
    if (json_last_error() === JSON_ERROR_NONE && is_array($data)) {
        return $data;
    }
    $start = strpos($clean, '{');
    $end   = strrpos($clean, '}');
    if ($start !== false && $end !== false && $end > $start) {
        $sub  = substr($clean, $start, $end - $start + 1);
        $data = json_decode($sub, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($data)) {
            return $data;
        }
    }
    throw new Exception("Invalid JSON from model: " . substr($clean, 0, 250));
}

try {
    $tagsListStr = implode(', ', $tags);

    // =========================================================================
    // 阶段 1：Gemini 3.5 Flash-Lite 出题（压低思考开销，速度极快）
    // =========================================================================
    $t1 = microtime(true);
    $geminiModel = 'gemini-3.5-flash-lite';
    $geminiUrl   = "https://generativelanguage.googleapis.com/v1beta/models/{$geminiModel}:generateContent?key=" . urlencode(GEMINI_API_KEY);

    $genPrompt = <<<PROMPT
You are a Malaysian KSSR DLP primary school teacher.
Generate exactly {$count} multiple-choice questions for {$grade} {$subject}.
Target tags (distribute evenly): {$tagsListStr}
Difficulty: {$difficulty} (if Mixed, vary across Easy, Medium, Hard, KBAT).

Rules:
1. Follow Malaysia KSSR {$grade} {$subject} syllabus and use Malaysian units/currency (RM, cm, m, km, g, kg, ml, l).
2. Exactly 4 distinct options without "A./B./C./D." prefixes.
3. "correctIndex" is integer 0-3. "tag" must exactly match one of: {$tagsListStr}.
4. Keep "explanation" concise (1-2 sentences).
5. Return ONLY valid JSON:
{"questions":[{"tag":"","difficulty":"Easy|Medium|Hard|KBAT","questionText":"","options":["","","",""],"correctIndex":0,"explanation":""}]}
PROMPT;

    $thinkingOptions = [
        ['thinkingLevel' => 'MINIMAL'],
        ['thinkingBudget' => 0],
        null
    ];

    $geminiRes = null;
    $lastGeminiErr = null;
    foreach ($thinkingOptions as $tCfg) {
        $genConfig = [
            'temperature'      => 0.7,
            'maxOutputTokens'  => 4096,
            'responseMimeType' => 'application/json'
        ];
        if ($tCfg !== null) {
            $genConfig['thinkingConfig'] = $tCfg;
        }

        $geminiPayload = [
            'contents' => [
                ['role' => 'user', 'parts' => [['text' => $genPrompt]]]
            ],
            'generationConfig' => $genConfig
        ];

        try {
            $geminiRes = callJsonApi($geminiUrl, ['Content-Type: application/json'], $geminiPayload, 50);
            break;
        } catch (Exception $ex) {
            $lastGeminiErr = $ex;
            if ($ex->getCode() !== 400) {
                throw new Exception("[Stage 1: Gemini] " . $ex->getMessage());
            }
        }
    }

    if (!$geminiRes) {
        throw new Exception("[Stage 1: Gemini] " . ($lastGeminiErr ? $lastGeminiErr->getMessage() : "Unknown error"));
    }

    $parts      = $geminiRes['candidates'][0]['content']['parts'] ?? [];
    $geminiText = '';
    foreach ($parts as $p) {
        if (!empty($p['thought'])) continue;
        if (isset($p['text'])) {
            $geminiText .= $p['text'];
        }
    }
    if (!$geminiText) {
        throw new Exception("[Stage 1: Gemini] Returned an empty response.");
    }

    $draftData = extractJsonObject($geminiText);
    $draftList = $draftData['questions'] ?? [];
    if (empty($draftList)) {
        throw new Exception("[Stage 1: Gemini] Did not return any questions.");
    }
    $geminiTime = round(microtime(true) - $t1, 2);

    // =========================================================================
    // 阶段 2：Groq (OpenAI GPT-OSS 120B) 独立交叉审题与验算
    // =========================================================================
    $t2 = microtime(true);
    $groqModel    = 'openai/gpt-oss-120b';
    $groqUrl      = 'https://api.groq.com/openai/v1/chat/completions';
    $draftJsonStr = json_encode($draftList, JSON_UNESCAPED_UNICODE);

    $verifyPrompt = <<<PROMPT
Verify these drafted Malaysia KSSR {$grade} {$subject} MCQs:
{$draftJsonStr}

For each question:
1. Independently re-solve math or verify science accuracy and KSSR alignment.
2. Confirm "correctIndex" (0-3) matches the exact right option. If ANY error exists, fix it directly and set "verificationStatus" to "Verified & Corrected"; otherwise set "Verified".
3. Add a concise 1-sentence "reviewNotes" (max 25 words).

Return ONLY valid JSON:
{"questions":[{"tag":"","difficulty":"Easy|Medium|Hard|KBAT","questionText":"","options":["","","",""],"correctIndex":0,"explanation":"","verificationStatus":"Verified","reviewNotes":""}]}
PROMPT;

    $groqPayload = [
        'model'            => $groqModel,
        'temperature'      => 0.2,
        'reasoning_effort' => 'low',
        'response_format'  => ['type' => 'json_object'],
        'messages'         => [
            [
                'role'    => 'system',
                'content' => 'You are a KSSR STEM exam verifier. Reply with valid JSON object only.'
            ],
            [
                'role'    => 'user',
                'content' => $verifyPrompt
            ]
        ]
    ];

    $groqHeaders = [
        'Content-Type: application/json',
        'Authorization: Bearer ' . GROQ_API_KEY
    ];

    try {
        $groqRes = callJsonApi($groqUrl, $groqHeaders, $groqPayload, 50);
    } catch (Exception $ex) {
        if ($ex->getCode() === 400) {
            // 若模型不支持 reasoning_effort 参数则降级重试
            unset($groqPayload['reasoning_effort']);
            try {
                $groqRes = callJsonApi($groqUrl, $groqHeaders, $groqPayload, 50);
            } catch (Exception $ex2) {
                throw new Exception("[Stage 2: Groq] " . $ex2->getMessage());
            }
        } else {
            throw new Exception("[Stage 2: Groq] " . $ex->getMessage());
        }
    }

    $groqText = $groqRes['choices'][0]['message']['content'] ?? '';
    if (!$groqText) {
        throw new Exception("[Stage 2: Groq] Returned an empty response.");
    }

    $verifiedData = extractJsonObject($groqText);
    $finalList    = $verifiedData['questions'] ?? [];
    if (empty($finalList)) {
        throw new Exception("[Stage 2: Groq] Did not return verified questions.");
    }
    $groqTime = round(microtime(true) - $t2, 2);

    $sanitized = [];
    foreach ($finalList as $idx => $item) {
        $opts = is_array($item['options'] ?? null) ? array_values($item['options']) : [];
        if (count($opts) < 4) continue;
        $opts = array_slice(array_map('strval', $opts), 0, 4);

        $cIdx = intval($item['correctIndex'] ?? 0);
        if ($cIdx < 0 || $cIdx > 3) $cIdx = 0;

        $sanitized[] = [
            'tag'                => (string)($item['tag'] ?? $tags[$idx % count($tags)]),
            'difficulty'         => (string)($item['difficulty'] ?? 'Medium'),
            'questionText'       => trim((string)($item['questionText'] ?? '')),
            'options'            => $opts,
            'correctIndex'       => $cIdx,
            'explanation'        => trim((string)($item['explanation'] ?? '')),
            'verificationStatus' => (string)($item['verificationStatus'] ?? 'Verified'),
            'reviewNotes'        => trim((string)($item['reviewNotes'] ?? 'Independently verified for KSSR accuracy.'))
        ];
    }

    echo json_encode([
        'success'        => true,
        'generatorModel' => 'Gemini 3.5 Flash-Lite',
        'reviewerModel'  => 'GPT-OSS 120B (Groq)',
        'timings'        => [
            'geminiSec' => $geminiTime,
            'groqSec'   => $groqTime
        ],
        'questions'      => $sanitized
    ], JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}