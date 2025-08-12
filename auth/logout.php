<?php
require __DIR__.'/../includes/bootstrap.php';
if(($_SERVER['REQUEST_METHOD'] ?? '')!=='POST'){ http_response_code(405); exit('Method Not Allowed'); }
if(($_POST['csrf'] ?? '') !== ($_SESSION['csrf'] ?? '')){ http_response_code(400); exit('Bad CSRF'); }
$_SESSION=[];
if (ini_get('session.use_cookies')){
  $p=session_get_cookie_params();
  setcookie(session_name(),'',time()-42000,$p['path'],$p['domain'],$p['secure'],$p['httponly']);
}
session_destroy();
header('Location: /weblab/index.php?logout=1'); exit;
