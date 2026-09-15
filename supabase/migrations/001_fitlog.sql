create table if not exists public.fitlog_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.fitlog_users(id),
  date date not null,
  title text not null,
  note text,
  volume_kg numeric not null check (volume_kg >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  name text not null,
  position integer not null check (position >= 0)
);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  position integer not null check (position >= 0),
  weight_kg numeric not null check (weight_kg >= 0),
  reps integer not null check (reps > 0)
);

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.fitlog_users(id),
  date date not null,
  meal_type text not null,
  note text,
  calories numeric not null check (calories >= 0),
  protein_g numeric not null check (protein_g >= 0),
  carbs_g numeric not null check (carbs_g >= 0),
  fat_g numeric not null check (fat_g >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.fitlog_users(id),
  date date not null,
  weight_kg numeric not null check (weight_kg >= 0),
  body_fat_percent numeric check (body_fat_percent between 0 and 100),
  created_at timestamptz not null default now()
);

create table if not exists public.memory_facts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.fitlog_users(id),
  content text not null,
  category text,
  is_important boolean not null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.fitlog_users(id),
  action text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists workouts_owner_date_idx on public.workouts (owner_id, date desc);
create index if not exists meals_owner_date_idx on public.meals (owner_id, date desc);
create index if not exists measurements_owner_date_idx on public.body_measurements (owner_id, date desc);
create index if not exists audit_events_owner_created_idx on public.audit_events (owner_id, created_at);

alter table public.fitlog_users enable row level security;
alter table public.workouts enable row level security;
alter table public.exercises enable row level security;
alter table public.workout_sets enable row level security;
alter table public.meals enable row level security;
alter table public.body_measurements enable row level security;
alter table public.memory_facts enable row level security;
alter table public.audit_events enable row level security;
