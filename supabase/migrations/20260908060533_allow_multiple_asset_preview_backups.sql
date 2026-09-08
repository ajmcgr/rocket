alter table public.legacy_brand_preview_backups
  drop constraint if exists legacy_brand_preview_backups_project_id_field_name_key;

-- A project can have many asset thumbnail/image backups. Only a project cover
-- should be unique, and it has no asset_id.
create unique index if not exists legacy_brand_preview_backups_project_cover_key
  on public.legacy_brand_preview_backups (project_id, field_name)
  where asset_id is null;
