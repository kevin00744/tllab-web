<?php
// 用法：在任一前台 PHP 檔案插入： include __DIR__.'/../admin/widgets/news_list.php';
require_once __DIR__.'/../config.php';
$limit = isset($limit) ? (int)$limit : 5;
$stmt = $pdo->prepare("SELECT id,title,body,cover,created_at FROM posts WHERE is_published=1 ORDER BY id DESC LIMIT ?");
$stmt->bindValue(1, $limit, PDO::PARAM_INT);
$stmt->execute();
$rows = $stmt->fetchAll();
?>
<div class="card">
  <h3>最新消息</h3>
  <?php if (!$rows): ?>
    <p>尚無公告。</p>
  <?php else: ?>
  <div class="grid">
    <?php foreach ($rows as $r): ?>
      <div class="card" style="padding:12px">
        <?php if (!empty($r['cover'])): ?>
          <img src="<?php echo htmlspecialchars($r['cover']); ?>" style="width:100%;border-radius:10px;margin-bottom:8px">
        <?php endif; ?>
        <div style="font-weight:700;margin-bottom:6px"><?php echo htmlspecialchars($r['title']); ?></div>
        <div style="font-size:14px;color:#b9c4d1"><?php echo nl2br(htmlspecialchars(mb_strimwidth(strip_tags($r['body']),0,180,'…','UTF-8'))); ?></div>
        <div style="font-size:12px;color:#8ea0b5;margin-top:6px"><?php echo htmlspecialchars($r['created_at']); ?></div>
      </div>
    <?php endforeach; ?>
  </div>
  <?php endif; ?>
</div>
