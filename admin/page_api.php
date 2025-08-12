<?php require __DIR__.'/config.php'; require_admin(); header('Content-Type: application/json');
if(($_SERVER['REQUEST_METHOD'] ?? '')!=='POST'){ echo json_encode(['ok'=>false,'msg'=>'Method']); exit; }
check_csrf();
$id=(int)($_POST['id'] ?? 0);
$html=$_POST['html'] ?? ''; $css=$_POST['css'] ?? ''; $js=$_POST['js'] ?? '';
$status=($_POST['status'] ?? '');
try{
  if($status==='published'){
    $stmt=$pdo->prepare('UPDATE pages SET html=?,css=?,js=?,status="published",updated_by=? WHERE id=?');
    $stmt->execute([$html,$css,$js,$_SESSION['user']['id'],$id]);
  }else{
    $stmt=$pdo->prepare('UPDATE pages SET html=?,css=?,js=?,updated_by=? WHERE id=?');
    $stmt->execute([$html,$css,$js,$_SESSION['user']['id'],$id]);
  }
  echo json_encode(['ok'=>true]);
}catch(Throwable $e){ echo json_encode(['ok'=>false,'msg'=>$e->getMessage()]); }
