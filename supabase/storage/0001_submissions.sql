-- storage/0001_submissions.sql — Bucket privado do áudio das entregas e as policies dele (ciclo 5).
-- Aplicado pelo scripts/migrate.mjs depois de supabase/migrations, só quando storage.objects existe (na nuvem sempre;
-- no Supabase local, com [storage] ligado). Quem pode ouvir e subir está nas funções da 0014, que os testes de banco
-- conferem também sem Storage; aqui só as liga ao bucket. Sem policy de update nem de delete: o app não troca nem
-- apaga arquivo (entregar de novo sobe outro nome); apagar é da Edge Function purge-submission-audio.
-- O tipo é conferido pelo Content-Type do envio, sem parâmetros (audio/webm, não audio/webm;codecs=opus).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 10 * 1024 * 1024, array['audio/webm', 'audio/mp4', 'audio/ogg'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists violinhero_submissions_select on storage.objects;
create policy violinhero_submissions_select on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and violinhero.can_read_submission_audio(name));

drop policy if exists violinhero_submissions_insert on storage.objects;
create policy violinhero_submissions_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and violinhero.can_upload_submission_audio(name));
