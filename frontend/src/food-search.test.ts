import { act, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { foodsUrl, resultText, useFoodSearch } from './food-search';

type Food = { id: number; name: string };

const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status });
const foodsFrom = (from: number, count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: from + index, name: `음식 ${from + index}` }));

const serve = (reply: (url: string) => Response | Promise<Response>) => {
  const fetchMock = vi.fn((url: string) => Promise.resolve(reply(url)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const setup = (keepOnError = false) => {
  const onError = vi.fn();
  const view = renderHook(() => useFoodSearch<Food>({ onError, keepOnError }));
  return { onError, view };
};

test('the first page leaves the offset out, and later pages ask for theirs', () => {
  expect(foodsUrl('김치 100%')).toBe('/api/foods?q=%EA%B9%80%EC%B9%98%20100%25');
  expect(foodsUrl('', 100)).toBe('/api/foods?q=&offset=100');
});

test('the status says when more results are waiting', () => {
  expect(resultText(3, false)).toBe('검색 결과 3건');
  expect(resultText(100, true)).toBe('검색 결과 100건 표시 중, 결과가 더 있습니다');
});

test('the next page is added under the first, for the query that found it', async () => {
  const fetchMock = serve((url) =>
    url.endsWith('offset=100')
      ? json({ foods: foodsFrom(101, 50), nextOffset: null })
      : json({ foods: foodsFrom(1, 100), nextOffset: 100 }),
  );
  const { view } = setup();
  await act(() => view.result.current.search('밥'));
  expect(view.result.current.foods).toHaveLength(100);
  expect(view.result.current.more).toBe(true);

  await act(() => view.result.current.loadMore());
  expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/foods?q=%EB%B0%A5&offset=100');
  expect(view.result.current.foods?.map((food) => food.id)).toEqual(
    Array.from({ length: 150 }, (_, index) => index + 1),
  );
  expect(view.result.current.more).toBe(false);
});

test('a food already shown is not listed twice when the next page repeats it', async () => {
  // A food added after the first page pushes the last one shown onto the next page.
  serve((url) =>
    url.endsWith('offset=100')
      ? json({ foods: foodsFrom(100, 3), nextOffset: null })
      : json({ foods: foodsFrom(1, 100), nextOffset: 100 }),
  );
  const { view } = setup();
  await act(() => view.result.current.search(''));
  await act(() => view.result.current.loadMore());
  const ids = view.result.current.foods?.map((food) => food.id) ?? [];
  expect(ids).toHaveLength(102);
  expect(new Set(ids).size).toBe(ids.length);
});

test('a reply without a next offset is the last page', async () => {
  serve(() => json({ foods: foodsFrom(1, 2) }));
  const { view } = setup();
  await act(() => view.result.current.search(''));
  expect(view.result.current.more).toBe(false);
});

test('a failed next page keeps the pages shown and lets the user try again', async () => {
  let fail = true;
  serve((url) => {
    if (!url.endsWith('offset=100')) return json({ foods: foodsFrom(1, 100), nextOffset: 100 });
    return fail
      ? json({ error: '서버 오류가 발생했습니다' }, 500)
      : json({ foods: foodsFrom(101, 1), nextOffset: null });
  });
  const { view, onError } = setup();
  await act(() => view.result.current.search(''));
  await act(() => view.result.current.loadMore());
  expect(onError).toHaveBeenCalledTimes(1);
  expect(view.result.current.foods).toHaveLength(100);
  expect(view.result.current.more).toBe(true);
  expect(view.result.current.loadingMore).toBe(false);

  fail = false;
  await act(() => view.result.current.loadMore());
  expect(view.result.current.foods).toHaveLength(101);
});

test('a new search drops a next page still on its way', async () => {
  let finishPage = (_response: Response) => {};
  serve((url) => {
    if (url.endsWith('offset=100')) return new Promise((resolve) => (finishPage = resolve));
    if (url.includes('q=new'))
      return json({ foods: [{ id: 900, name: '새 음식' }], nextOffset: null });
    return json({ foods: foodsFrom(1, 100), nextOffset: 100 });
  });
  const { view } = setup();
  await act(() => view.result.current.search('old'));
  let page: Promise<boolean> = Promise.resolve(false);
  act(() => {
    page = view.result.current.loadMore();
  });
  await act(() => view.result.current.search('new'));
  expect(view.result.current.loadingMore).toBe(false);

  finishPage(json({ foods: foodsFrom(101, 5), nextOffset: null }));
  await act(() => page);
  expect(view.result.current.foods).toEqual([{ id: 900, name: '새 음식' }]);
});

test('asking for the next page during a search does nothing', async () => {
  let finishSearch = (_response: Response) => {};
  const fetchMock = serve((url) => {
    if (url.includes('q=slow')) return new Promise((resolve) => (finishSearch = resolve));
    return json({ foods: foodsFrom(1, 100), nextOffset: 100 });
  });
  const { view } = setup();
  await act(() => view.result.current.search(''));
  let search: Promise<void> = Promise.resolve();
  act(() => {
    search = view.result.current.search('slow');
  });
  await act(() => view.result.current.loadMore());
  expect(fetchMock.mock.calls.some(([url]) => url.includes('offset='))).toBe(false);

  // The search still finishes, instead of waiting behind a page request it no longer owns.
  finishSearch(json({ foods: foodsFrom(500, 1), nextOffset: null }));
  await act(() => search);
  expect(view.result.current.searching).toBe(false);
  expect(view.result.current.foods).toEqual([{ id: 500, name: '음식 500' }]);
});

test('a failed search empties the list, unless asked to keep it', async () => {
  let fail = false;
  serve(() =>
    fail ? json({ error: '서버 오류' }, 500) : json({ foods: foodsFrom(1, 2), nextOffset: null }),
  );
  const cleared = setup();
  await act(() => cleared.view.result.current.search('a'));
  fail = true;
  await act(() => cleared.view.result.current.search('b'));
  expect(cleared.view.result.current.foods).toBeNull();

  fail = false;
  const kept = setup(true);
  await act(() => kept.view.result.current.search('a'));
  fail = true;
  await act(() => kept.view.result.current.search('b'));
  expect(kept.view.result.current.foods).toHaveLength(2);
  // The list on screen is still the answer to "a", so a reload asks for "a" again.
  expect(kept.view.result.current.applied.current).toBe('a');
});

test('a next page runs its own callbacks, not the search ones, and says when it was the last', async () => {
  serve((url) =>
    url.endsWith('offset=200')
      ? json({ foods: foodsFrom(201, 1), nextOffset: null })
      : url.endsWith('offset=100')
        ? json({ foods: foodsFrom(101, 100), nextOffset: 200 })
        : json({ foods: foodsFrom(1, 100), nextOffset: 100 }),
  );
  const calls: string[] = [];
  const view = renderHook(() =>
    useFoodSearch<Food>({
      onStart: () => calls.push('start'),
      onSuccess: () => calls.push('success'),
      onError: () => calls.push('error'),
      onMoreStart: () => calls.push('more-start'),
      onMoreError: () => calls.push('more-error'),
    }),
  );
  await act(() => view.result.current.search(''));
  let last: boolean | undefined;
  await act(async () => {
    last = await view.result.current.loadMore();
  });
  expect(last).toBe(false);
  await act(async () => {
    last = await view.result.current.loadMore();
  });
  expect(last).toBe(true);
  expect(calls).toEqual(['start', 'success', 'more-start', 'more-start']);
});

test('a second press while a page loads does not ask for it again', async () => {
  let finish = (_response: Response) => {};
  const fetchMock = serve((url) =>
    url.endsWith('offset=100')
      ? new Promise((resolve) => (finish = resolve))
      : json({ foods: foodsFrom(1, 100), nextOffset: 100 }),
  );
  const { view } = setup();
  await act(() => view.result.current.search(''));
  let first: Promise<boolean> = Promise.resolve(false);
  act(() => {
    first = view.result.current.loadMore();
  });
  await act(async () => {
    expect(await view.result.current.loadMore()).toBe(false);
  });
  expect(fetchMock.mock.calls.filter(([url]) => url.includes('offset='))).toHaveLength(1);
  finish(json({ foods: foodsFrom(101, 1), nextOffset: null }));
  await act(async () => {
    expect(await first).toBe(true);
  });
});
