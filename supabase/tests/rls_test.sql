-- =============================================================================
-- TL Lab Hub — 權限與功能測試（由 scripts/test-db.sh 執行）
-- 失敗時 raise exception 中止
-- =============================================================================

-- 模擬登入：PI(admin)、張家豪(member)、楊子豪(校友 viewer)、未登記的新帳號
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'PI@tllab.example', '{"full_name": "Tsung-Lin Liu"}'),
  ('aaaaaaaa-0000-0000-0000-000000000005', 'chiahao.chang@tllab.example', '{"avatar_url": "https://example.com/a.png"}'),
  ('aaaaaaaa-0000-0000-0000-000000000013', 'tzuhao.yang@alumni.example', '{}'),
  ('aaaaaaaa-0000-0000-0000-000000000099', 'stranger@gmail.com', '{"name": "Stranger"}');

do $$
begin
  assert (select user_id from members where id = '10000000-0000-0000-0000-000000000001')
         = 'aaaaaaaa-0000-0000-0000-000000000001', 'PI 應以 email（不分大小寫）綁定';
  assert (select avatar_url from members where id = '10000000-0000-0000-0000-000000000005')
         = 'https://example.com/a.png', '綁定時應帶入頭像';
  assert (select app_role from members where email = 'stranger@gmail.com') = 'viewer', '未登記帳號應為 viewer';
  assert (select name from members where email = 'stranger@gmail.com') = 'Stranger';
end $$;

-- ---------------------------------------------------------------------------
-- anon：完全不可讀
-- ---------------------------------------------------------------------------
set role anon;
do $$
begin
  begin
    perform 1 from members;
    assert (select count(*) from members) = 0, 'anon 不應讀到成員';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- viewer（校友）：可讀不可寫
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000013';
do $$
declare n int;
begin
  assert (select count(*) from projects) = 6, 'viewer 應可讀所有專案';
  assert (select count(*) from v_upcoming_deadlines) > 0, 'viewer 應可讀 deadline 檢視';
  begin
    insert into tasks (title) values ('viewer 不該能新增');
    raise exception 'viewer 不應可新增任務';
  exception when insufficient_privilege then null;
  end;
  update projects set progress = 99 where id = '20000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  assert n = 0, 'viewer 不應可修改專案';
end $$;

-- ---------------------------------------------------------------------------
-- member（張家豪，AO 專案負責人）
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000005';
do $$
declare
  n int;
  v_task uuid;
begin
  -- 自己負責的專案可改
  update projects set progress = 70 where id = '20000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  assert n = 1, 'member 應可修改自己負責的專案';

  -- 無關的專案不可改
  update projects set progress = 99 where id = '20000000-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  assert n = 0, 'member 不應可修改無關專案';

  -- 無關的任務不可改（顯微鏡控制軟體重構的任務）
  update tasks set status = 'done' where id = '50000000-0000-0000-0000-000000000014';
  get diagnostics n = row_count;
  assert n = 0, 'member 不應可修改無關任務';

  -- 自己專案下的任務可改，完成時自動填 completed_at
  update tasks set status = 'done' where id = '50000000-0000-0000-0000-000000000003';
  assert (select completed_at is not null from tasks where id = '50000000-0000-0000-0000-000000000003');

  -- 新增任務並指派他人
  insert into tasks (title, project_id, due_date) values ('測試任務', null, lab_today() + 1)
    returning id into v_task;
  assert (select created_by from tasks where id = v_task) = '10000000-0000-0000-0000-000000000005',
    'created_by 應自動填入';
  insert into task_assignees (task_id, member_id) values (v_task, '10000000-0000-0000-0000-000000000006');

  -- 不可冒名建立
  begin
    insert into tasks (title, created_by) values ('冒名', '10000000-0000-0000-0000-000000000001');
    raise exception '不應可冒名建立任務';
  exception when insufficient_privilege then null;
  end;

  -- 可改自己的個人資料，但不可提升權限
  update members set bio = '光學設計' where id = '10000000-0000-0000-0000-000000000005';
  get diagnostics n = row_count;
  assert n = 1, 'member 應可修改自己的資料';
  begin
    update members set app_role = 'admin' where id = '10000000-0000-0000-0000-000000000005';
    raise exception '不應可自行提升權限';
  exception when insufficient_privilege then null;
  end;
  update members set bio = 'x' where id = '10000000-0000-0000-0000-000000000004';
  get diagnostics n = row_count;
  assert n = 0, 'member 不應可修改他人資料';

  -- 無關會議的 Action item 不可轉 Task（會議 3 未出席、也非被指派者）
  begin
    perform convert_action_item_to_task(
      (select id from action_items where content = '寄送類器官樣本規格給合作實驗室'));
    raise exception '不應可轉換無關的 Action item';
  exception when insufficient_privilege then null;
  end;

  -- 活動紀錄
  assert exists (select 1 from activity_log
                  where actor_id = '10000000-0000-0000-0000-000000000005'
                    and entity_type = 'project' and changes ? 'progress'), '應記錄專案修改';
  assert exists (select 1 from activity_log
                  where entity_id = v_task and changes ? 'assignee_added'), '應記錄指派';

  -- 搜尋（中英文）
  assert exists (select 1 from search_all('斑馬魚') where entity_type = 'project'), '中文搜尋';
  assert exists (select 1 from search_all('trackformer') where entity_type = 'publication'), '英文不分大小寫搜尋';
  assert exists (select 1 from search_all('Napari') where entity_type = 'software_tool');
  assert not exists (select 1 from search_all('   ')), '空字串不應回傳結果';
  assert not exists (select 1 from search_all('100%')), '% 應被跳脫';

  -- Dashboard
  assert (dashboard_kpis() ->> 'active_projects')::int = 3, 'KPI 進行中專案數';
  assert (dashboard_kpis() ->> 'tasks_overdue')::int >= 1, 'KPI 逾期任務';
  assert (dashboard_kpis() ->> 'publications_under_submission')::int = 2, 'KPI 投稿中';
  assert (select sum(total) from v_publication_stage_counts) = 8;
end $$;

-- ---------------------------------------------------------------------------
-- admin（PI）
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$
declare
  n int;
  v_item uuid;
  v_task uuid;
begin
  update projects set status = 'active' where id = '20000000-0000-0000-0000-000000000005';
  get diagnostics n = row_count;
  assert n = 1, 'admin 應可修改任何專案';

  update members set app_role = 'member' where email = 'stranger@gmail.com';
  get diagnostics n = row_count;
  assert n = 1, 'admin 應可調整權限';

  -- Action item 一鍵轉 Task
  select id into v_item from action_items where content = '寄送類器官樣本規格給合作實驗室';
  v_task := convert_action_item_to_task(v_item);
  assert (select task_id from action_items where id = v_item) = v_task;
  assert (select project_id from tasks where id = v_task) is not null, '任務應繼承會議關聯專案';
  assert exists (select 1 from task_assignees where task_id = v_task
                    and member_id = '10000000-0000-0000-0000-000000000007'), '任務應繼承指派對象';
  assert convert_action_item_to_task(v_item) = v_task, '重複轉換應回傳同一任務';
end $$;

reset role;
reset request.jwt.claim.sub;

-- 至少保留一位 Admin
do $$
begin
  update members set app_role = 'member' where id = '10000000-0000-0000-0000-000000000002';
  begin
    update members set app_role = 'member' where id = '10000000-0000-0000-0000-000000000001';
    raise exception '應阻擋移除最後一位 Admin';
  exception when raise_exception then
    if sqlerrm not like '%至少需要保留一位 Admin%' then raise; end if;
  end;
end $$;

-- Storage bucket 建立
do $$
begin
  assert (select count(*) from storage.buckets where id in ('avatars', 'attachments')) = 2;
end $$;

-- ---------------------------------------------------------------------------
-- 邀請碼註冊
-- ---------------------------------------------------------------------------
create temp table t_codes (k text primary key, code text);
grant all on t_codes to authenticated, service_role;

-- 非 Admin 不能產生邀請碼；Admin 可以
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000013';  -- viewer
do $$
begin
  begin
    perform create_invite_code();
    raise exception 'viewer 不應可產生邀請碼';
  exception when insufficient_privilege then null;
  end;
  assert (select count(*) from invite_codes) = 0, 'viewer 不應看到邀請碼';
end $$;

set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';  -- PI (admin)
do $$
declare v text;
begin
  v := create_invite_code(p_position => 'master', p_note => '2026 新生');
  assert v ~ '^TL-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$', '邀請碼格式：' || v;
  insert into t_codes values ('single', v);
  insert into t_codes values ('multi', create_invite_code(p_max_uses => 2));
  insert into t_codes values ('locked', create_invite_code(p_email => 'Only.Me@example.com'));
  insert into t_codes values ('admin', create_invite_code(p_app_role => 'admin'));
  insert into t_codes values ('expired', create_invite_code());
  -- 綁定既有成員（示範資料中尚未登入的林冠宇）
  insert into t_codes values ('bind', create_invite_code(p_member_id => '10000000-0000-0000-0000-000000000003'));
  assert (select count(*) from invite_codes) = 6, 'admin 應可看到邀請碼';
  assert not exists (select 1 from invite_codes where code_hash like '%' || 'TL-' || '%'), '不應存原文';
  assert (select created_by from invite_codes where note = '2026 新生') = '10000000-0000-0000-0000-000000000001';
end $$;
reset role;
reset request.jwt.claim.sub;
update invite_codes set expires_at = now() - interval '1 second'
 where code_hash = encode(sha256(convert_to(normalize_invite_code((select code from t_codes where k = 'expired')), 'UTF8')), 'hex');

-- 一般使用者不可直接呼叫伺服器端函式
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$
begin
  begin
    perform claim_invite_code((select code from t_codes where k = 'single'), 'x@example.com');
    raise exception 'authenticated 不應可呼叫 claim_invite_code';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
reset request.jwt.claim.sub;

-- 模擬網頁伺服器端註冊流程（service_role）
create function pg_temp.signup(p_code text, p_email text) returns uuid language plpgsql as $$
declare v_invite uuid; v_user uuid;
begin
  set local role service_role;
  v_invite := claim_invite_code(p_code, p_email);
  reset role;
  insert into auth.users (email) values (p_email) returning id into v_user;  -- auth.admin.createUser
  set local role service_role;
  perform complete_invite_signup(v_invite, v_user);
  reset role;
  return v_user;
end $$;

do $$
declare
  v_user uuid;
  v_invite uuid;
  n int;
begin
  -- 單次邀請碼：使用者輸入小寫、少了連字號也能通過；套用職稱與權限
  v_user := pg_temp.signup(lower(replace((select code from t_codes where k = 'single'), '-', ' ')), 'Newbie@Example.com');
  assert (select app_role from members where user_id = v_user) = 'member', '應套用邀請碼權限';
  assert (select position from members where user_id = v_user) = 'master', '應套用邀請碼職稱';
  assert exists (select 1 from invite_redemptions where user_id = v_user), '應記錄使用紀錄';

  -- 已用完
  begin
    perform pg_temp.signup((select code from t_codes where k = 'single'), 'second@example.com');
    raise exception '單次邀請碼不應可重複使用';
  exception when invalid_parameter_value then null;
  end;

  -- 多次邀請碼
  perform pg_temp.signup((select code from t_codes where k = 'multi'), 'm1@example.com');
  perform pg_temp.signup((select code from t_codes where k = 'multi'), 'm2@example.com');
  begin
    perform pg_temp.signup((select code from t_codes where k = 'multi'), 'm3@example.com');
    raise exception '超過次數不應可使用';
  exception when invalid_parameter_value then null;
  end;

  -- 限定 Email
  begin
    perform pg_temp.signup((select code from t_codes where k = 'locked'), 'other@example.com');
    raise exception '限定 Email 的邀請碼不應給別人用';
  exception when invalid_parameter_value then null;
  end;
  perform pg_temp.signup((select code from t_codes where k = 'locked'), 'only.me@EXAMPLE.com');

  -- 過期、錯誤的邀請碼
  begin
    perform pg_temp.signup((select code from t_codes where k = 'expired'), 'late@example.com');
    raise exception '過期邀請碼不應可使用';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform pg_temp.signup('TL-0000-0000-0000-0000', 'guess@example.com');
    raise exception '錯誤邀請碼不應可使用';
  exception when invalid_parameter_value then null;
  end;

  -- 撤銷
  update invite_codes set revoked_at = now() where app_role = 'admin';
  begin
    perform pg_temp.signup((select code from t_codes where k = 'admin'), 'boss@example.com');
    raise exception '撤銷的邀請碼不應可使用';
  exception when invalid_parameter_value then null;
  end;

  -- 綁定既有成員：註冊後連到原本的成員資料，不會多出一筆
  select count(*) into n from members;
  v_user := pg_temp.signup((select code from t_codes where k = 'bind'), 'kuanyu.real@gmail.com');
  assert (select id from members where user_id = v_user) = '10000000-0000-0000-0000-000000000003', '應綁定既有成員';
  assert (select count(*) from members) = n, '不應新增成員';

  -- 建立帳號失敗時歸還次數
  update invite_codes set revoked_at = null where app_role = 'admin';
  set local role service_role;
  v_invite := claim_invite_code((select code from t_codes where k = 'admin'), 'boss@example.com');
  perform release_invite_code(v_invite);
  reset role;
  assert (select used_count from invite_codes where id = v_invite) = 0, '失敗時應歸還次數';
end $$;

-- ---------------------------------------------------------------------------
-- 刪除成員：保留論文作者姓名，關聯欄位設為 null
-- ---------------------------------------------------------------------------
do $$
begin
  delete from members where id = '10000000-0000-0000-0000-000000000004';  -- 王詩涵（論文作者、專案負責人）
  assert exists (select 1 from publication_authors
                  where publication_id = '30000000-0000-0000-0000-000000000002'
                    and author_order = 1 and member_id is null and display_name = 'Shih-Han Wang'),
    '作者姓名應保留';
  assert (select owner_id from projects where id = '20000000-0000-0000-0000-000000000002') is null;
end $$;
