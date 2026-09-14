-- Project D H07
-- Atomic review-analysis CAS and atomic product-score persistence.
--
-- This migration intentionally adds functions only.
-- No existing table data is modified when the migration is installed.

create or replace function public.project_d_save_review_analysis_cas_v1(
  p_category text,
  p_product_id uuid,
  p_origin_product_no bigint,
  p_product_name text,
  p_expected_review_analysis jsonb,
  p_next_review_analysis jsonb,
  p_updated_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_profile public.category_profiles%rowtype;
  v_product public.products%rowtype;
begin
  /*
   * Lock order is always:
   *   1. category_profiles
   *   2. products
   *
   * The score transaction uses the same order.
   * This makes review-save versus score-save serialization explicit.
   */
  select *
  into v_profile
  from public.category_profiles
  where category = p_category
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PROJECT_D_PROFILE_NOT_FOUND';
  end if;

  select *
  into v_product
  from public.products
  where id = p_product_id
    and category = p_category
    and origin_product_no = p_origin_product_no
    and product_name = p_product_name
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PROJECT_D_REVIEW_IDENTITY_CONFLICT';
  end if;

  /*
   * Exact old-value CAS.
   *
   * This also works for:
   * - NULL analysis
   * - legacy analysis without inputFingerprint
   * - current provenance-rich analysis
   */
  if
    to_jsonb(v_product.review_analysis)
      is distinct from
    p_expected_review_analysis
  then
    raise exception using
      errcode = 'P0001',
      message = 'PROJECT_D_REVIEW_CAS_CONFLICT';
  end if;

  update public.products
  set
    review_analysis =
      p_next_review_analysis,
    updated_at =
      p_updated_at
  where id = p_product_id;

  /*
   * New review evidence invalidates any category-level
   * score cache marker. Existing criterion_scores remain
   * visible data, but they can no longer be treated as a
   * current cache hit.
   */
  update public.category_profiles
  set
    score_generation_fingerprint =
      null,
    score_generated_at =
      null
  where category = p_category;

  return jsonb_build_object(
    'success', true,
    'dbProductId', p_product_id::text,
    'category', p_category,
    'originProductNo', p_origin_product_no,
    'updatedAt', p_updated_at
  );
end;
$$;


create or replace function public.project_d_commit_product_scores_v1(
  p_category text,
  p_expected_criteria jsonb,
  p_expected_common_cautions jsonb,
  p_products jsonb,
  p_score_generation_fingerprint text,
  p_score_generated_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_profile public.category_profiles%rowtype;
  v_product public.products%rowtype;
  v_item jsonb;

  v_product_ids text[];
  v_requested_count integer;
  v_unique_count integer;
  v_found_count integer;

  v_current_review_evidence jsonb;
  v_expected_review_evidence jsonb;
  v_expected_detail jsonb;

  v_scores jsonb;
  v_reasons jsonb;
begin
  if
    p_score_generation_fingerprint is null
    or btrim(p_score_generation_fingerprint) = ''
  then
    raise exception using
      errcode = 'P0001',
      message = 'PROJECT_D_SCORE_FINGERPRINT_REQUIRED';
  end if;

  if
    p_products is null
    or jsonb_typeof(p_products) <> 'array'
  then
    raise exception using
      errcode = 'P0001',
      message = 'PROJECT_D_SCORE_PRODUCTS_REQUIRED';
  end if;

  v_requested_count =
    jsonb_array_length(p_products);

  if
    v_requested_count < 2
    or v_requested_count > 5
  then
    raise exception using
      errcode = 'P0001',
      message = 'PROJECT_D_SCORE_PRODUCT_COUNT_INVALID';
  end if;

  select
    array_agg(
      item ->> 'productId'
      order by
        item ->> 'productId'
    ),
    count(
      distinct item ->> 'productId'
    )
  into
    v_product_ids,
    v_unique_count
  from jsonb_array_elements(
    p_products
  ) as source(item);

  if
    v_product_ids is null
    or array_length(
      v_product_ids,
      1
    ) <> v_requested_count
    or v_unique_count <> v_requested_count
    or exists (
      select 1
      from unnest(
        v_product_ids
      ) as product_id
      where
        product_id is null
        or btrim(product_id) = ''
    )
  then
    raise exception using
      errcode = 'P0001',
      message = 'PROJECT_D_SCORE_PRODUCT_MEMBERSHIP_INVALID';
  end if;

  /*
   * Lock the category profile before product rows.
   * Review CAS uses the same lock order.
   */
  select *
  into v_profile
  from public.category_profiles
  where category = p_category
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'PROJECT_D_PROFILE_NOT_FOUND';
  end if;

  /*
   * The profile evidence supplied to the AI must still
   * be exactly current at persistence time.
   */
  if
    to_jsonb(v_profile.criteria)
      is distinct from
    p_expected_criteria
    or
    to_jsonb(v_profile.common_cautions)
      is distinct from
    p_expected_common_cautions
  then
    raise exception using
      errcode = 'P0001',
      message = 'PROJECT_D_SCORE_PROFILE_CAS_CONFLICT';
  end if;

  /*
   * Lock every requested product in deterministic UUID order.
   * Nothing is written before the complete evidence check passes.
   */
  perform 1
  from public.products
  where category = p_category
    and id::text = any(
      v_product_ids
    )
  order by id
  for update;

  select count(*)
  into v_found_count
  from public.products
  where category = p_category
    and id::text = any(
      v_product_ids
    );

  if
    v_found_count <> v_requested_count
  then
    raise exception using
      errcode = 'P0001',
      message = 'PROJECT_D_SCORE_PRODUCT_SET_CONFLICT';
  end if;

  /*
   * Validate the complete AI input snapshot before ANY write.
   */
  for v_item in
    select value
    from jsonb_array_elements(
      p_products
    )
  loop
    if
      not (
        v_item ?
          'productId'
      )
      or not (
        v_item ?
          'productName'
      )
      or not (
        v_item ?
          'sourceUrl'
      )
      or not (
        v_item ?
          'expectedReviewEvidence'
      )
      or not (
        v_item ?
          'expectedProductDetailAnalysis'
      )
      or not (
        v_item ?
          'criterionScores'
      )
      or not (
        v_item ?
          'criterionReasons'
      )
    then
      raise exception using
        errcode = 'P0001',
        message = 'PROJECT_D_SCORE_PAYLOAD_INCOMPLETE';
    end if;

    select *
    into v_product
    from public.products
    where category = p_category
      and id::text =
        v_item ->> 'productId';

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'PROJECT_D_SCORE_PRODUCT_SET_CONFLICT';
    end if;

    if
      v_product.product_name
        is distinct from
      v_item ->> 'productName'
      or
      v_product.source_url
        is distinct from
      v_item ->> 'sourceUrl'
    then
      raise exception using
        errcode = 'P0001',
        message = 'PROJECT_D_SCORE_IDENTITY_CAS_CONFLICT';
    end if;

    v_current_review_evidence =
      to_jsonb(
        v_product.review_analysis
      );

    /*
     * Comparative score reasons are score-owned output.
     * They are deliberately excluded from review evidence CAS,
     * exactly as the TypeScript score fingerprint excludes them.
     */
    if
      v_current_review_evidence is not null
      and
      jsonb_typeof(
        v_current_review_evidence
      ) = 'object'
    then
      v_current_review_evidence =
        v_current_review_evidence
          - 'criterionReasons'
          - 'criterion_reasons'
          - 'criterionScores'
          - 'criterion_scores';
    end if;

    v_expected_review_evidence =
      v_item ->
        'expectedReviewEvidence';

    v_expected_detail =
      v_item ->
        'expectedProductDetailAnalysis';

    if
      v_current_review_evidence
        is distinct from
      v_expected_review_evidence
    then
      raise exception using
        errcode = 'P0001',
        message = 'PROJECT_D_SCORE_REVIEW_CAS_CONFLICT';
    end if;

    if
      to_jsonb(
        v_product.product_detail_analysis
      )
        is distinct from
      v_expected_detail
    then
      raise exception using
        errcode = 'P0001',
        message = 'PROJECT_D_SCORE_DETAIL_CAS_CONFLICT';
    end if;

    v_scores =
      v_item ->
        'criterionScores';

    v_reasons =
      v_item ->
        'criterionReasons';

    if
      jsonb_typeof(
        v_scores
      ) <> 'object'
      or
      jsonb_typeof(
        v_reasons
      ) <> 'object'
    then
      raise exception using
        errcode = 'P0001',
        message = 'PROJECT_D_SCORE_RESULT_INVALID';
    end if;
  end loop;

  /*
   * Every precondition passed.
   * From this point all product writes and the profile marker
   * are one PostgreSQL transaction.
   */
  for v_item in
    select value
    from jsonb_array_elements(
      p_products
    )
  loop
    v_scores =
      v_item ->
        'criterionScores';

    v_reasons =
      v_item ->
        'criterionReasons';

    update public.products
    set
      criterion_scores =
        v_scores,

      review_analysis =
        (
          case
            when
              review_analysis is not null
              and
              jsonb_typeof(
                to_jsonb(
                  review_analysis
                )
              ) = 'object'
              then
                to_jsonb(
                  review_analysis
                )
            else
              '{}'::jsonb
          end
        )
        ||
        jsonb_build_object(
          'criterionReasons',
            v_reasons,
          'criterion_reasons',
            v_reasons
        ),

      updated_at =
        p_score_generated_at
    where category = p_category
      and id::text =
        v_item ->> 'productId';
  end loop;

  update public.category_profiles
  set
    score_generation_fingerprint =
      p_score_generation_fingerprint,
    score_generated_at =
      p_score_generated_at
  where category = p_category;

  return jsonb_build_object(
    'success', true,
    'category', p_category,
    'updatedCount', v_requested_count,
    'scoreGenerationFingerprint',
      p_score_generation_fingerprint,
    'scoreGeneratedAt',
      p_score_generated_at
  );
end;
$$;


revoke all
on function public.project_d_save_review_analysis_cas_v1(
  text,
  uuid,
  bigint,
  text,
  jsonb,
  jsonb,
  timestamptz
)
from public;

revoke all
on function public.project_d_save_review_analysis_cas_v1(
  text,
  uuid,
  bigint,
  text,
  jsonb,
  jsonb,
  timestamptz
)
from anon, authenticated;

grant execute
on function public.project_d_save_review_analysis_cas_v1(
  text,
  uuid,
  bigint,
  text,
  jsonb,
  jsonb,
  timestamptz
)
to service_role;


revoke all
on function public.project_d_commit_product_scores_v1(
  text,
  jsonb,
  jsonb,
  jsonb,
  text,
  timestamptz
)
from public;

revoke all
on function public.project_d_commit_product_scores_v1(
  text,
  jsonb,
  jsonb,
  jsonb,
  text,
  timestamptz
)
from anon, authenticated;

grant execute
on function public.project_d_commit_product_scores_v1(
  text,
  jsonb,
  jsonb,
  jsonb,
  text,
  timestamptz
)
to service_role;
