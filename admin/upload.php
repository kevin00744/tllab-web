<?php require __DIR__.'/config.php'; require_admin();
if(($_SERVER['REQUEST_METHOD'] ?? '')!=='POST'){ http_response_code(405); exit('Method'); }
if(($_POST['csrf'] ?? '') !== ($_SESSION['csrf'] ?? '')){ http_response_code(400); exit('Bad CSRF'); }
if(empty($_FILES['file']) || $_FILES['file']['error']!==UPLOAD_ERR_OK){ http_response_code(400); exit('No file'); }
$name = basename($_FILES['file']['name']);
$target = __DIR__ . '/../uploads/' . $name;
if(!preg_match('/\.(png|jpg|jpeg|gif|svg|webp)$/i',$name)){ http_response_code(400); exit('Bad type'); }
if(!move_uploaded_file($_FILES['file']['tmp_name'],$target)){ http_response_code(500); exit('Move fail'); }
$url = '/weblab/uploads/' . rawurlencode($name);
$pdo->prepare('INSERT INTO media (url,name,size,uploaded_by) VALUES (?,?,?,?)')
    ->execute([$url,$name,(int)($_FILES['file']['size'] ?? 0),$_SESSION['user']['id']]);
echo $url;
