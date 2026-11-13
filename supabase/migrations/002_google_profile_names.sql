begin;
create or replace function public.new_cricket_profile() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles(id,display_name,avatar_url)
 values(new.id,left(coalesce(nullif(btrim(new.raw_user_meta_data->>'display_name'),''),nullif(btrim(new.raw_user_meta_data->>'full_name'),''),nullif(btrim(new.raw_user_meta_data->>'name'),''),nullif(split_part(new.email,'@',1),''),'Owner'),40),coalesce(new.raw_user_meta_data->>'avatar_url',new.raw_user_meta_data->>'picture'));
 return new;
end;
$$;
revoke all on function public.new_cricket_profile() from public,anon,authenticated;
commit;
