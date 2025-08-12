<?php
require __DIR__.'/../includes/bootstrap.php';
if(($_SERVER['REQUEST_METHOD'] ?? '')!=='POST'){ http_response_code(405); exit('Method Not Allowed'); }
if(($_POST['csrf'] ?? '') !== ($_SESSION['csrf'] ?? '')){ http_response_code(400); exit('Bad CSRF'); }
$u=trim($_POST['username'] ?? ''); $p=$_POST['password'] ?? '';
if($u===''||$p===''){ header('Location: /weblab/index.php?login=empty'); exit; }
$stmt=$pdo->prepare('SELECT id,username,password,role FROM users WHERE username=?');
$stmt->execute([$u]); $row=$stmt->fetch();
if($row && $row['password'] === $p){
  session_regenerate_id(true);
  $_SESSION['user']=['id'=>$row['id'],'username'=>$row['username'],'role'=>$row['role']];
  header('Location: /weblab/admin/index.php'); exit;
}
header('Location: /weblab/index.php?login=fail'); exit;
