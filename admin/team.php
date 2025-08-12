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
  $name = trim($_POST['name'] ?? '');
  $role = trim($_POST['role'] ?? '');
  $email= trim($_POST['email'] ?? '');
  $visible = isset($_POST['visible']) ? 1 : 0;
  $sort_no = (int)($_POST['sort_no'] ?? 0);
  $photo = upload_file('photo');
  $stmt = $pdo->prepare("INSERT INTO team(name, role, email, photo, visible, sort_no) VALUES(?,?,?,?,?,?)");
  $stmt->execute([$name,$role,$email,$photo,$visible,$sort_no]);
  header('Location: team.php'); exit;
}

if ($action==='update' && $id && $_SERVER['REQUEST_METHOD']==='POST') {
  check_csrf();
  $name = trim($_POST['name'] ?? '');
  $role = trim($_POST['role'] ?? '');
  $email= trim($_POST['email'] ?? '');
  $visible = isset($_POST['visible']) ? 1 : 0;
  $sort_no = (int)($_POST['sort_no'] ?? 0);
  $photo = upload_file('photo');
  if ($photo) {
    $stmt = $pdo->prepare("UPDATE team SET name=?, role=?, email=?, photo=?, visible=?, sort_no=? WHERE id=?");
    $stmt->execute([$name,$role,$email,$photo,$visible,$sort_no,$id]);
  } else {
    $stmt = $pdo->prepare("UPDATE team SET name=?, role=?, email=?, visible=?, sort_no=? WHERE id=?");
    $stmt->execute([$name,$role,$email,$visible,$sort_no,$id]);
  }
  header('Location: team.php'); exit;
}

if ($action==='delete' && $id) {
  $pdo->prepare("DELETE FROM team WHERE id=?")->execute([$id]);
  header('Location: team.php'); exit;
}

$member = null;
if (($action==='edit') && $id) {
  $stmt = $pdo->prepare("SELECT * FROM team WHERE id=?");
  $stmt->execute([$id]);
  $member = $stmt->fetch();
}
?><!doctype html><html><head><meta charset="utf-8"><title>Team | WebLab 管理</title><link rel="stylesheet" href="style.css"></head><body>
<div class="topbar"><div class="brand">Team 管理</div><div><a class="btn gray" href="index.php">回控制台</a></div></div>
<div class="container">
  <div class="card">
    <h3><?php echo $action==='edit' ? '編輯' : '新增'; ?> 成員</h3>
    <form method="post" enctype="multipart/form-data" action="team.php?a=<?php echo $action==='edit'?'update&id='.$id:'create'; ?>">
      <?php csrf_field(); ?>
      <label>姓名</label>
      <input type="text" name="name" value="<?php echo htmlspecialchars($member['name'] ?? ''); ?>" required>
      <label>職稱/角色</label>
      <input type="text" name="role" value="<?php echo htmlspecialchars($member['role'] ?? ''); ?>">
      <label>Email</label>
      <input type="email" name="email" value="<?php echo htmlspecialchars($member['email'] ?? ''); ?>">
      <label>照片（可選）</label>
      <input type="file" name="photo" accept="image/*">
      <label>排序</label>
      <input type="text" name="sort_no" value="<?php echo htmlspecialchars($member['sort_no'] ?? '0'); ?>">
      <label><input type="checkbox" name="visible" <?php echo !empty($member['visible'])?'checked':''; ?>> 顯示</label>
      <div style="margin-top:12px">
        <button class="btn"><?php echo $action==='edit'?'儲存變更':'新增'; ?></button>
        <?php if ($action==='edit'): ?><a class="btn gray" style="margin-left:8px" href="team.php">取消</a><?php endif; ?>
      </div>
    </form>
  </div>

  <div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h3>成員列表</h3>
      <a class="btn" href="team.php?a=create">＋ 新增</a>
    </div>
    <table class="table">
      <tr><th>ID</th><th>姓名</th><th>職稱</th><th>Email</th><th>顯示</th><th>排序</th><th>操作</th></tr>
      <?php foreach($pdo->query("SELECT * FROM team ORDER BY sort_no ASC, id DESC") as $row): ?>
      <tr>
        <td><?php echo $row['id']; ?></td>
        <td><?php echo htmlspecialchars($row['name']); ?></td>
        <td><?php echo htmlspecialchars($row['role']); ?></td>
        <td><?php echo htmlspecialchars($row['email']); ?></td>
        <td><?php echo $row['visible']?'是':'否'; ?></td>
        <td><?php echo (int)$row['sort_no']; ?></td>
        <td>
          <a class="btn gray" href="team.php?a=edit&id=<?php echo $row['id']; ?>">編輯</a>
          <a class="btn danger" href="team.php?a=delete&id=<?php echo $row['id']; ?>" onclick="return confirm('確定刪除?')">刪除</a>
        </td>
      </tr>
      <?php endforeach; ?>
    </table>
  </div>
</div>
</body></html>
