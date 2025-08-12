<?php require __DIR__.'/config.php'; require_admin();
$id=(int)($_GET['id'] ?? 0);
$stmt=$pdo->prepare('SELECT * FROM pages WHERE id=?'); $stmt->execute([$id]); $page=$stmt->fetch();
if(!$page){ http_response_code(404); die('Page not found'); }
?><!doctype html><html><head><meta charset="utf-8"><title>編輯：<?php echo htmlspecialchars($page['title']); ?></title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link href="https://unpkg.com/grapesjs/dist/css/grapes.min.css" rel="stylesheet">
<style>body,html{height:100%;margin:0} #gjs{height:calc(100vh - 52px);border-top:1px solid #e5e5e5} .topbar{display:flex;gap:8px;align-items:center;padding:8px;border-bottom:1px solid #eee;font-family:system-ui,Segoe UI,Roboto,Arial} .btn{padding:6px 10px;border:1px solid #ddd;border-radius:8px;background:#fff;cursor:pointer}</style>
</head><body>
<div class="topbar">
  <strong>編輯：</strong> <?php echo htmlspecialchars($page['title']); ?>
  <button class="btn" id="btnSave">儲存</button>
  <button class="btn" id="btnPublish">發佈</button>
  <a class="btn" href="pages.php">返回清單</a>
  <a class="btn" href="../page.php?slug=<?php echo urlencode($page['slug']); ?>" target="_blank">前台預覽</a>
</div>
<div id="gjs"></div>
<script src="https://unpkg.com/grapesjs"></script>
<script>
const editor = grapesjs.init({
  container: '#gjs',
  fromElement: false,
  height: '100%',
  storageManager: false,
  plugins: [],
});
// Load existing
editor.setComponents(<?php echo json_encode($page['html'] or '<h1>'+ $page['title'] +'</h1>'); ?>);
editor.setStyle(<?php echo json_encode($page['css'] or ''); ?>);
// Save
async function save(status){
  const html = editor.getHtml();
  const css  = editor.getCss();
  const js   = editor.getJs();
  const body = new FormData();
  body.append('csrf','<?php echo $_SESSION['csrf']; ?>');
  body.append('id','<?php echo $page['id']; ?>');
  body.append('html',html); body.append('css',css); body.append('js',js);
  if(status) body.append('status',status);
  const r = await fetch('page_api.php', { method:'POST', body });
  const j = await r.json();
  alert(j.ok ? (status ? '已發佈' : '已儲存') : ('錯誤：'+j.msg));
}
document.getElementById('btnSave').onclick = ()=>save('');
document.getElementById('btnPublish').onclick = ()=>save('published');
</script>
</body></html>
