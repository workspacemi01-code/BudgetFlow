-- A brand palette per organisation.
--
-- The first attempt at this painted the whole product in one customer's
-- colours, which was wrong twice over: every other organisation inherited a
-- palette that is not theirs, and because the brand colour was red, an
-- over-budget warning stopped standing out — the page was already red
-- everywhere, so "you have overspent" looked like every button on it.
--
-- So the palette belongs to the organisation, and a named theme rather than a
-- free hex: a hex column would let anyone set a colour that fails contrast
-- against white text, or that collides with the red reserved for warnings.
-- Each named theme is tuned once, including its warning colour.

alter table public.organizations
  add column if not exists brand_theme text not null default 'default';

alter table public.organizations
  drop constraint if exists organizations_brand_theme_check;

alter table public.organizations
  add constraint organizations_brand_theme_check
  check (brand_theme in ('default', 'crimson'));

comment on column public.organizations.brand_theme is
  'Named palette for this org. default = teal; crimson = red with navy. Each theme keeps its warning colour distinct from its brand colour.';
