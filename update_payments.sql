-- Jalankan sekali pada proyek Supabase yang sudah memakai schema.sql sebelumnya.
alter table public.cash_transactions
  add column if not exists payment_stage text;

update public.cash_transactions
set payment_stage = 'dp'
where type = 'customer_payment' and payment_stage is null;

alter table public.cash_transactions
  drop constraint if exists transaction_payment_stage_required;

alter table public.cash_transactions
  add constraint transaction_payment_stage_required check (
    (type = 'customer_payment' and payment_stage in ('dp', 'full'))
    or (type <> 'customer_payment' and payment_stage is null)
  );
