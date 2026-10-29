-- =============================================================================
-- TL Lab Hub — 04 Supabase Storage
--   avatars     : 成員照片（公開讀取，路徑 {member_id}/xxx.jpg）
--   attachments : 文件圖片與附件（僅登入成員可讀，路徑 {entity_type}/{entity_id}/xxx）
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5 * 1024 * 1024,
   array['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('attachments', 'attachments', false, 50 * 1024 * 1024, null)
on conflict (id) do nothing;

-- avatars：本人或 Admin 可上傳／更換／刪除
create policy avatars_read on storage.objects for select
  using (bucket_id = 'avatars');
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars'
              and (public.is_admin()
                   or (storage.foldername(name))[1] = public.current_member_id()::text));
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars'
         and (public.is_admin()
              or (storage.foldername(name))[1] = public.current_member_id()::text));
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars'
         and (public.is_admin()
              or (storage.foldername(name))[1] = public.current_member_id()::text));

-- attachments：登入成員可讀；可編輯該資料者可上傳；上傳者或 Admin 可刪除
create policy attachments_obj_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.current_member_id() is not null);
create policy attachments_obj_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
    and public.can_edit_entity((storage.foldername(name))[1], ((storage.foldername(name))[2])::uuid)
  );
create policy attachments_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (public.is_admin() or owner_id = auth.uid()::text));
