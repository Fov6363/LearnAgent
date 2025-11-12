-- Enable UUID helper
create extension if not exists "pgcrypto";

create table if not exists public.learning_paths (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    goal text not null,
    duration_days integer not null check (duration_days > 0),
    level text not null,
    summary text,
    session_id uuid,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists learning_paths_user_id_idx on public.learning_paths (user_id);

create table if not exists public.path_nodes (
    id uuid primary key default gen_random_uuid(),
    path_id uuid not null references public.learning_paths (id) on delete cascade,
    stage_id text not null,
    title text not null,
    description text,
    skills text[] not null default '{}'::text[],
    difficulty text not null default 'medium',
    est_minutes integer not null check (est_minutes > 0),
    resources jsonb not null default '[]'::jsonb,
    order_idx integer not null default 0,
    created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists path_nodes_path_id_idx on public.path_nodes (path_id);
create index if not exists path_nodes_stage_id_idx on public.path_nodes (stage_id);

create table if not exists public.daily_tasks (
    id uuid primary key default gen_random_uuid(),
    path_id uuid not null references public.learning_paths (id) on delete cascade,
    day_index integer not null check (day_index > 0),
    focus text not null,
    node_ids text[] not null default '{}'::text[],
    checklist jsonb not null default '[]'::jsonb,
    est_minutes integer not null check (est_minutes > 0),
    created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists daily_tasks_path_id_idx on public.daily_tasks (path_id);
create index if not exists daily_tasks_day_index_idx on public.daily_tasks (day_index);

create table if not exists public.path_feedback (
    id uuid primary key default gen_random_uuid(),
    path_id uuid not null references public.learning_paths (id) on delete cascade,
    user_id uuid,
    rating integer check (rating between 1 and 5),
    comments text,
    created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists path_feedback_path_id_idx on public.path_feedback (path_id);
create index if not exists path_feedback_user_id_idx on public.path_feedback (user_id);

create table if not exists public.path_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    state text not null,
    slots jsonb not null default '{}'::jsonb,
    chat_history jsonb not null default '[]'::jsonb,
    last_outline jsonb,
    last_plan jsonb,
    created_at timestamptz not null default timezone('utc'::text, now()),
    updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists path_sessions_user_id_idx on public.path_sessions (user_id);
create index if not exists path_sessions_state_idx on public.path_sessions (state);

create table if not exists public.generation_logs (
    id bigserial primary key,
    session_id uuid,
    user_id uuid,
    stage text not null,
    provider text,
    model text,
    prompt_tokens integer,
    completion_tokens integer,
    status text not null default 'success',
    error_message text,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists generation_logs_session_id_idx on public.generation_logs (session_id);
create index if not exists generation_logs_user_id_idx on public.generation_logs (user_id);
