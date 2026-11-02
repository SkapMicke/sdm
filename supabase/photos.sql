-- Run once in the existing project's Supabase SQL editor.
create table public.photos (
 id uuid primary key,
 user_id uuid not null references auth.users(id),
 name text not null,
 original_path text not null,
 preview_path text not null,
 thumbnail_path text not null,
 uploaded_at timestamptz not null default now(),
 upload_date date not null default ((now() at time zone 'Europe/Stockholm')::date),
 starred boolean not null default false,
 ready boolean not null default false,
 deleted_at timestamptz,
 constraint own_paths check (
 original_path = user_id::text || '/' || id::text || '/original' and
 preview_path = user_id::text || '/' || id::text || '/watermarked.jpg' and
 thumbnail_path = user_id::text || '/' || id::text || '/thumbnail.jpg')
);
create index photos_owner_date on public.photos(user_id, uploaded_at desc, id);
alter table public.photos enable row level security;
create policy photos_owner on public.photos for all to authenticated
 using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('sdm-photos','sdm-photos',false,52428800,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy photo_files_owner on storage.objects for all to authenticated
 using (bucket_id='sdm-photos' and (storage.foldername(name))[1]=(select auth.uid())::text)
 with check (bucket_id='sdm-photos' and (storage.foldername(name))[1]=(select auth.uid())::text);
