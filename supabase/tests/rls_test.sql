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

-- ---------------------------------------------------------------------------
-- Dashboard：get_dashboard()（以張家豪身分）
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000005';
do $$
declare
  d jsonb := get_dashboard();
  prev date;
  item jsonb;
begin
  assert (d ->> 'today')::date = lab_today();
  assert (d -> 'kpis' ->> 'active_projects')::int >= 1, 'KPI';
  -- 我的任務：只含指派給自己、未完成，依截止日排序
  assert jsonb_array_length(d -> 'my_tasks') >= 2, '我的任務';
  assert not exists (
    select 1 from jsonb_array_elements(d -> 'my_tasks') t
     where not exists (select 1 from task_assignees ta
                        where ta.task_id = (t ->> 'id')::uuid
                          and ta.member_id = '10000000-0000-0000-0000-000000000005')
        or t ->> 'status' = 'done'), '只能有自己未完成的任務';
  for item in select * from jsonb_array_elements(d -> 'my_tasks') loop
    if item ->> 'due_date' is not null then
      assert prev is null or (item ->> 'due_date')::date >= prev, '依截止日排序';
      prev := (item ->> 'due_date')::date;
    end if;
  end loop;
  assert (d ->> 'my_open')::int >= jsonb_array_length(d -> 'my_tasks');
  -- 專案：不含已完成；進行中排最前
  assert not exists (select 1 from jsonb_array_elements(d -> 'projects') p where p ->> 'status' = 'completed');
  assert d -> 'projects' -> 0 ->> 'status' = 'active', '進行中專案排前面';
  -- 論文：六個階段依序
  assert jsonb_array_length(d -> 'publication_stages') = 6;
  assert d -> 'publication_stages' -> 0 ->> 'stage' = 'idea' and d -> 'publication_stages' -> 5 ->> 'stage' = 'published';
  -- 會議：最近 3 筆過去會議（新到舊）＋下次會議
  assert jsonb_array_length(d -> 'recent_meetings') = 3;
  assert (d -> 'recent_meetings' -> 0 ->> 'starts_at')::timestamptz >= (d -> 'recent_meetings' -> 1 ->> 'starts_at')::timestamptz;
  assert (d -> 'next_meeting' ->> 'starts_at')::timestamptz > now(), '下次會議';
  -- 截止日：未來 14 天內、含任務與論文
  assert not exists (select 1 from jsonb_array_elements(d -> 'deadlines') x
                      where (x ->> 'due_date')::date not between lab_today() and lab_today() + 13);
  assert exists (select 1 from jsonb_array_elements(d -> 'deadlines') x where x ->> 'kind' = 'publication');
  assert exists (select 1 from jsonb_array_elements(d -> 'deadlines') x where (x ->> 'mine')::boolean);
end $$;
reset role;
reset request.jwt.claim.sub;

-- anon 不可呼叫
set role anon;
do $$
begin
  perform get_dashboard();
  raise exception 'anon 不應可呼叫 get_dashboard';
exception when insufficient_privilege then null;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 階段 4 API：專案／任務／論文
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values ('aaaaaaaa-0000-0000-0000-000000000006', 'pohan.huang@tllab.example');

-- 張家豪（member）
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000005';
do $$
declare
  v_pid uuid;
  v_tid uuid;
  v_pub uuid;
  j jsonb;
begin
  -- 專案列表：進行中排前，帶 editable
  j := list_projects();
  assert jsonb_array_length(j) = 6;
  assert j -> 0 ->> 'status' = 'active';
  assert (select (x ->> 'editable')::boolean from jsonb_array_elements(j) x
           where x ->> 'id' = '20000000-0000-0000-0000-000000000001'), '自己負責的專案 editable';
  assert not (select (x ->> 'editable')::boolean from jsonb_array_elements(j) x
               where x ->> 'id' = '20000000-0000-0000-0000-000000000002'), '無關專案不可編輯';
  assert jsonb_array_length(list_projects('{"status":"completed"}')) = 1;
  assert jsonb_array_length(list_projects('{"q":"斑馬魚"}')) = 1;
  assert jsonb_array_length(list_projects('{"q":"100%"}')) = 0, '% 需跳脫';

  -- 建立專案＋參與成員
  v_pid := save_project('{"title":"  新專案  ","emoji":"🧬","status":"active","progress":10,
                          "start_date":"2026-11-01","due_date":"2027-06-30","tags":["AI"," AI ",""],
                          "owner_id":"10000000-0000-0000-0000-000000000005",
                          "member_ids":["10000000-0000-0000-0000-000000000006","10000000-0000-0000-0000-000000000008"]}');
  j := get_project(v_pid);
  assert j ->> 'title' = '新專案' and j -> 'tags' = '["AI"]'::jsonb, '標題去空白、標籤去重';
  assert jsonb_array_length(j -> 'members') = 2;
  assert (j ->> 'editable')::boolean and (j ->> 'deletable')::boolean;

  -- 驗證
  begin perform save_project('{"title":" "}'); raise exception 'x';
  exception when invalid_parameter_value then assert sqlerrm = 'titleRequired'; end;
  begin perform save_project('{"title":"a","start_date":"2026-12-01","due_date":"2026-11-01"}'); raise exception 'x';
  exception when invalid_parameter_value then assert sqlerrm = 'dateOrder'; end;

  -- 無權限編輯／刪除
  begin perform save_project('{"id":"20000000-0000-0000-0000-000000000002","title":"偷改"}'); raise exception 'x';
  exception when insufficient_privilege then null; end;
  begin perform delete_project('20000000-0000-0000-0000-000000000002'); raise exception 'x';
  exception when insufficient_privilege then null; end;

  -- 專案詳細頁：任務、論文、會議
  j := get_project('20000000-0000-0000-0000-000000000001');
  assert jsonb_array_length(j -> 'tasks') >= 4, '專案任務';
  assert jsonb_array_length(j -> 'publications') = 2, '專案論文';
  assert jsonb_array_length(j -> 'meetings') = 2, '專案會議';

  -- 任務：建立、指派、篩選、拖拉、刪除
  v_tid := save_task(jsonb_build_object('title', '新任務', 'project_id', v_pid, 'priority', 'high',
                     'due_date', lab_today() - 1,
                     'assignee_ids', jsonb_build_array('10000000-0000-0000-0000-000000000005')));
  assert exists (select 1 from jsonb_array_elements(list_tasks('{"mine":true}')) x where x ->> 'id' = v_tid::text);
  assert exists (select 1 from jsonb_array_elements(list_tasks('{"overdue":true}')) x where x ->> 'id' = v_tid::text);
  assert jsonb_array_length(list_tasks(jsonb_build_object('project_id', v_pid))) = 1;
  assert jsonb_array_length(list_tasks(jsonb_build_object('due_from', lab_today(), 'due_to', lab_today() + 7))) >= 3;
  j := move_task(v_tid, 'done', 0.5);
  assert j ->> 'status' = 'done' and (j ->> 'completed_at') is not null and (j ->> 'position')::float = 0.5;
  begin perform move_task('50000000-0000-0000-0000-000000000014', 'done', 1); raise exception 'x';
  exception when insufficient_privilege then null; end;
  perform save_task(jsonb_build_object('id', v_tid, 'title', '新任務（改）', 'status', 'in_review',
                    'assignee_ids', '[]'::jsonb));
  assert (select count(*) from task_assignees where task_id = v_tid) = 0;
  perform delete_task(v_tid);
  assert not exists (select 1 from tasks where id = v_tid);

  -- 論文：建立（含外部作者）、統計
  v_pub := save_publication(jsonb_build_object('title', '新論文', 'type', 'conference', 'stage', 'drafting',
             'authors', jsonb_build_array(
               jsonb_build_object('member_id', '10000000-0000-0000-0000-000000000005'),
               jsonb_build_object('display_name', 'External Coauthor'),
               jsonb_build_object('display_name', '  '),
               jsonb_build_object('member_id', '10000000-0000-0000-0000-000000000001', 'is_corresponding', true))));
  j := (select x from jsonb_array_elements(list_publications('{"stage":"drafting"}')) x where x ->> 'id' = v_pub::text);
  assert jsonb_array_length(j -> 'authors') = 3, '空白作者略過';
  assert (j -> 'authors' -> 0 ->> 'is_first_author')::boolean, '第一位預設為第一作者';
  assert j -> 'authors' -> 1 ->> 'name' = 'External Coauthor';
  assert (j -> 'authors' -> 2 ->> 'is_corresponding')::boolean;
  assert jsonb_array_length(list_publications('{"member_id":"10000000-0000-0000-0000-000000000005"}')) >= 3;
  j := publication_year_stats();
  assert exists (select 1 from jsonb_array_elements(j) x
                  where (x ->> 'year')::int = extract(year from lab_today()) and (x ->> 'journal')::int >= 1);
  -- 表單選單
  j := form_options();
  assert jsonb_array_length(j -> 'members') > 0 and (j ->> 'can_create')::boolean;
end $$;

-- 黃柏翰：只有「作者」身分的論文，修改作者清單（含移除自己）仍可成功
reset role;
reset request.jwt.claim.sub;
insert into publications (id, title, created_by) values ('30000000-0000-0000-0000-0000000000aa', '只有作者身分', '10000000-0000-0000-0000-000000000001');
insert into publication_authors (publication_id, member_id, author_order) values
  ('30000000-0000-0000-0000-0000000000aa', '10000000-0000-0000-0000-000000000006', 1);
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000006';
do $$
begin
  assert (select (x ->> 'editable')::boolean from jsonb_array_elements(list_publications()) x
           where x ->> 'id' = '30000000-0000-0000-0000-0000000000aa'), '作者可編輯';
  perform save_publication('{"id":"30000000-0000-0000-0000-0000000000aa","title":"只有作者身分","authors":[{"display_name":"Someone Else"}]}');
  assert (select count(*) from publication_authors where publication_id = '30000000-0000-0000-0000-0000000000aa') = 1;
  begin
    perform save_publication('{"id":"30000000-0000-0000-0000-0000000000aa","title":"再改"}');
    raise exception '移除自己後不應可再編輯';
  exception when insufficient_privilege then null;
  end;
end $$;

-- 校友（viewer）不可建立
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000013';
do $$
begin
  begin perform save_task('{"title":"viewer"}'); raise exception 'x';
  exception when insufficient_privilege then null; end;
  assert not (form_options() ->> 'can_create')::boolean;
end $$;
reset role;
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------------
-- 專案文件（attachments）
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000005';  -- 張家豪：AO 專案負責人
do $$
declare j jsonb;
begin
  insert into attachments (entity_type, entity_id, storage_path, file_name, kind, size_bytes, uploaded_by)
  values ('project', '20000000-0000-0000-0000-000000000001', 'project/20000000-0000-0000-0000-000000000001/a.pptx',
          'notes.pptx', 'slides', 120, current_member_id());
  j := list_attachments('project', '20000000-0000-0000-0000-000000000001');
  assert jsonb_array_length(j) = 1 and (j -> 0 ->> 'deletable')::boolean and j -> 0 ->> 'title' = 'notes.pptx';
  -- 無權限的專案不可上傳
  begin
    insert into attachments (entity_type, entity_id, storage_path, file_name, kind, uploaded_by)
    values ('project', '20000000-0000-0000-0000-000000000002', 'project/20000000-0000-0000-0000-000000000002/x.pdf',
            'x.pdf', 'slides', current_member_id());
    raise exception '不應可上傳到無權限專案';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into attachments (entity_type, entity_id, storage_path, file_name, kind, uploaded_by)
    values ('project', '20000000-0000-0000-0000-000000000001', 'p/y.bin', 'y.bin', 'video', current_member_id());
    raise exception 'kind 應受限制';
  exception when check_violation then null;
  end;
end $$;

-- 其他成員看得到、但不可刪除
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000006';
do $$
declare n int;
begin
  assert not (list_attachments('project', '20000000-0000-0000-0000-000000000001') -> 0 ->> 'deletable')::boolean;
  delete from attachments where file_name = 'notes.pptx';
  get diagnostics n = row_count;
  assert n = 0, '非上傳者不可刪除';
end $$;
reset role;
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------------------
-- 專案頁面內容：自動儲存、同時編輯偵測、活動紀錄合併
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000005';
do $$
declare
  v int;
  n_before int;
  long text := repeat('長', 500);
begin
  v := (get_project('20000000-0000-0000-0000-000000000001') ->> 'content_version')::int;
  assert (get_project('20000000-0000-0000-0000-000000000001') -> 'files') is not null, '詳細頁含檔案';
  select count(*) into n_before from activity_log where entity_id = '20000000-0000-0000-0000-000000000001';
  v := save_project_content('20000000-0000-0000-0000-000000000001', '# 第一版', v);
  v := save_project_content('20000000-0000-0000-0000-000000000001', '# 第二版' || long, v);
  assert (select content from projects where id = '20000000-0000-0000-0000-000000000001') like '# 第二版%';
  assert (select count(*) from activity_log where entity_id = '20000000-0000-0000-0000-000000000001') <= n_before + 1,
    '連續修改應合併為一筆';
  assert (select length(changes -> 'content' ->> 'new') from activity_log
           where entity_id = '20000000-0000-0000-0000-000000000001' order by created_at desc limit 1) <= 301,
    '長文字應截短';
  -- 用舊版本號儲存 → 衝突
  begin
    perform save_project_content('20000000-0000-0000-0000-000000000001', 'stale', v - 1);
    raise exception '應偵測到衝突';
  exception when serialization_failure then null;
  end;
  -- 無權限
  begin
    perform save_project_content('20000000-0000-0000-0000-000000000002', 'x', 0);
    raise exception '無權限';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
reset request.jwt.claim.sub;
