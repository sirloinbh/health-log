# #352 Pick values instead of typing them in forms

- Issue: [#352](https://github.com/sirloinbh/health-log/issues/352)
- Branch: `feat/352-pick-values`
- Related: sirloinbh/project-standards#1130

## Free-text field list

Every text input was listed and marked. Fields with a known or repeating set of values became pickers; the rest stay free text.

| Form | Field | Result |
|---|---|---|
| Food | Brand, Category, Unit | Combobox: values already in the food list; the unit also offers `g` and `ml` |
| Lab result | Test name | Combobox from `/api/labs/names` |
| Lab result | Unit | Combobox: units already used, plus mg/dL, mmol/L, g/dL, U/L, % |
| Medication | Name, Dose, Directions | Combobox: values already on the medicine lists |
| Clinic visit | Clinic name, Department | Combobox: values already in the loaded visits |
| Already pickers or typed numbers/dates | dates, times, number fields, source type, meal, drink kind | unchanged |
| Open values | food name, notes and memos, procedure names, areas and amounts, costs, search boxes | stay free text |

A combobox still accepts a new value: typing something that is not in the list is always allowed, so "add new" works.

## Change — 2026-11-27

- `frontend/src/lib/used-values.ts` (`usedValues`): distinct values, most used first, case and outer spaces ignored, then the common ones not used yet.
- The pickers use the shared `Combobox`. The lists come from data the page already loaded, so there is no new request except the lab test names (already an API).
- Tests: `used-values.test.ts`; the lab dialog picks a name and a unit from the lists.
