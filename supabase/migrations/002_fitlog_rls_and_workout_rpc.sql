-- Cloud ownership is derived from Supabase Auth, never from tool input.
alter table public.fitlog_users alter column id drop default;
alter table public.fitlog_users drop constraint if exists fitlog_users_id_fkey;
alter table public.fitlog_users add constraint fitlog_users_id_fkey foreign key (id) references auth.users(id) on delete cascade;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.fitlog_users, public.workouts, public.exercises, public.workout_sets, public.meals, public.body_measurements, public.memory_facts, public.audit_events to authenticated;

create policy "fitlog_users_select_own" on public.fitlog_users for select to authenticated using (id = auth.uid());
create policy "fitlog_users_insert_own" on public.fitlog_users for insert to authenticated with check (id = auth.uid());
create policy "fitlog_users_update_own" on public.fitlog_users for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "workouts_select_own" on public.workouts for select to authenticated using (owner_id = auth.uid());
create policy "workouts_insert_own" on public.workouts for insert to authenticated with check (owner_id = auth.uid());
create policy "workouts_update_own" on public.workouts for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "workouts_delete_own" on public.workouts for delete to authenticated using (owner_id = auth.uid());

create policy "exercises_select_own" on public.exercises for select to authenticated using (exists (select 1 from public.workouts where workouts.id = exercises.workout_id and workouts.owner_id = auth.uid()));
create policy "exercises_insert_own" on public.exercises for insert to authenticated with check (exists (select 1 from public.workouts where workouts.id = exercises.workout_id and workouts.owner_id = auth.uid()));
create policy "exercises_update_own" on public.exercises for update to authenticated using (exists (select 1 from public.workouts where workouts.id = exercises.workout_id and workouts.owner_id = auth.uid())) with check (exists (select 1 from public.workouts where workouts.id = exercises.workout_id and workouts.owner_id = auth.uid()));
create policy "exercises_delete_own" on public.exercises for delete to authenticated using (exists (select 1 from public.workouts where workouts.id = exercises.workout_id and workouts.owner_id = auth.uid()));

create policy "workout_sets_select_own" on public.workout_sets for select to authenticated using (exists (select 1 from public.exercises join public.workouts on workouts.id = exercises.workout_id where exercises.id = workout_sets.exercise_id and workouts.owner_id = auth.uid()));
create policy "workout_sets_insert_own" on public.workout_sets for insert to authenticated with check (exists (select 1 from public.exercises join public.workouts on workouts.id = exercises.workout_id where exercises.id = workout_sets.exercise_id and workouts.owner_id = auth.uid()));
create policy "workout_sets_update_own" on public.workout_sets for update to authenticated using (exists (select 1 from public.exercises join public.workouts on workouts.id = exercises.workout_id where exercises.id = workout_sets.exercise_id and workouts.owner_id = auth.uid())) with check (exists (select 1 from public.exercises join public.workouts on workouts.id = exercises.workout_id where exercises.id = workout_sets.exercise_id and workouts.owner_id = auth.uid()));
create policy "workout_sets_delete_own" on public.workout_sets for delete to authenticated using (exists (select 1 from public.exercises join public.workouts on workouts.id = exercises.workout_id where exercises.id = workout_sets.exercise_id and workouts.owner_id = auth.uid()));

create policy "meals_select_own" on public.meals for select to authenticated using (owner_id = auth.uid());
create policy "meals_insert_own" on public.meals for insert to authenticated with check (owner_id = auth.uid());
create policy "meals_update_own" on public.meals for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "meals_delete_own" on public.meals for delete to authenticated using (owner_id = auth.uid());
create policy "body_measurements_select_own" on public.body_measurements for select to authenticated using (owner_id = auth.uid());
create policy "body_measurements_insert_own" on public.body_measurements for insert to authenticated with check (owner_id = auth.uid());
create policy "body_measurements_update_own" on public.body_measurements for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "body_measurements_delete_own" on public.body_measurements for delete to authenticated using (owner_id = auth.uid());
create policy "memory_facts_select_own" on public.memory_facts for select to authenticated using (owner_id = auth.uid());
create policy "memory_facts_insert_own" on public.memory_facts for insert to authenticated with check (owner_id = auth.uid());
create policy "memory_facts_update_own" on public.memory_facts for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "memory_facts_delete_own" on public.memory_facts for delete to authenticated using (owner_id = auth.uid());
create policy "audit_events_select_own" on public.audit_events for select to authenticated using (owner_id = auth.uid());
create policy "audit_events_insert_own" on public.audit_events for insert to authenticated with check (owner_id = auth.uid());
create policy "audit_events_delete_own" on public.audit_events for delete to authenticated using (owner_id = auth.uid());

create or replace function public.fitlog_record_workout(payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  workout_id uuid := gen_random_uuid();
  exercise jsonb;
  exercise_index integer;
  set_item jsonb;
  set_index integer;
  exercise_id uuid;
begin
  if auth.uid() is null or jsonb_typeof(payload) <> 'object'
    or nullif(trim(payload->>'date'), '') is null
    or nullif(trim(payload->>'title'), '') is null
    or jsonb_typeof(payload->'exercises') <> 'array'
    or jsonb_array_length(payload->'exercises') = 0
    or (payload->>'volumeKg') !~ '^[0-9]+(\.[0-9]+)?$' then
    raise exception 'invalid workout payload' using errcode = '22023';
  end if;

  insert into public.fitlog_users (id, email) values (auth.uid(), coalesce(auth.jwt()->>'email', ''))
  on conflict (id) do update set email = excluded.email;

  insert into public.workouts (id, owner_id, date, title, note, volume_kg)
  values (workout_id, auth.uid(), (payload->>'date')::date, payload->>'title', nullif(payload->>'note', ''), (payload->>'volumeKg')::numeric);

  for exercise, exercise_index in select value, ordinal::integer - 1 from jsonb_array_elements(payload->'exercises') with ordinality loop
    if nullif(trim(exercise->>'name'), '') is null or jsonb_typeof(exercise->'sets') <> 'array' or jsonb_array_length(exercise->'sets') = 0 then
      raise exception 'invalid workout payload' using errcode = '22023';
    end if;
    exercise_id := gen_random_uuid();
    insert into public.exercises (id, workout_id, name, position) values (exercise_id, workout_id, exercise->>'name', exercise_index);
    for set_item, set_index in select value, ordinal::integer - 1 from jsonb_array_elements(exercise->'sets') with ordinality loop
      if (set_item->>'weightKg') !~ '^[0-9]+(\.[0-9]+)?$' or (set_item->>'reps') !~ '^[1-9][0-9]*$' then
        raise exception 'invalid workout payload' using errcode = '22023';
      end if;
      insert into public.workout_sets (id, exercise_id, position, weight_kg, reps)
      values (gen_random_uuid(), exercise_id, set_index, (set_item->>'weightKg')::numeric, (set_item->>'reps')::integer);
    end loop;
  end loop;
  return workout_id;
end;
$$;

grant execute on function public.fitlog_record_workout(jsonb) to authenticated;
