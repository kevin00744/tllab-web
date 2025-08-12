<?php
/* Session + PDO + helpers */
if (session_status() === PHP_SESSION_NONE) { session_start(); }
if (!isset($_SESSION['csrf'])) { $_SESSION['csrf'] = bin2hex(random_bytes(32)); }

$DB_HOST = '127.0.0.1';
$DB_NAME = 'weblab';
$DB_USER = 'root';
$DB_PASS = '';

try {
  $pdo = new PDO("mysql:host=$DB_HOST;dbname=$DB_NAME;charset=utf8mb4",$DB_USER,$DB_PASS,[
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
} catch (Throwable $e) { http_response_code(500); die('DB connect error'); }

function csrf_field(){ echo '<input type="hidden" name="csrf" value="'.htmlspecialchars($_SESSION['csrf']).'">'; }
function is_logged_in(){ return isset($_SESSION['user']); }
function is_admin(){ return isset($_SESSION['user']) && in_array($_SESSION['user']['role'], ['admin','editor']); }
function current_user(){ return $_SESSION['user'] ?? null; }
?>
