<?php
// 用法：在 team.php 適當位置插入： include __DIR__.'/../admin/widgets/team_grid.php';
require_once __DIR__.'/../config.php';
$rows = $pdo->query("SELECT name,role,email,photo FROM team WHERE visible=1 ORDER BY sort_no ASC, id DESC")->fetchAll();
?>
<div class="grid">
  <?php foreach($rows as $r): ?>
  <div class="card" style="text-align:center">
    <?php if (!empty($r['photo'])): ?>
      <img src="<?php echo htmlspecialchars($r['photo']); ?>" style="width:120px;height:120px;object-fit:cover;border-radius:999px;margin:0 auto 8px auto">
    <?php endif; ?>
    <div style="font-weight:700"><?php echo htmlspecialchars($r['name']); ?></div>
    <div style="color:#9fb2c7"><?php echo htmlspecialchars($r['role']); ?></div>
    <?php if (!empty($r['email'])): ?><div style="font-size:12px;margin-top:4px"><a href="mailto:<?php echo htmlspecialchars($r['email']); ?>"><?php echo htmlspecialchars($r['email']); ?></a></div><?php endif; ?>
  </div>
  <?php endforeach; ?>
</div>
