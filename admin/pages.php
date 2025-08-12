<?php require __DIR__.'/config.php'; require_admin();
if(($_SERVER['REQUEST_METHOD'] ?? '')==='POST' && ($_POST['action'] ?? '')==='create'){ check_csrf();
  $title=trim($_POST['title'] ?? ''); $slug=trim($_POST['slug'] ?? '');
  if($title && $slug){
    $stmt=$pdo->prepare('INSERT INTO pages (title,slug,html,css,js,status,updated_by) VALUES (?,?,?,?,?,"draft",?)');
    $stmt->execute([$title,$slug,'<h1>'+ $title +'</h1>','','',$_SESSION['user']['id']]);
  }
  header('Location: pages.php'); exit;
}
if(($_GET['delete'] ?? '')){
  $id=(int)$_GET['delete']; $pdo->prepare('DELETE FROM pages WHERE id=?')->execute([$id]);
  header('Location: pages.php'); exit;
}
$pages=$pdo->query('SELECT * FROM pages ORDER BY updated_at DESC')->fetchAll();
?><!doctype html><html><head><meta charset="utf-8"><title>頁面管理</title>
<style>body{font-family:system-ui,Segoe UI,Roboto,Arial} .wrap{max-width:1000px;margin:6vh auto;padding:0 16px} table{width:100%;border-collapse:collapse} th,td{padding:8px;border-bottom:1px solid #eee} .btn{padding:6px 10px;border:1px solid #ddd;border-radius:8px;background:#fff;text-decoration:none}</style>
</head><body><div class="wrap"><h2>頁面管理</h2>
<form method="post" style="margin:12px 0;display:flex;gap:8px;align-items:center">
  <input type="hidden" name="action" value="create"><?php csrf_field(); ?>
  <input name="title" placeholder="Title" required style="padding:8px;border:1px solid #ddd;border-radius:8px">
  <input name="slug" placeholder="slug (e.g., home)" required style="padding:8px;border:1px solid #ddd;border-radius:8px">
  <button class="btn">新增</button>
</form>
<table><thead><tr><th>ID</th><th>Title</th><th>Slug</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead><tbody>
<?php foreach($pages as $p): ?>
<tr>
  <td><?php echo $p['id']; ?></td>
  <td><?php echo htmlspecialchars($p['title']); ?></td>
  <td><?php echo htmlspecialchars($p['slug']); ?></td>
  <td><?php echo $p['status']; ?></td>
  <td><?php echo $p['updated_at']; ?></td>
  <td>
    <a class="btn" href="editor.php?id=<?php echo $p['id']; ?>">Edit</a>
    <a class="btn" href="../page.php?slug=<?php echo urlencode($p['slug']); ?>" target="_blank">View</a>
    <a class="btn" href="pages.php?delete=<?php echo $p['id']; ?>" onclick="return confirm('Delete?')">Delete</a>
  </td>
</tr>
<?php endforeach; ?>
</tbody></table></div></body></html>
