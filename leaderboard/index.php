<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CANNON BLASTER — Leaderboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Share+Tech+Mono&display=swap">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background: #f5f6fa;
      font-family: 'Share Tech Mono', monospace;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px 20px 60px;
    }

    /* ── HEADER ── */
    .header {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 40px;
    }

    .back {
      align-self: flex-start;
      position: fixed;
      top: 18px;
      left: 20px;
      font-family: 'Orbitron', monospace;
      font-size: 0.55rem;
      letter-spacing: 2px;
      color: #334466;
      text-decoration: none;
      opacity: 0.5;
      transition: opacity 0.2s;
    }
    .back:hover { opacity: 1; color: #cc4400; }

    .site-label {
      font-family: 'Orbitron', monospace;
      font-size: 0.55rem;
      letter-spacing: 4px;
      color: #33446655;
      margin-bottom: 8px;
    }

    h1 {
      font-family: 'Orbitron', monospace;
      font-size: 2.4rem;
      font-weight: 900;
      color: #cc3300;
      letter-spacing: 8px;
      text-shadow: 0 0 30px #ff6b1a22;
    }

    .subtitle {
      font-family: 'Share Tech Mono', monospace;
      font-size: 0.65rem;
      color: #88aacc;
      letter-spacing: 3px;
      margin-top: 6px;
    }

    /* ── SCORE LIST ── */
    .score-list {
      width: 100%;
      max-width: 560px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .score-card {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 20px;
      border-radius: 8px;
      background: #fff;
      border: 1px solid #e0e4f0;
      box-shadow: 0 2px 8px #00000008;
      transition: transform 0.15s, box-shadow 0.15s;
      text-decoration: none;
    }
    .score-card:hover {
      transform: translateX(4px);
      box-shadow: 0 4px 18px #00000014;
    }

    /* Top 3 special styles */
    .score-card.r1 { border-color: #d4a017; background: linear-gradient(100deg, #fffbe8 0%, #fff 60%); }
    .score-card.r2 { border-color: #ababab; background: linear-gradient(100deg, #f4f4f4 0%, #fff 60%); }
    .score-card.r3 { border-color: #b07040; background: linear-gradient(100deg, #fff2e8 0%, #fff 60%); }

    /* Rank badge */
    .rank-badge {
      flex-shrink: 0;
      width: 34px;
      height: 34px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Orbitron', monospace;
      font-size: 0.7rem;
      font-weight: 900;
      color: #fff;
      background: #ccd0e0;
    }
    .r1 .rank-badge { background: linear-gradient(135deg, #f5c518, #c89000); box-shadow: 0 2px 8px #d4a01744; }
    .r2 .rank-badge { background: linear-gradient(135deg, #d4d4d4, #999);    box-shadow: 0 2px 8px #aaa4; }
    .r3 .rank-badge { background: linear-gradient(135deg, #d4905a, #8b4a1e); box-shadow: 0 2px 8px #b0704044; }

    /* Player info */
    .player-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow: hidden;
    }

    .player-name {
      font-family: 'Orbitron', monospace;
      font-size: 0.8rem;
      letter-spacing: 1px;
      color: #334466;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .r1 .player-name { color: #8a6000; }
    .r2 .player-name { color: #555; }
    .r3 .player-name { color: #7a4020; }

    .player-date {
      font-family: 'Share Tech Mono', monospace;
      font-size: 0.58rem;
      color: #aab;
      letter-spacing: 1px;
    }

    /* Score */
    .player-score {
      flex-shrink: 0;
      font-family: 'Orbitron', monospace;
      font-size: 1.1rem;
      font-weight: 900;
      color: #cc4400;
      letter-spacing: 1px;
    }
    .r1 .player-score { font-size: 1.3rem; color: #c08000; }
    .r2 .player-score { font-size: 1.2rem; }
    .r3 .player-score { font-size: 1.15rem; }

    /* Wave badge */
    .wave-badge {
      flex-shrink: 0;
      padding: 3px 8px;
      border-radius: 20px;
      background: #eef2ff;
      border: 1px solid #c0ccee;
      font-family: 'Orbitron', monospace;
      font-size: 0.5rem;
      letter-spacing: 1px;
      color: #3355bb;
    }
    .r1 .wave-badge, .r2 .wave-badge, .r3 .wave-badge {
      background: transparent;
    }

    /* ── DIVIDER after top 3 ── */
    .list-divider {
      height: 1px;
      background: linear-gradient(90deg, transparent, #dde0ee, transparent);
      margin: 6px 0;
    }

    /* ── EMPTY ── */
    .empty {
      font-family: 'Orbitron', monospace;
      font-size: 0.7rem;
      letter-spacing: 3px;
      color: #bbb;
      margin: 40px 0;
      text-align: center;
    }

    /* ── PLAY BUTTON ── */
    .play-link {
      margin-top: 40px;
      padding: 14px 44px;
      background: #ff6b1a;
      color: #fff;
      font-family: 'Orbitron', monospace;
      font-size: 0.75rem;
      letter-spacing: 4px;
      text-decoration: none;
      border-radius: 6px;
      box-shadow: 0 6px 22px #ff6b1a44;
      transition: background 0.2s, box-shadow 0.2s, transform 0.15s;
    }
    .play-link:hover {
      background: #cc4400;
      box-shadow: 0 8px 28px #cc440044;
      transform: translateY(-2px);
    }

    /* ── REFRESH ── */
    .refresh-hint {
      margin-top: 16px;
      font-size: 0.55rem;
      letter-spacing: 2px;
      color: #bbc;
    }
  </style>
</head>
<body>
  <a class="back" href="../">← BACK</a>

  <div class="header">
    <div class="site-label">CANNON BLASTER</div>
    <h1>LEADERBOARD</h1>
    <div class="subtitle">TOP SCORES OF ALL TIME</div>
  </div>

<?php
$db_file = __DIR__ . '/scores.db';
$scores  = [];

if (file_exists($db_file)) {
    try {
        $db = new PDO('sqlite:' . $db_file);
        $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $stmt = $db->query('SELECT name, score, wave, created_at FROM scores ORDER BY score DESC LIMIT 20');
        $scores = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) { /* fall through */ }
}

if (empty($scores)): ?>
  <p class="empty">NO SCORES YET — BE THE FIRST!</p>
<?php else: ?>
  <div class="score-list">
<?php foreach ($scores as $i => $row):
  $rank    = $i + 1;
  $rClass  = $rank <= 3 ? " r{$rank}" : '';
  $name    = htmlspecialchars($row['name']);
  $score   = number_format((int)$row['score']);
  $wave    = (int)$row['wave'];
  $date    = htmlspecialchars(substr($row['created_at'], 0, 10));
?>
    <?php if ($rank === 4): ?><div class="list-divider"></div><?php endif; ?>
    <div class="score-card<?= $rClass ?>">
      <div class="rank-badge"><?= $rank ?></div>
      <div class="player-info">
        <div class="player-name"><?= $name ?></div>
        <div class="player-date"><?= $date ?></div>
      </div>
      <div class="wave-badge">W<?= $wave ?></div>
      <div class="player-score"><?= $score ?></div>
    </div>
<?php endforeach; ?>
  </div>
<?php endif; ?>

  <a class="play-link" href="../">PLAY GAME</a>
  <div class="refresh-hint">REFRESH TO UPDATE</div>
</body>
</html>
