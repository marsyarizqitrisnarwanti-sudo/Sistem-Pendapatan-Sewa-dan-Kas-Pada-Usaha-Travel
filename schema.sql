-- Sistem Akuntansi Pendapatan Sewa dan Kas Travel
-- ERD (4 entitas):
-- customers 1 ── * trips * ── 1 drivers
-- trips 1 ── * cash_transactions
-- cash_transactions juga menyimpan relasi opsional customer untuk pembayaran pelanggan.

create extension if not exists pgcrypto;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  phone text,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  phone text,
  address text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id),
  driver_id uuid not null references public.drivers(id),
  origin text not null check (length(trim(origin)) > 0),
  destination text not null check (length(trim(destination)) > 0),
  travel_date date not null,
  rental_amount numeric(14,2) not null check (rental_amount >= 0),
  commission_rate numeric(5,2) not null default 10 check (commission_rate between 0 and 100),
  status text not null default 'booking' check (status in ('booking', 'ongoing', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  driver_settled_at timestamptz
);

create table if not exists public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id),
  customer_id uuid references public.customers(id),
  driver_id uuid references public.drivers(id),
  type text not null check (type in (
    'customer_payment', 'driver_advance', 'operating_expense', 'advance_return',
    'driver_reimbursement', 'driver_commission', 'driver_debt_repayment'
  )),
  payment_stage text check (payment_stage is null or payment_stage in ('dp', 'full')),
  category text check (category is null or category in ('fuel', 'toll', 'parking', 'meal', 'other')),
  amount numeric(14,2) not null check (amount > 0),
  channel text not null check (channel in ('cash', 'bank')),
  status text not null default 'validated' check (status in ('pending', 'validated', 'rejected')),
  notes text,
  occurred_at timestamptz not null default now(),
  validated_at timestamptz,
  validated_by text,
  constraint transaction_trip_required check (trip_id is not null),
  constraint transaction_category_required check (
    (type = 'operating_expense' and category is not null)
    or (type <> 'operating_expense' and category is null)
  ),
  constraint transaction_customer_required check (type <> 'customer_payment' or customer_id is not null),
  constraint transaction_payment_stage_required check (
    (type = 'customer_payment' and payment_stage in ('dp', 'full'))
    or (type <> 'customer_payment' and payment_stage is null)
  ),
  constraint transaction_driver_required check (
    type not in ('driver_advance', 'operating_expense', 'advance_return', 'driver_reimbursement', 'driver_commission', 'driver_debt_repayment')
    or driver_id is not null
  )
);

create index if not exists trips_travel_date_idx on public.trips(travel_date desc);
create index if not exists trips_customer_idx on public.trips(customer_id);
create index if not exists trips_driver_idx on public.trips(driver_id);
create index if not exists cash_transactions_trip_idx on public.cash_transactions(trip_id, occurred_at desc);
create index if not exists cash_transactions_type_status_idx on public.cash_transactions(type, status);

-- API backend memakai service-role key di server; jangan pernah menaruh key tersebut di frontend.
alter table public.customers enable row level security;
alter table public.drivers enable row level security;
alter table public.trips enable row level security;
alter table public.cash_transactions enable row level security;

create or replace function public.settle_trip(p_trip_id uuid, p_channel text)
returns jsonb
language plpgsql
as $$
declare
  v_trip public.trips%rowtype;
  v_commission numeric(14,2);
  v_expenses numeric(14,2);
  v_advances numeric(14,2);
  v_returns numeric(14,2);
  v_reimbursements numeric(14,2);
  v_commissions_paid numeric(14,2);
  v_debt_repayments numeric(14,2);
  v_pending integer;
  v_net_due numeric(14,2);
begin
  if p_channel not in ('cash', 'bank') then
    raise exception 'Kanal pembayaran tidak valid.';
  end if;

  select * into v_trip
    from public.trips
    where id = p_trip_id
    for update;

  if not found then
    raise exception 'Perjalanan tidak ditemukan.';
  end if;
  if v_trip.status <> 'completed' then
    raise exception 'Komisi hanya dapat diselesaikan setelah perjalanan selesai.';
  end if;
  if v_trip.driver_settled_at is not null then
    raise exception 'Penyelesaian driver untuk perjalanan ini sudah tercatat.';
  end if;

  select count(*) into v_pending
    from public.cash_transactions
    where trip_id = p_trip_id and type = 'operating_expense' and status = 'pending';
  if v_pending > 0 then
    raise exception 'Validasi semua biaya operasional sebelum menyelesaikan komisi.';
  end if;

  select
    coalesce(sum(amount) filter (where type = 'operating_expense' and status = 'validated'), 0),
    coalesce(sum(amount) filter (where type = 'driver_advance'), 0),
    coalesce(sum(amount) filter (where type = 'advance_return'), 0),
    coalesce(sum(amount) filter (where type = 'driver_reimbursement'), 0),
    coalesce(sum(amount) filter (where type = 'driver_commission'), 0),
    coalesce(sum(amount) filter (where type = 'driver_debt_repayment'), 0)
  into v_expenses, v_advances, v_returns, v_reimbursements, v_commissions_paid, v_debt_repayments
  from public.cash_transactions
  where trip_id = p_trip_id;

  v_commission := round(v_trip.rental_amount * v_trip.commission_rate / 100, 2);
  v_net_due := round(v_commission + v_expenses + v_returns - v_advances - v_reimbursements - v_commissions_paid + v_debt_repayments, 2);

  if abs(v_net_due) > 0 then
    insert into public.cash_transactions (trip_id, driver_id, type, amount, channel, status, notes, validated_at, validated_by)
    values (
      p_trip_id,
      v_trip.driver_id,
      case when v_net_due > 0 then 'driver_commission' else 'driver_debt_repayment' end,
      abs(v_net_due),
      p_channel,
      'validated',
      'Penyelesaian bersih. Komisi bruto ' || v_commission || '; termasuk penyesuaian uang jalan dan biaya aktual tervalidasi.',
      now(),
      'admin'
    );
  end if;

  update public.trips set driver_settled_at = now() where id = p_trip_id;
  return jsonb_build_object(
    'amount', abs(v_net_due),
    'direction', case when v_net_due > 0 then 'out' when v_net_due < 0 then 'in' else 'none' end
  );
end;
$$;

create or replace function public.prevent_trip_activity_after_settlement()
returns trigger
language plpgsql
as $$
declare
  v_trip public.trips%rowtype;
begin
  select * into v_trip from public.trips where id = new.trip_id for update;
  if not found then
    raise exception 'Perjalanan tidak ditemukan.';
  end if;
  if new.type in ('driver_advance', 'operating_expense', 'advance_return', 'driver_reimbursement')
     and v_trip.driver_settled_at is not null then
    raise exception 'Aktivitas uang jalan tidak dapat diubah setelah penyelesaian driver.';
  end if;
  return new;
end;
$$;

drop trigger if exists cash_transaction_trip_guard on public.cash_transactions;
create trigger cash_transaction_trip_guard
before insert on public.cash_transactions
for each row execute function public.prevent_trip_activity_after_settlement();

revoke all on function public.settle_trip(uuid, text) from public;
grant execute on function public.settle_trip(uuid, text) to service_role;
