<?php require __DIR__.'/config.php';
if(($_SERVER['REQUEST_METHOD'] ?? '')==='POST'){
  check_csrf();
  $u=trim($_POST['user'] ?? ''); $p=$_POST['pass'] ?? '';
  if($u && $p){
    $stmt=$pdo->prepare('SELECT id,username,password,role FROM users WHERE username=?');
    $stmt->execute([$u]); $row=$stmt->fetch();
    if($row && $row['password'] === $p && in_array($row['role'],['admin','editor'])){
      session_regenerate_id(true);
      $_SESSION['user']=['id'=>$row['id'],'username'=>$row['username'],'role'=>$row['role']];
      header('Location: /weblab/admin/index.php'); exit;
    } else {
      $err='帳號或密碼錯誤，或權限不足';
    }
  } else { $err='請輸入帳號與密碼'; }
}
?><!doctype html><html><head><meta charset="utf-8"><title>WebLab 管理登入</title>
<style>body{font-family:system-ui,Segoe UI,Roboto,Arial} .card{max-width:380px;margin:10vh auto;padding:24px;border:1px solid #eee;border-radius:16px;box-shadow:0 6px 24px rgba(0,0,0,.06)} .btn{padding:8px 14px;border:1px solid #ddd;border-radius:10px;background:#fff;cursor:pointer} .flash{background:#fff0f0;border:1px solid #ffd0d0;padding:8px 12px;border-radius:8px;margin-bottom:10px}</style>
</head><body><div class="card"><h2>管理登入</h2>
<?php if(!empty($err)) echo '<div class="flash">'.$err.'</div>'; ?>
<form method="post"><?php csrf_field(); ?><label>帳號</label><input name="user" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px"><label>密碼</label><input type="password" name="pass" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px"><div style="margin-top:12px"><button class="btn">登入</button></div></form>
<div style="margin-top:12px;color:#777">預設：admin / changeme123</div></div></body></html>
