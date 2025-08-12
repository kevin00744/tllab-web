<?php
define('DB_HOST','127.0.0.1'); define('DB_NAME','weblab'); define('DB_USER','root'); define('DB_PASS','');
date_default_timezone_set('Asia/Taipei');
try{
  $pdo=new PDO('mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset=utf8mb4',DB_USER,DB_PASS,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
}catch(Throwable $e){ http_response_code(500); die('DB error'); }
session_start(); if(!isset($_SESSION['csrf'])){ $_SESSION['csrf']=bin2hex(random_bytes(32)); }
function csrf_field(){ echo '<input type="hidden" name="csrf" value="'.htmlspecialchars($_SESSION['csrf']).'">'; }
function check_csrf(){ if(($_POST['csrf'] ?? '') !== ($_SESSION['csrf'] ?? '')){ http_response_code(400); die('Bad CSRF'); } }
function require_admin(){ if(!isset($_SESSION['user']) || !in_array($_SESSION['user']['role'],['admin','editor'])){ header('Location: /weblab/admin/login.php'); exit; } }
?>
