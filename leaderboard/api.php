<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

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
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'DB init failed: ' . $e->getMessage()]);
    exit;
}

// ── GET: return top 20 scores ──
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $stmt = $db->query('SELECT name, score, wave, created_at FROM scores ORDER BY score DESC LIMIT 20');
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['ok' => true, 'scores' => $rows]);
    exit;
}

// ── POST: submit a score ──
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $body = json_decode(file_get_contents('php://input'), true);

    $name  = isset($body['name'])  ? trim(strip_tags($body['name']))  : '';
    $score = isset($body['score']) ? (int)$body['score']              : 0;
    $wave  = isset($body['wave'])  ? (int)$body['wave']               : 1;

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
