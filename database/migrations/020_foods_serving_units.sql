-- Serving units of seeded foods (#199). User decision 2026-11-22 (#199 comment): keep the unit each
-- source gives. Drinks the MFDS pages give per 100 g (005: cola, cider, orange juice, beer, soju,
-- makgeolli, milk, liquid yogurt) and the franchise drinks given in g (013: Lotteria, KFC, Mom's
-- Touch) stay in g. Only two things change, and the numbers stay as they are:
-- 1. Milliliters are written 'mL' everywhere. 013 wrote McDonald's 10 drinks as 'ml'.
-- 2. Three solid foods from 005 were stored in 'mL' because their MFDS pages say mL
--    (sweet and sour pork 343, fried squid 77, toast 230.3). They are solid foods, so 'g'.
-- Each update changes only a row that still has the seeded unit (and size), so a value fixed on the
-- screen later is kept when this runs again, and a second run changes nothing. checked_on stays:
-- the research date did not change.
--
-- Bibigo Galbitang 400g (014) keeps 85 kcal. The label CJ The Market showed on 2026-11-08 gives protein
-- 13 g and fat 4.8 g, which alone make about 95 kcal, so the label itself does not add up (see
-- docs/changes/32-bibigo-foods.md). Its source, /the/api/product/v1/nutritions/40145162, returned no
-- data on 2026-11-22, so the value could not be checked again and is left as the source gave it.

UPDATE foods SET serving_unit = 'mL', updated_at = now()
WHERE brand = U&'\B9E5\B3C4\B0A0\B4DC' AND serving_unit = 'ml' AND name IN (
  U&'\CF54\CE74 \CF5C\B77C \BBF8\B514\C5C4',
  U&'\CF54\CE74 \CF5C\B77C \B77C\C9C0',
  U&'\CF54\CE74 \CF5C\B77C \C81C\B85C \BBF8\B514\C5C4',
  U&'\CF54\CE74 \CF5C\B77C \C81C\B85C \B77C\C9C0',
  U&'\D658\D0C0 \BBF8\B514\C5C4',
  U&'\D658\D0C0 \B77C\C9C0',
  U&'\C2A4\D504\B77C\C774\D2B8 \BBF8\B514\C5C4',
  U&'\C2A4\D504\B77C\C774\D2B8 \B77C\C9C0',
  U&'\C2A4\D504\B77C\C774\D2B8 \C81C\B85C \BBF8\B514\C5C4',
  U&'\C2A4\D504\B77C\C774\D2B8 \C81C\B85C \B77C\C9C0'
);

UPDATE foods SET serving_unit = 'g', updated_at = now()
WHERE brand IS NULL AND serving_unit = 'mL' AND (name, serving_size) IN (
  (U&'\D0D5\C218\C721', 343),
  (U&'\C624\C9D5\C5B4\D280\AE40', 77),
  (U&'\D1A0\C2A4\D2B8(\C2DD\BE75)', 230.3)
);
