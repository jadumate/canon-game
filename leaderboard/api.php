<?php
require_once __DIR__ . '/config.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// Remove anything outside printable ASCII (0x20–0x7E), then collapse extra spaces
function sanitize_input(string $s): string {
    $s = preg_replace('/[^\x20-\x7E]/', '', $s); // strip non-printable / unicode
    $s = preg_replace('/\s+/', ' ', $s);           // collapse whitespace
    return trim($s);
}

$db_file = __DIR__ . '/scores.db';

try {
    $db = new PDO('sqlite:' . $db_file);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $db->exec('CREATE TABLE IF NOT EXISTS scores (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL,
        score      INTEGER NOT NULL,
        wave       INTEGER NOT NULL DEFAULT 1,
        created_at TEXT    NOT NULL DEFAULT ""
    )');
    $db->exec('CREATE TABLE IF NOT EXISTS rate_limit (
        ip         TEXT    NOT NULL,
        ts         INTEGER NOT NULL
    )');
    $db->exec('CREATE TABLE IF NOT EXISTS used_tokens (
        nonce      TEXT    PRIMARY KEY,
        used_at    INTEGER NOT NULL
    )');
    $db->exec('CREATE TABLE IF NOT EXISTS meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )');
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Server error']);
    exit;
}

// ── Daily score decay: -1% per day, triggered on leaderboard fetch ──
function maybe_decay_scores(PDO $db): void {
    $today = date('Y-m-d');
    $stmt  = $db->prepare('SELECT value FROM meta WHERE key = ?');
    $stmt->execute(['last_process_date']);
    $last  = $stmt->fetchColumn();
    if ($last === $today) return;
    $db->exec('UPDATE scores SET score = MAX(1, CAST(score * 0.99 AS INTEGER))');
    $db->prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')->execute(['last_process_date', $today]);
}

// ── GET: issue a one-time submit token, or return top 20 scores ──
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (isset($_GET['action']) && $_GET['action'] === 'token') {
        // Clean expired tokens (older than 2 hours)
        $db->exec('DELETE FROM used_tokens WHERE used_at < ' . (time() - 7200));
        $nonce = bin2hex(random_bytes(16));
        $token = hash_hmac('sha256', $nonce, MAGIC_KEY);
        echo json_encode(['ok' => true, 'nonce' => $nonce, 'token' => $token]);
        exit;
    }
    maybe_decay_scores($db);
    $stmt = $db->query('SELECT name, score, wave, created_at FROM scores ORDER BY score DESC LIMIT 20');
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['ok' => true, 'scores' => $rows]);
    exit;
}

// ── POST: submit a score ──
if ($_SERVER['REQUEST_METHOD'] === 'POST') {

    // Rate limit: max 5 submissions per IP per minute
    $ip  = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    $now = time();
    $db->exec("DELETE FROM rate_limit WHERE ts < " . ($now - 60));
    $count_stmt = $db->prepare('SELECT COUNT(*) FROM rate_limit WHERE ip = ?');
    $count_stmt->execute([$ip]);
    if ((int)$count_stmt->fetchColumn() >= 5) {
        http_response_code(429);
        echo json_encode(['ok' => false, 'error' => 'Too many submissions. Please wait.']);
        exit;
    }
    $db->prepare('INSERT INTO rate_limit (ip, ts) VALUES (?, ?)')->execute([$ip, $now]);

    $body = json_decode(file_get_contents('php://input'), true);
    if (!is_array($body)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid request']);
        exit;
    }

    // Verify HMAC token — proves request came from a real game session
    $nonce = isset($body['nonce']) ? (string)$body['nonce'] : '';
    $token = isset($body['token']) ? (string)$body['token'] : '';
    // Strict format: nonce must be 32 hex chars, token must be 64 hex chars
    if (!preg_match('/^[0-9a-f]{32}$/', $nonce) || !preg_match('/^[0-9a-f]{64}$/', $token)) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Invalid token']);
        exit;
    }
    $expected = hash_hmac('sha256', $nonce, MAGIC_KEY);
    if (!hash_equals($expected, $token)) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Invalid token']);
        exit;
    }
    // Reject replayed nonces (one-time use)
    $used_stmt = $db->prepare('SELECT COUNT(*) FROM used_tokens WHERE nonce = ?');
    $used_stmt->execute([$nonce]);
    if ((int)$used_stmt->fetchColumn() > 0) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'Token already used']);
        exit;
    }
    $db->prepare('INSERT INTO used_tokens (nonce, used_at) VALUES (?, ?)')->execute([$nonce, time()]);

    $raw_name = isset($body['name']) ? substr((string)$body['name'], 0, 80) : '';
    $name     = sanitize_input($raw_name);
    $score    = isset($body['score']) ? (int)$body['score'] : 0;
    $wave     = isset($body['wave'])  ? (int)$body['wave']  : 1;

    if ($name === '' || strlen($name) > 20) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid name']);
        exit;
    }
    if ($score < 0 || $score > 9999999) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid score']);
        exit;
    }
    if ($wave < 1 || $wave > 9999) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Invalid wave']);
        exit;
    }

    $stmt = $db->prepare('INSERT INTO scores (name, score, wave, created_at) VALUES (?, ?, ?, datetime("now"))');
    $stmt->execute([$name, $score, $wave]);

    // Return rank of the submitted score
    $rank_stmt = $db->prepare('SELECT COUNT(*) FROM scores WHERE score > ?');
    $rank_stmt->execute([$score]);
    $rank = (int)$rank_stmt->fetchColumn() + 1;

    $stmt2 = $db->query('SELECT name, score, wave, created_at FROM scores ORDER BY score DESC LIMIT 20');
    $scores = $stmt2->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['ok' => true, 'rank' => $rank, 'scores' => $scores]);
    exit;
}

http_response_code(405);
echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
