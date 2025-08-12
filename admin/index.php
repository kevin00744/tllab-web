<?php require __DIR__.'/config.php'; require_admin(); $u=$_SESSION['user'] ?? null; ?>
<!doctype html><html><head><meta charset="utf-8"><title>WebLab Admin</title>
<style>body{font-family:system-ui,Segoe UI,Roboto,Arial} .wrap{max-width:980px;margin:6vh auto;padding:0 16px} .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px} .card{padding:16px;border:1px solid #eee;border-radius:16px;box-shadow:0 6px 24px rgba(0,0,0,.06)}</style>
</head><body><div class="wrap"><h1>WebLab 管理</h1><p>Hi, <?php echo htmlspecialchars($u['username'] ?? ''); ?></p>
<div class="grid">
  <a class="card" href="/weblab/admin/pages.php">頁面管理</a>
  <a class="card" href="/weblab/page.php?slug=home" target="_blank">預覽 Home</a>
</div></div></body></html>
