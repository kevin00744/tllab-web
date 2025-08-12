<?php require __DIR__.'/config.php'; if (empty($_SESSION['admin'])) { header('Location: login.php'); exit; }

$action = $_GET['a'] ?? 'list';
$id = (int)($_GET['id'] ?? 0);

function upload_file($field) {
  if (!isset($_FILES[$field]) || $_FILES[$field]['error']!==UPLOAD_ERR_OK) return null;
  $ext = strtolower(pathinfo($_FILES[$field]['name'], PATHINFO_EXTENSION));
  $safe = bin2hex(random_bytes(6)).'.'.$ext;
  $dest = __DIR__.'/uploads/'.$safe;
  move_uploaded_file($_FILES[$field]['tmp_name'], $dest);
  return 'uploads/'.$safe;
}

if ($action==='create' && $_SERVER['REQUEST_METHOD']==='POST') {
  check_csrf();
  $title = trim($_POST['title'] ?? '');
  $body  = trim($_POST['body'] ?? '');
  $is_published = isset($_POST['is_published']) ? 1 : 0;
  $cover = upload_file('cover');
  $stmt = $pdo->prepare("INSERT INTO posts(title, body, cover, is_published) VALUES(?,?,?,?)");
  $stmt->execute([$title,$body,$cover,$is_published]);
  header('Location: posts.php'); exit;
}

if ($action==='update' && $id && $_SERVER['REQUEST_METHOD']==='POST') {
  check_csrf();
  $title = trim($_POST['title'] ?? '');
  $body  = trim($_POST['body'] ?? '');
  $is_published = isset($_POST['is_published']) ? 1 : 0;
  $cover = upload_file('cover');
  if ($cover) {
    $stmt = $pdo->prepare("UPDATE posts SET title=?, body=?, cover=?, is_published=? WHERE id=?");
    $stmt->execute([$title,$body,$cover,$is_published,$id]);
  } else {
    $stmt = $pdo->prepare("UPDATE posts SET title=?, body=?, is_published=? WHERE id=?");
    $stmt->execute([$title,$body,$is_published,$id]);
  }
  header('Location: posts.php'); exit;
}

if ($action==='delete' && $id) {
  $pdo->prepare("DELETE FROM posts WHERE id=?")->execute([$id]);
  header('Location: posts.php'); exit;
}

// fetch single if needed
$post = null;
if (($action==='edit') && $id) {
  $stmt = $pdo->prepare("SELECT * FROM posts WHERE id=?");
  $stmt->execute([$id]);
  $post = $stmt->fetch();
}

?><!doctype html><html><head><meta charset="utf-8"><title>Posts | WebLab 管理</title><link rel="stylesheet" href="style.css"></head><body>
<div class="topbar"><div class="brand">Posts 管理</div><div><a class="btn gray" href="index.php">回控制台</a></div></div>
<div class="container">
<?php if ($action==='list' || $action==='create' || $action==='edit'): ?>
  <div class="card">
    <h3><?php echo $action==='edit' ? '編輯' : '新增'; ?> Post</h3>
    <form method="post" enctype="multipart/form-data" action="posts.php?a=<?php echo $action==='edit'?'update&id='.$id:'create'; ?>">
      <?php csrf_field(); ?>
      <label>標題</label>
      <input type="text" name="title" value="<?php echo htmlspecialchars($post['title'] ?? ''); ?>" required>
      <label>內容（支援基本 HTML）</label>
      <textarea name="body" rows="8" required><?php echo htmlspecialchars($post['body'] ?? ''); ?></textarea>
      <label>封面（可選）</label>
      <input type="file" name="cover" accept="image/*">
      <label><input type="checkbox" name="is_published" <?php echo !empty($post['is_published'])?'checked':''; ?>> 發佈</label>
      <div style="margin-top:12px">
        <button class="btn"><?php echo $action==='edit'?'儲存變更':'新增'; ?></button>
        <?php if ($action==='edit'): ?><a class="btn gray" style="margin-left:8px" href="posts.php">取消</a><?php endif; ?>
      </div>
    </form>
  </div>
<?php endif; ?>

  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h3>Post 列表</h3>
      <a class="btn" href="posts.php?a=create">＋ 新增</a>
    </div>
    <table class="table">
      <tr><th>ID</th><th>標題</th><th>建立時間</th><th>發佈</th><th>操作</th></tr>
      <?php foreach($pdo->query("SELECT * FROM posts ORDER BY id DESC") as $row): ?>
      <tr>
        <td><?php echo $row['id']; ?></td>
        <td><?php echo htmlspecialchars($row['title']); ?></td>
        <td><?php echo $row['created_at']; ?></td>
        <td><?php echo $row['is_published']?'是':'否'; ?></td>
        <td>
          <a class="btn gray" href="posts.php?a=edit&id=<?php echo $row['id']; ?>">編輯</a>
          <a class="btn danger" href="posts.php?a=delete&id=<?php echo $row['id']; ?>" onclick="return confirm('確定刪除?')">刪除</a>
        </td>
      </tr>
      <?php endforeach; ?>
    </table>
  </div>
</div>
</body></html>
