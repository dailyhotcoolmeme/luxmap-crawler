create or replace function public.record_catalog_availability(
  p_brand text, p_url text, p_http_status integer,
  p_observed_at timestamptz, p_source_run text
) returns text language plpgsql security invoker set search_path = '' as $$
declare
  candidate uuid;
  matches integer;
  prior public.catalog_availability_state%rowtype;
  missing_at timestamptz;
  next_state text;
begin
  if p_brand is null or p_brand not in ('chanel','prada','bottega-veneta','van-cleef-arpels','rolex','louis-vuitton')
    or p_url is null or p_http_status is null or p_http_status not in (200,404,410) or p_observed_at is null
    or p_observed_at > now()+interval '5 minutes'
    or p_observed_at < now()-interval '24 hours'
    or p_source_run is null or p_source_run !~ '^[A-Za-z0-9_-]{1,100}$' then
    raise exception 'Invalid availability evidence';
  end if;
  select count(*), (array_agg(v.id))[1] into matches, candidate
  from public.product_variants v join public.brands b on b.id=v.brand_id
  join public.market_products m on m.variant_id=v.id
  where b.slug=p_brand and m.country_code='KR'
    and m.official_product_code=v.normalized_code and m.official_url=p_url;
  if matches<>1 then return 'REFERENCE_NOT_UNIQUE'; end if;
  -- Lock the existing variant too: concurrent first observations cannot race.
  perform 1 from public.product_variants where id=candidate for update;
  select * into prior from public.catalog_availability_state where variant_id=candidate for update;
  if found and (prior.source_run=p_source_run or prior.last_checked_at>=p_observed_at) then
    return 'EVIDENCE_ALREADY_SEEN';
  end if;
  if p_http_status=200 then
    next_state='available'; missing_at=null;
  else
    missing_at=coalesce(prior.first_missing_at,p_observed_at);
    next_state=case when p_observed_at-missing_at>=interval '24 hours'
      then 'missing_confirmed' else 'missing_pending' end;
  end if;
  insert into public.catalog_availability_state values(candidate,p_url,next_state,missing_at,p_observed_at,p_source_run)
  on conflict(variant_id) do update set official_url=excluded.official_url,
    state=excluded.state,first_missing_at=excluded.first_missing_at,
    last_checked_at=excluded.last_checked_at,source_run=excluded.source_run;
  if next_state in ('available','missing_confirmed') then
    update public.product_variants set active=(next_state='available')
    where id=candidate and active is distinct from (next_state='available');
  end if;
  return upper(next_state);
end;
$$;
revoke all on function public.record_catalog_availability(text,text,integer,timestamptz,text) from public, anon, authenticated;
grant execute on function public.record_catalog_availability(text,text,integer,timestamptz,text) to service_role;
