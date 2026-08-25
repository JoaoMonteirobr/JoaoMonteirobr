create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
do $$ begin
 if exists (select 1 from cron.job where jobname='matos_push_dispatch') then
  perform cron.unschedule('matos_push_dispatch');
 end if;
end $$;
select cron.schedule(
 'matos_push_dispatch',
 '*/2 * * * *',
 $$select net.http_post(
   url:='https://behmmbgbrsesxthsczdl.supabase.co/functions/v1/push-dispatch',
   headers:='{"Content-Type":"application/json"}'::jsonb,
   body:='{}'::jsonb
 );$$
);