<?php
require_once __DIR__ . '/config.php';

if (!isset($_GET['key']) || $_GET['key'] !== CLEAR_SECRET_KEY) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Forbidden']);
    exit;
}

$db_file = __DIR__ . '/scores.db';

try {
    $db = new PDO('sqlite:' . $db_file);
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $count = $db->query('SELECT COUNT(*) FROM scores')->fetchColumn();
    $db->exec('DELETE FROM scores');
    $db->exec('DELETE FROM sqlite_sequence WHERE name="scores"');
    echo json_encode(['ok' => true, 'deleted' => (int)$count]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => $e->getMessage()]);
}
