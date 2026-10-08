-- Apply to Tuka's Supabase project after it has been selected and provisioned.
create schema if not exists tuka_private;
revoke all on schema tuka_private from public, anon;
grant usage on schema tuka_private to authenticated;
create table tuka_private.bus_reports (
 id bigint generated always as identity primary key,
 reporter uuid not null references auth.users(id) on delete cascade,
 trip_id text not null check(length(trip_id) between 1 and 160),
 service_date text not null check(service_date ~ '^[0-9]{8}$'),
 stop_code text not null check(length(stop_code) between 1 and 40),
 stop_sequence integer not null check(stop_sequence between 1 and 1000),
 line text not null check(length(line) between 1 and 24),
 direction text not null check(length(direction) <= 160),
 answer text not null check(answer in ('arrived','not_seen')),
 expected_at timestamptz not null,
 reported_at timestamptz not null default now(),
 unique(reporter,trip_id,service_date,stop_code,stop_sequence)
);
alter table tuka_private.bus_reports enable row level security;
revoke all on tuka_private.bus_reports from public,anon,authenticated;
create index bus_reports_trip_fresh on tuka_private.bus_reports(trip_id,service_date,reported_at desc);
create index bus_reports_user_fresh on tuka_private.bus_reports(reporter,reported_at desc);
-- Controlled write and aggregate endpoints deliberately hide reporter identities.
create function tuka_private.submit_report(payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); eta timestamptz;
begin
 if uid is null then raise exception 'Sign in required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 eta := (payload->>'expected_at')::timestamptz;
 if eta < now()-interval '5 minutes' or eta > now()+interval '1 minute' then raise exception 'Arrival window expired'; end if;
 if exists(select 1 from tuka_private.bus_reports where reporter=uid and reported_at>now()-interval '30 seconds') then raise exception 'Please wait before another report'; end if;
 if (select count(*) from tuka_private.bus_reports where reporter=uid and reported_at>now()-interval '1 hour')>=20 then raise exception 'Report limit reached';end if;
 insert into tuka_private.bus_reports(reporter,trip_id,service_date,stop_code,stop_sequence,line,direction,answer,expected_at)
 values(uid,payload->>'trip_id',payload->>'service_date',payload->>'stop_code',(payload->>'stop_sequence')::integer,payload->>'line',payload->>'direction',payload->>'answer',eta)
 on conflict(reporter,trip_id,service_date,stop_code,stop_sequence) do nothing;
 delete from tuka_private.bus_reports where reported_at < now()-interval '1 day';
end $$;
create function tuka_private.recent_reports(trips jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required';end if;
 if jsonb_typeof(trips)<>'array' or jsonb_array_length(trips)>40 then raise exception 'Invalid trip list';end if;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into result from (
 select r.trip_id,r.service_date,r.stop_code,r.stop_sequence,r.line,r.direction,
 count(*) filter(where r.answer='arrived') as arrived,
 count(*) filter(where r.answer='not_seen') as not_seen,max(r.reported_at) as latest
 from tuka_private.bus_reports r
 where r.reported_at>now()-interval '5 minutes' and exists(select 1 from jsonb_array_elements(trips) t where t->>'trip_id'=r.trip_id and t->>'service_date'=r.service_date and (t->>'stop_sequence')::integer>=r.stop_sequence)
 group by r.trip_id,r.service_date,r.stop_code,r.stop_sequence,r.line,r.direction
 order by max(r.reported_at) desc limit 60) x;
 return result;
end $$;
revoke all on function tuka_private.submit_report(jsonb) from public,anon;
revoke all on function tuka_private.recent_reports(jsonb) from public,anon;
grant execute on function tuka_private.submit_report(jsonb) to authenticated;
grant execute on function tuka_private.recent_reports(jsonb) to authenticated;
create function public.tuka_submit_report(payload jsonb) returns void language sql security invoker set search_path='' as $$select tuka_private.submit_report(payload);$$;
create function public.tuka_recent_reports(trips jsonb) returns jsonb language sql security invoker set search_path='' as $$select tuka_private.recent_reports(trips);$$;
revoke all on function public.tuka_submit_report(jsonb) from public,anon;
revoke all on function public.tuka_recent_reports(jsonb) from public,anon;
grant execute on function public.tuka_submit_report(jsonb) to authenticated;
grant execute on function public.tuka_recent_reports(jsonb) to authenticated;
