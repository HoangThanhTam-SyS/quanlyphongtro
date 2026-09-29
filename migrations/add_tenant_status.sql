-- Giữ lịch sử khách thuê khi trả phòng.
-- Chạy file này trong Supabase SQL Editor trên database đang dùng.
-- An toàn khi chạy lại.

alter table public.tenants
  add column if not exists status text;

update public.tenants
set status = 'đang ở'
where status is null;

alter table public.tenants
  alter column status set default 'đang ở';

alter table public.tenants
  alter column status set not null;

alter table public.tenants
  drop constraint if exists tenants_status_check;

alter table public.tenants
  add constraint tenants_status_check
  check (status in ('đang ở', 'đã rời đi'));

comment on column public.tenants.status is 'đang ở | đã rời đi. Trả phòng không xóa bản ghi.';
