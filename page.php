<?php require __DIR__.'/includes/bootstrap.php';
$slug = trim($_GET['slug'] ?? 'home');
$stmt=$pdo->prepare('SELECT * FROM pages WHERE slug=?'); $stmt->execute([$slug]); $p=$stmt->fetch();
if(!$p || $p['status']!=='published'){ http_response_code(404); ?>
<!doctype html><html><head><meta charset="utf-8"><title>Not found</title></head><body>Page not found</body></html>
<?php exit; } ?>
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title><?php echo htmlspecialchars($p['title']); ?></title>
  <style><?php echo $p['css']; ?></style>
</head>
<body>
<?php include __DIR__ . '/includes/navbar.php'; ?>
<?php echo $p['html']; ?>
<script><?php echo $p['js']; ?></script>
</body>
</html>
