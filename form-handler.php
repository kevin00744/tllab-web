<?php
header('Content-Type: application/json; charset=utf-8');
date_default_timezone_set('Asia/Taipei');
$dir = __DIR__ . DIRECTORY_SEPARATOR . 'data';
if (!is_dir($dir)) { mkdir($dir, 0777, true); }
$fname = $dir . DIRECTORY_SEPARATOR . 'submissions-' . date('Ymd') . '.txt';
$payload = [
  'time' => date('c'),
  'method' => $_SERVER['REQUEST_METHOD'],
  'data' => $_REQUEST
];
file_put_contents($fname, json_encode($payload, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES) . PHP_EOL, FILE_APPEND);
echo json_encode(['ok'=>true, 'message'=>'Saved locally.']);
?>