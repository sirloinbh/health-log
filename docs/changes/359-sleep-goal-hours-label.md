# Capitalise the Hours label in the Sleep goal card (#359)

The Sleep goal card showed the unit text `hours` in lowercase as the visible label of its first field, next to the capitalised "Minutes".

| File                          | Change                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `frontend/src/goals.tsx`      | The sleep hours field's visible label is "Hours". Its accessible name is unchanged |
| `frontend/src/goals.test.tsx` | The sleep goal test pins the visible labels "Hours" and "Minutes"                  |

Verification: see the PR.
