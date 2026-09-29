-- Quản lý phòng trọ (nội bộ Admin)
-- Chạy toàn bộ file này trong Supabase SQL Editor.
--
-- Đơn giá mặc định khi tính hóa đơn:
--   Điện:        4.000đ / chữ (kWh)
--   Nước:        25.000đ / khối (m³)
--   Rác + mạng:  100.000đ / phòng
--
-- total_amount được trigger tính tự động:
--   (điện mới - điện cũ) * 4000
--   + (nước mới - nước cũ) * 25000
--   + tiền phòng
--   + 100000
--
-- Chưa bật RLS vì ứng dụng chưa có đăng nhập.
-- Trước khi đưa anon key ra ngoài máy admin, hãy bật RLS
-- và chỉ cho phép tài khoản admin.

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_number text not null,
  floor integer not null,
  area numeric(8, 2) not null,
  price bigint not null,
  status text not null default 'trống',
  amenities text,
  created_at timestamptz not null default now(),
  constraint rooms_room_number_key unique (room_number),
  constraint rooms_floor_check check (floor >= 0),
  constraint rooms_area_check check (area > 0),
  constraint rooms_price_check check (price >= 0),
  constraint rooms_status_check check (
    status in ('trống', 'đang thuê', 'đang sửa')
  )
);

comment on table public.rooms is 'Danh sách phòng trọ.';
comment on column public.rooms.area is 'Diện tích, đơn vị m².';
comment on column public.rooms.price is 'Giá thuê tháng, đơn vị đồng.';
comment on column public.rooms.status is 'trống | đang thuê | đang sửa';
comment on column public.rooms.amenities is 'Tiện nghi, nhập tự do (ví dụ: máy lạnh, nóng lạnh).';

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  name text not null,
  phone text not null,
  cccd text not null,
  move_in_date date not null,
  move_out_date date,
  deposit bigint not null default 0,
  status text not null default 'đang ở',
  created_at timestamptz not null default now(),
  constraint tenants_room_id_fkey
    foreign key (room_id) references public.rooms (id) on delete restrict,
  constraint tenants_deposit_check check (deposit >= 0),
  constraint tenants_status_check check (
    status in ('đang ở', 'đã rời đi')
  )
);

comment on table public.tenants is 'Khách đang hoặc từng thuê. Một phòng có thể có nhiều bản ghi theo thời gian.';
comment on column public.tenants.cccd is 'Số căn cước công dân.';
comment on column public.tenants.deposit is 'Tiền cọc, đơn vị đồng.';
comment on column public.tenants.status is 'đang ở | đã rời đi. Trả phòng không xóa bản ghi.';
comment on column public.tenants.move_out_date is 'Ngày trả phòng, dạng date. Null khi khách vẫn đang ở.';

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  month integer not null,
  year integer not null,
  electric_old numeric(12, 2) not null default 0,
  electric_new numeric(12, 2) not null default 0,
  water_old numeric(12, 2) not null default 0,
  water_new numeric(12, 2) not null default 0,
  room_price bigint not null,
  total_amount bigint not null,
  status text not null default 'chưa thanh toán',
  created_at timestamptz not null default now(),
  constraint bills_room_id_fkey
    foreign key (room_id) references public.rooms (id) on delete restrict,
  constraint bills_month_check check (month between 1 and 12),
  constraint bills_year_check check (year between 2000 and 2100),
  constraint bills_electric_check check (electric_new >= electric_old and electric_old >= 0),
  constraint bills_water_check check (water_new >= water_old and water_old >= 0),
  constraint bills_room_price_check check (room_price >= 0),
  constraint bills_total_amount_check check (total_amount >= 0),
  constraint bills_status_check check (
    status in ('chưa thanh toán', 'đã thanh toán')
  ),
  constraint bills_room_month_key unique (room_id, month, year)
);

comment on table public.bills is 'Hóa đơn theo phòng và tháng.';
comment on column public.bills.room_price is 'Tiền phòng tại thời điểm lập hóa đơn, đơn vị đồng.';
comment on column public.bills.total_amount is 'Tổng tiền do trigger tính: điện 4000đ/chữ, nước 25000đ/khối, rác+mạng 100000đ.';
comment on column public.bills.status is 'chưa thanh toán | đã thanh toán';

create index tenants_room_id_idx on public.tenants (room_id);
create index bills_room_id_idx on public.bills (room_id);
create index bills_period_idx on public.bills (year, month);

create or replace function public.set_bill_total()
returns trigger
language plpgsql
as $$
begin
  new.total_amount := (
    round((new.electric_new - new.electric_old) * 4000)
    + round((new.water_new - new.water_old) * 25000)
    + new.room_price
    + 100000
  )::bigint;

  return new;
end;
$$;

create trigger bills_set_total
before insert or update of electric_old, electric_new, water_old, water_new, room_price
on public.bills
for each row
execute function public.set_bill_total();

-- Nếu Supabase đã bật RLS, anon key sẽ không thêm được phòng.
-- Chạy riêng đoạn dưới (an toàn khi chạy lại) cho ứng dụng nội bộ chưa có đăng nhập.
alter table public.rooms enable row level security;

drop policy if exists rooms_admin_all on public.rooms;

create policy rooms_admin_all
on public.rooms
for all
to anon, authenticated
using (true)
with check (true);

alter table public.tenants enable row level security;

drop policy if exists tenants_admin_all on public.tenants;

create policy tenants_admin_all
on public.tenants
for all
to anon, authenticated
using (true)
with check (true);

alter table public.bills enable row level security;

drop policy if exists bills_admin_all on public.bills;

create policy bills_admin_all
on public.bills
for all
to anon, authenticated
using (true)
with check (true);
