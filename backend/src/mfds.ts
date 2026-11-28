import type { RequestHandler } from 'express';
import { z } from 'zod/v4';

import { maxAmount } from './contract.js';
import { charCount } from './text.js';

// #118: look a food up in the MFDS (Ministry of Food and Drug Safety) food nutrition database on the
// Public Data Portal, so the add-food screen can fill a draft from it. Nothing here saves: the person
// checks the draft and saves it as any other food. The database gives values per 100 g (or 100 mL) and
// the total content; docs/food-data.md says to store them converted to the total content.

const endpoint = 'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo03/getFoodNtrCpntDbInq03';
const detailPage = 'https://various.foodsafetykorea.go.kr/nutrient/general/food/detail.do';
const timeoutMs = 8000;
/** How many matches one search shows; the answer says how many there are in all. */
const mfdsPageSize = 20;

export const mfdsQuery = z.object({
  q: z
    .string({ error: 'Enter a food name to search for' })
    .trim()
    .refine((value) => value.length >= 1, 'Enter a food name to search for')
    .refine((value) => charCount(value) <= 50, 'The food name must be 50 characters or fewer'),
  maker: z
    .string({ error: 'The maker is not valid' })
    .trim()
    .refine((value) => charCount(value) <= 50, 'The maker must be 50 characters or fewer')
    .default(''),
});

// The fields the draft needs. Values arrive as text such as "2,117.000", or "" when unknown.
const text = z.string().nullable().optional();
const item = z.object({
  FOOD_CD: z.string(),
  FOOD_NM_KR: z.string(),
  DB_GRP_NM: text,
  MAKER_NM: text,
  SERVING_SIZE: text,
  Z10500: text,
  AMT_NUM1: text,
  AMT_NUM3: text,
  AMT_NUM4: text,
  AMT_NUM6: text,
  AMT_NUM7: text,
  AMT_NUM13: text,
  UPDATE_DATE: text,
});
const answer = z.object({
  header: z.object({ resultCode: z.string(), resultMsg: z.string().optional() }),
  body: z.object({ totalCount: z.number().int(), items: z.array(item).optional() }),
});
type Item = z.infer<typeof item>;

/** A number from the database's text, or null when it is blank, "-", or not a number. */
export const amountOf = (value: string | null | undefined) => {
  const cleaned = (value ?? '').replace(/,/g, '').trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
};

/** "100g", "77.00g" or "200mL" as a size and the unit the food data rules use (g, mL). */
export const sizeOf = (value: string | null | undefined) => {
  const match = /^([\d,]+(?:\.\d+)?)\s*(g|ml)$/i.exec((value ?? '').trim());
  if (!match) return null;
  const size = amountOf(match[1]);
  if (!size) return null;
  return { size, unit: match[2].toLowerCase() === 'g' ? 'g' : 'mL' };
};

const twoDecimals = (value: number) => Math.round(value * 100) / 100;

// The limits of POST /api/foods (foods.ts), so a picked draft can be saved as it is.
const nameLimit = 100;
const brandLimit = 50;

/** The draft name: the total goes at the end (docs/food-data.md) when it fits; a long name is cut. */
export const nameOf = (name: string, total: string | null) => {
  const withTotal = total ? `${name} ${total}` : name;
  if (charCount(withTotal) <= nameLimit) return withTotal;
  return [...name].slice(0, nameLimit).join('').trim();
};

/** "(주)농심" and "농심 주식회사" are the brand 농심. A maker too long for a brand is left out. */
export const brandOf = (maker: string | null | undefined) => {
  const brand = (maker ?? '')
    .replace(/\((주|유|사)\)|㈜|주식회사|유한회사/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return brand && charCount(brand) <= brandLimit ? brand : null;
};

const amountKeys = {
  calories: 'AMT_NUM1',
  protein: 'AMT_NUM3',
  fat: 'AMT_NUM4',
  carbs: 'AMT_NUM6',
  sugars: 'AMT_NUM7',
  sodium: 'AMT_NUM13',
} as const;

/**
 * One match as the screen shows it, with the food draft it fills. The values are converted from the
 * basis (100 g) to the total content when the total is in the same unit and differs from the basis;
 * otherwise the draft keeps the basis as its serving. A total larger than the API accepts is not used.
 * A converted value outside the API's range is left blank, as an unknown value is. A record whose
 * basis cannot be read is null: its values would be for an amount nobody knows.
 */
export function resultOf(row: Item) {
  const basis = sizeOf(row.SERVING_SIZE);
  if (!basis || basis.size > maxAmount) return null;
  const total = sizeOf(row.Z10500);
  const usesTotal =
    total !== null &&
    total.unit === basis.unit &&
    total.size !== basis.size &&
    twoDecimals(total.size) <= maxAmount;
  const serving = usesTotal ? total : basis;
  const scale = serving.size / basis.size;
  const values = Object.fromEntries(
    Object.entries(amountKeys).map(([key, field]) => {
      const value = amountOf(row[field]);
      const scaled = value === null ? null : twoDecimals(value * scale);
      return [key, scaled !== null && scaled <= maxAmount ? scaled : null];
    }),
  ) as Record<keyof typeof amountKeys, number | null>;
  const sourceUrl = new URL(detailPage);
  sourceUrl.searchParams.set('searchFoodCd', row.FOOD_CD);
  sourceUrl.searchParams.set('searchRegionCd', 'ZZ');
  sourceUrl.searchParams.set('searchMonthCd', 'AVG');
  const totalText = total ? `${twoDecimals(total.size)}${total.unit}` : null;
  return {
    code: row.FOOD_CD,
    name: row.FOOD_NM_KR,
    maker: row.MAKER_NM?.trim() || null,
    group: row.DB_GRP_NM?.trim() || null,
    basis: `${twoDecimals(basis.size)}${basis.unit}`,
    total: totalText,
    updatedOn: /^\d{4}-\d{2}-\d{2}$/.test(row.UPDATE_DATE ?? '') ? row.UPDATE_DATE! : null,
    food: {
      name: nameOf(row.FOOD_NM_KR, usesTotal ? totalText : null),
      brand: brandOf(row.MAKER_NM),
      servingSize: twoDecimals(serving.size),
      servingUnit: serving.unit,
      ...values,
      sourceType: 'public' as const,
      sourceUrl: sourceUrl.toString(),
    },
  };
}

type Result = NonNullable<ReturnType<typeof resultOf>>;

/**
 * The database holds the same product more than once under different codes, with the same values.
 * Matches whose drafts are the same apart from the source page show once, as the most recently updated
 * record (docs/food-data.md: newest first), in the place the first one had.
 */
export function withoutRepeats(results: Result[]) {
  const kept = new Map<string, Result>();
  for (const result of results) {
    const { sourceUrl: _page, ...draft } = result.food;
    const key = JSON.stringify([result.maker, result.group, draft]);
    const earlier = kept.get(key);
    if (!earlier || (result.updatedOn ?? '') > (earlier.updatedOn ?? '')) kept.set(key, result);
  }
  return [...kept.values()];
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/**
 * GET /api/foods/mfds?q=&maker=: matches from the MFDS database. Without a key (FOOD_NTR_SERVICE_KEY)
 * the state is "off" and the screen says the lookup is not set up; when the portal cannot answer it is
 * "unavailable". The key goes only to the portal and is never logged or returned.
 */
export function mfdsLookup(
  serviceKey: string | undefined,
  fetchImpl: Fetch = fetch,
): RequestHandler {
  return async (req, res) => {
    const { q, maker } = mfdsQuery.parse(req.query);
    if (!serviceKey) {
      res.json({ state: 'off' });
      return;
    }
    try {
      const url = new URL(endpoint);
      url.searchParams.set('serviceKey', serviceKey);
      url.searchParams.set('pageNo', '1');
      url.searchParams.set('numOfRows', String(mfdsPageSize));
      url.searchParams.set('type', 'json');
      url.searchParams.set('FOOD_NM_KR', q);
      if (maker) url.searchParams.set('MAKER_NM', maker);
      const reply = await fetchImpl(url.toString(), { signal: AbortSignal.timeout(timeoutMs) });
      // An unregistered or expired key answers 403 with its reason in the body.
      if (!reply.ok) throw new Error(`the portal answered ${reply.status}`);
      const parsed = answer.parse(await reply.json());
      if (parsed.header.resultCode !== '00') {
        throw new Error(`the portal answered result code ${parsed.header.resultCode}`);
      }
      const items = (parsed.body.items ?? []).slice(0, mfdsPageSize);
      // read: how many records this answer looked at, so the screen can say when more are left.
      res.json({
        state: 'ok',
        total: parsed.body.totalCount,
        read: items.length,
        results: withoutRepeats(
          items.map(resultOf).filter((result): result is Result => result !== null),
        ),
      });
    } catch (error) {
      // The log names the status or the result code; the key is cut out in case a message ever holds it.
      const reason =
        error instanceof z.ZodError
          ? 'the answer had an unexpected shape'
          : (error as Error).message;
      // The key as written and as encoded in the address, in case a message ever quotes the request.
      const forms = [
        serviceKey,
        encodeURIComponent(serviceKey),
        new URLSearchParams({ k: serviceKey }).toString().slice(2),
      ];
      const message = forms.reduce((text, form) => text.split(form).join('<key>'), reason);
      console.warn(JSON.stringify({ event: 'mfds_unavailable', message }));
      res.json({ state: 'unavailable' });
    }
  };
}
