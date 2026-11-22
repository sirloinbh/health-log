import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { EmptyState } from './components/ui/empty-state';
import { Input } from './components/ui/input';
import { Notice } from './components/ui/notice';
import { toast } from './components/ui/sonner';
import { FoodDialog } from './food-dialog';
import { type Food, nutrients, sourceLabels } from './food-form';
import { useFoodSearch } from './food-search';
import { apiKey } from './lib/query';
import { useNotice } from './lib/use-notice';
import { MoreFoodsButton } from './more-foods-button';
import { useReturnFocus } from './return-focus';

// The server and database only store http(s) addresses; a link must never run script regardless.
const isSafeLink = (url: string) => /^https?:\/\//i.test(url);

function FoodCard({ food, onEdit }: { food: Food; onEdit: (opener: HTMLElement) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle asHeading="h2" className="break-words">
          {food.name}
        </CardTitle>
        <p className="text-body-sm text-muted-foreground">
          {[food.brand, food.category, `Serving ${food.servingSize}${food.servingUnit}`]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-body-sm sm:grid-cols-3">
          {nutrients.map(({ key, label, unit }) => (
            <div key={key}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd>{food[key] === null ? 'No value' : `${food[key]}${unit}`}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
          {food.isJunk ? <Badge variant="warning">Junk food</Badge> : null}
          <Badge variant="secondary">{sourceLabels[food.sourceType]}</Badge>
          {food.checkedOn ? <span>Verified {food.checkedOn}</span> : null}
          {food.sourceUrl && isSafeLink(food.sourceUrl) ? (
            <a
              href={food.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-4"
            >
              View source
            </a>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            aria-label={`Edit ${food.name}`}
            onClick={(event) => onEdit(event.currentTarget)}
          >
            <Pencil aria-hidden />
            Edit
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * A food's name, brand or values show in the meal cards, the combos and the recent foods, which read
 * through React Query; they read again the next time they are shown (#282).
 */
function foodChanged(client: QueryClient) {
  void client.invalidateQueries({
    predicate: ({ queryKey: [path] }) => typeof path === 'string' && path.startsWith('/api/meals/'),
  });
  void client.invalidateQueries({ queryKey: apiKey('/api/combos') });
  void client.invalidateQueries({ queryKey: apiKey('/api/foods/recent') });
}

export function FoodsPage() {
  const client = useQueryClient();
  const [query, setQuery] = useState('');
  // null: closed, 'new': adding, a food: editing it.
  const [editing, setEditing] = useState<Food | 'new' | null>(null);
  const { notice, error, clear } = useNotice();
  // A next page reports apart from the search, whose failure must stay in view: the list below it
  // is still the answer to the earlier words.
  const { notice: pageNotice, error: pageError, clear: clearPage } = useNotice();
  const shown = useRef<HTMLParagraphElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const { remember, returnFocus } = useReturnFocus(heading);
  const openDialog = (opener: HTMLElement, target: Food | 'new') => {
    remember(opener);
    setEditing(target);
  };
  const closeDialog = () => {
    setEditing(null);
    returnFocus();
  };
  // A failed search keeps the list on screen, along with the words that found it.
  const {
    foods,
    more,
    searching,
    loadingMore,
    applied,
    search: load,
    loadMore,
  } = useFoodSearch<Food>({
    onStart: clearPage,
    onSuccess: clear,
    onError: error,
    keepOnError: true,
    onMoreStart: clearPage,
    onMoreError: pageError,
  });

  useEffect(() => {
    void load('');
  }, [load]);

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1
          id="page-title"
          ref={heading}
          tabIndex={-1}
          className="rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Foods
        </h1>
        <p className="text-body text-muted-foreground">Manage nutrition values and sources.</p>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <form
          role="search"
          className="flex min-w-0 flex-1 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void load(query);
          }}
        >
          <Input
            type="search"
            aria-label="Search foods"
            placeholder="Name or brand"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <Button onClick={(event) => openDialog(event.currentTarget, 'new')}>
          <Plus aria-hidden />
          Add food
        </Button>
      </div>
      <Notice notice={notice} />
      {foods === null && !notice ? (
        <p role="status" className="text-body-sm text-muted-foreground">
          Loading…
        </p>
      ) : null}
      {foods?.length === 0 ? (
        <EmptyState title="No foods" description="Change the search term or add a food." />
      ) : null}
      {foods?.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {foods.map((food) => (
            <FoodCard key={food.id} food={food} onEdit={(opener) => openDialog(opener, food)} />
          ))}
        </div>
      ) : null}
      {/* Always in the page: a status region added along with its text may not be read out. */}
      <p
        ref={shown}
        role="status"
        tabIndex={-1}
        className="rounded-sm text-body-sm break-keep text-muted-foreground outline-none empty:hidden focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {foods?.length
          ? more
            ? `Showing ${foods.length} foods. There are more.`
            : `${foods.length} ${foods.length === 1 ? 'food' : 'foods'}`
          : null}
      </p>
      {foods?.length && more ? (
        <MoreFoodsButton loading={loadingMore || searching} onLoad={loadMore} afterLast={shown} />
      ) : null}
      <Notice notice={pageNotice} />
      {editing ? (
        <FoodDialog
          food={editing === 'new' ? null : editing}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog();
            // The saved food may not match the current search, so the list alone cannot confirm it.
            toast.success('Saved');
            void load(applied.current);
            foodChanged(client);
          }}
        />
      ) : null}
    </section>
  );
}
