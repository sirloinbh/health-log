# 영양성분 데이터 작성 규칙

음식 영양성분은 나중에 다시 검증할 수 있어야 한다. 이 규칙은 조사 이슈(#31, #32, #33)와 직접 입력에 모두 적용한다.

## 값

- 영양성분은 **1회 제공량 기준**으로 저장한다. 제품 표기가 100g 기준이면 1회 제공량을 `100`, `g`로 적는다.
- 칼로리는 kcal, 탄수화물·단백질·지방·당류는 g, 나트륨은 mg이다.
- **모르는 값은 NULL로 둔다. 0으로 적지 않는다.** 0은 실제로 0일 때만 쓴다.
- 같은 메뉴의 크기가 다르면 이름으로 구분한다. 예: `와퍼`, `와퍼 주니어`.
- 음식은 이름과 브랜드의 조합으로 구분하며 중복 등록할 수 없다.

## 출처

| `source_type` | 뜻                      | 출처 주소 | 확인 날짜 |
| ------------- | ----------------------- | --------- | --------- |
| `official`    | 제조사·브랜드 공식 자료 | 필수      | 필수      |
| `public`      | 공공 식품 영양성분 자료 | 필수      | 필수      |
| `label`       | 제품 포장의 표기        | 선택      | 필수      |
| `estimate`    | 추정값                  | 선택      | 선택      |
| `manual`      | 직접 입력 (출처 미상)   | 선택      | 선택      |

- 추정값을 `official`로 적지 않는다.
- 쇼핑몰이나 블로그에 옮겨 적힌 수치는 `official`이 아니다. 원본을 찾지 못하면 `estimate`로 적는다.

## 조사 데이터 넣기

조사 데이터는 `database/migrations/NNN_foods_<이름>.sql` 마이그레이션으로 넣는다. 아래 형식은 재실행해도 음식이 중복되지 않고, **확인 날짜가 더 새로운 조사만** 기존 값을 바꾼다. 그래서 재실행해도 나중에 화면에서 고친 값이 유지된다.

```sql
INSERT INTO foods (name, brand, category, serving_size, serving_unit, calories, carbs, protein, fat, sugars, sodium, source_type, source_url, checked_on)
VALUES
  (U&'\C608\C2DC', U&'\BE0C\B79C\B4DC', NULL, 100, 'g', 250, NULL, 10, 8, NULL, 500, 'official', 'https://example.com/nutrition', '2026-10-31')
ON CONFLICT (name, COALESCE(brand, '')) DO UPDATE SET
  category = EXCLUDED.category,
  serving_size = EXCLUDED.serving_size,
  serving_unit = EXCLUDED.serving_unit,
  calories = EXCLUDED.calories,
  carbs = EXCLUDED.carbs,
  protein = EXCLUDED.protein,
  fat = EXCLUDED.fat,
  sugars = EXCLUDED.sugars,
  sodium = EXCLUDED.sodium,
  source_type = EXCLUDED.source_type,
  source_url = EXCLUDED.source_url,
  checked_on = EXCLUDED.checked_on,
  updated_at = now()
WHERE foods.checked_on IS NULL OR EXCLUDED.checked_on > foods.checked_on;
```

SQL의 한글은 [DB 문서](../database/README.md)대로 `U&'\XXXX'` 이스케이프를 쓴다.

## 검증

조사 이슈는 각 이슈의 완료 기준대로 표본을 출처와 다시 대조하고 결과를 변경 기록에 남긴다.
