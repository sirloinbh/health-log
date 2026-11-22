/**
 * A calorie amount as the screens show it: rounded to a whole number with en-US grouping, so a
 * combo, a junk-food total and the report all read "1,235kcal" (#206). The API sums servings
 * exactly, so totals can carry fractions such as 1234.75.
 */
export const kcalText = (value: number) => `${Math.round(value).toLocaleString('en-US')}kcal`;
