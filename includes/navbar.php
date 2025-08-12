<?php require_once __DIR__.'/bootstrap.php'; ?>
<style>
.auth-navbar{position:fixed;top:12px;right:16px;z-index:9999;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif}
.auth-navbar .btn{padding:6px 12px;border:1px solid #ddd;border-radius:999px;background:#fff;cursor:pointer}
.auth-dropdown{position:absolute;right:0;margin-top:8px;padding:10px;background:#fff;border:1px solid #ddd;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.08);display:none;min-width:220px}
.auth-dropdown a{display:block;padding:6px 8px;text-decoration:none;color:#333;border-radius:8px}
.auth-dropdown a:hover{background:#f5f5f5}
.auth-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;backdrop-filter:blur(2px);background:rgba(0,0,0,.25);z-index:10000}
.auth-card{width:340px;background:#fff;border-radius:16px;padding:18px;box-shadow:0 12px 40px rgba(0,0,0,.15)}
.auth-card h3{margin:0 0 10px}
.auth-card label{display:block;margin-top:10px;font-size:14px}
.auth-card input{width:100%;padding:10px;border:1px solid #ddd;border-radius:10px}
.auth-card .actions{margin-top:12px;display:flex;gap:8px;justify-content:flex-end}
</style>
<div class="auth-navbar">
<?php if(!is_logged_in()): ?>
  <button class="btn" onclick="document.getElementById('auth-modal').style.display='flex'">Login</button>
<?php else: $u=current_user(); ?>
  <div style="position:relative">
    <button class="btn" onclick="document.getElementById('auth-dd').style.display=(document.getElementById('auth-dd').style.display==='block'?'none':'block')">
      <?php echo htmlspecialchars($u['username']); ?> ▾
    </button>
    <div id="auth-dd" class="auth-dropdown" onclick="event.stopPropagation()">
      <?php if(is_admin()): ?><a href="/weblab/admin/index.php">Admin</a><?php endif; ?>
      <a href="/weblab/auth/logout.php" onclick="event.preventDefault();document.getElementById('logout-form').submit();">Logout</a>
      <form id="logout-form" method="post" action="/weblab/auth/logout.php" style="display:none"><?php csrf_field(); ?></form>
    </div>
  </div>
  <script>document.addEventListener('click',()=>{const d=document.getElementById('auth-dd'); if(d) d.style.display='none';});</script>
<?php endif; ?>
</div>

<div id="auth-modal" class="auth-modal" onclick="if(event.target.id==='auth-modal') this.style.display='none'">
  <div class="auth-card" onclick="event.stopPropagation()">
    <h3>Sign in</h3>
    <form method="post" action="/weblab/auth/login.php">
      <?php csrf_field(); ?>
      <label>Username</label><input type="text" name="username" autocomplete="username" required>
      <label>Password</label><input type="password" name="password" autocomplete="current-password" required>
      <div class="actions"><button type="button" onclick="document.getElementById('auth-modal').style.display='none'">Cancel</button><button type="submit" class="btn">Login</button></div>
    </form>
  </div>
</div>
