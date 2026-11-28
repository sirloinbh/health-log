import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Pill, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import { EmptyState } from './components/ui/empty-state';
import { Input } from './components/ui/input';
import { Notice } from './components/ui/notice';
import { toast } from './components/ui/sonner';
import { formatDate, inDailyRange, isValidDate } from './daily-date';
import { RequestError, requestJson } from './lib/api';
import { apiKey, type ApiRequest, useApiMutation } from './lib/query';
import { errorText, type NoticeValue, useNotice } from './lib/use-notice';
import { usedValues } from './lib/used-values';
import { cn } from './lib/utils';
import { medicationsPagePath } from './med-text';
import { MoreFoodsButton } from './more-foods-button';
import { remindersPath } from './reminder-text';
import { useReturnFocus } from './return-focus';
import { VisitDialog } from './visit-dialog';
import { clinicText, procedureText, type Visit, visitsPath, wonText } from './visit-text';
import { asRequest } from './writes';

function VisitCard({
  visit,
  onEdit,
  onDelete,
}: {
  visit: Visit;
  onEdit: (opener: HTMLElement) => void;
  onDelete: () => Promise<unknown>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle asHeading="h2" className="wrap-anywhere">
          {clinicText(visit)}
        </CardTitle>
        <p className="text-body-sm text-muted-foreground">{formatDate(visit.date)}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-body-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {visit.cost !== null ? (
            <>
              <dt className="text-muted-foreground">Visit cost</dt>
              <dd>{wonText(visit.cost)}</dd>
            </>
          ) : null}
          {visit.nextVisitOn ? (
            <>
              <dt className="text-muted-foreground">Next appointment</dt>
              <dd>{formatDate(visit.nextVisitOn)}</dd>
            </>
          ) : null}
          {visit.note ? (
            <>
              <dt className="text-muted-foreground">Note</dt>
              <dd className="wrap-anywhere whitespace-pre-line">{visit.note}</dd>
            </>
          ) : null}
        </dl>
        {visit.procedures.length ? (
          <ul aria-label="Procedures" className="flex flex-col gap-1">
            {visit.procedures.map((item, index) => (
              <li key={index} className="wrap-anywhere">
                {procedureText(item)}
                {item.note ? (
                  <span className="block text-muted-foreground">{item.note}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <ConfirmDialog
            title="Delete this clinic visit?"
            description="The procedures of this visit are deleted with it. This cannot be undone."
            onConfirm={onDelete}
            trigger={
              <Button
                variant="outline"
                size="sm"
                aria-label={`Delete ${visit.date} ${visit.clinic}`}
              >
                <Trash2 aria-hidden />
                Delete
              </Button>
            }
          />
          <Button asChild variant="outline" size="sm">
            {/* Records what was prescribed here, linked to this visit (#40). */}
            <Link
              to={`${medicationsPagePath}?visit=${visit.id}&date=${visit.date}`}
              aria-label={`${visit.date} ${visit.clinic} prescribed medication records`}
            >
              <Pill aria-hidden />
              Prescribed medication
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label={`Edit ${visit.date} ${visit.clinic}`}
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

type Page = { visits: Visit[]; more: boolean };

/** One search's list on the clinic page. Under `apiKey(visitsPath)`, so a change refreshes it with the daily card's. */
const listKey = (words: string) => apiKey(visitsPath, 'list', words);

/** `today` is undefined while the server is still being asked, and null if it could not say. */
export function VisitsPage({ today }: { today: string | null | undefined }) {
  const remover = useApiMutation<unknown, ApiRequest>(asRequest);
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  // The search box, and the words of the search last asked for.
  const [query, setQuery] = useState('');
  const [words, setWords] = useState('');
  // A read of the list fetches pages up to this many visits: as many as are shown, so a save or a
  // delete keeps the place of someone who loaded more (#208). A new search starts at one page.
  const keep = useRef(0);
  const list = useQuery<Page, RequestError>({
    queryKey: listKey(words),
    queryFn: async ({ signal }) => {
      const path = `${visitsPath}?q=${encodeURIComponent(words)}`;
      let page = await requestJson<Page>(path, { signal });
      const read = [...page.visits];
      while (page.more && read.length < keep.current) {
        page = await requestJson<Page>(`${path}&offset=${read.length}`, { signal });
        read.push(...page.visits);
      }
      return { visits: read, more: page.more };
    },
  });
  // The list on screen and the words it was found by. It stays while the next search is on its way,
  // and when that search fails.
  const [shown, setShown] = useState<{ words: string; page: Page } | null>(null);
  if (list.data && shown?.page !== list.data) setShown({ words, page: list.data });
  const visits = shown?.page.visits ?? null;
  const more = shown?.page.more ?? false;
  const applied = shown?.words ?? '';
  const [loadingMore, setLoadingMore] = useState(false);
  // While a search or a reload runs, the next page would be read for the list being replaced.
  const searching = list.isFetching;
  // null: closed. Otherwise the visit being edited (null for a new one) and the date it starts on.
  const [editing, setEditing] = useState<{ visit: Visit | null; date: string } | null>(null);
  // Hidden while reading again, so a repeated failure is announced anew.
  const notice: NoticeValue | undefined =
    list.isError && !list.isFetching ? { kind: 'error', text: errorText(list.error) } : undefined;
  const { notice: pageNotice, error: pageError, clear: clearPage } = useNotice();
  // The words asked for now, for a page that arrives after another search was asked.
  const askedWords = useRef(words);
  useEffect(() => {
    askedWords.current = words;
  }, [words]);
  const heading = useRef<HTMLHeadingElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const { remember, returnFocus } = useReturnFocus(heading);
  const [moveFocus, setMoveFocus] = useState(0);

  // A deleted visit takes its buttons with it, and a closing dialog restores focus on a timer first.
  useEffect(() => {
    if (!moveFocus) return;
    const timer = setTimeout(() => heading.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [moveFocus]);

  /** Reads the list for `next` from its first page; the same words read it again. */
  const search = (next: string) => {
    keep.current = 0;
    clearPage();
    setWords(next);
    void client.invalidateQueries({ queryKey: listKey(next), exact: true });
  };

  /**
   * After a save or a delete: reads the list again up to `count` visits, and tells the daily card and
   * the upcoming list, which show visits too.
   */
  const reload = (count: number) => {
    keep.current = count;
    clearPage();
    void client.invalidateQueries({ queryKey: apiKey(visitsPath) });
    void client.invalidateQueries({ queryKey: apiKey(remindersPath) });
  };

  // The daily page links here with ?new=<date> to record a visit on that day.
  const asked = params.get('new');
  useEffect(() => {
    if (asked === null) return;
    const inRange = isValidDate(asked) && inDailyRange(asked);
    // Without a usable date, wait for the server's today rather than open on a blank one.
    // If the server cannot say, open anyway and let the date be picked.
    if (!inRange && today === undefined) return;
    setParams({}, { replace: true });
    setEditing({ visit: null, date: inRange ? asked : (today ?? '') });
  }, [asked, setParams, today]);

  const loadMore = async () => {
    const before = list.data;
    if (!before) return false;
    const key = listKey(words);
    // A search or a reload asked since replaces the list; a page read for the one before is dropped.
    const current = () =>
      askedWords.current === words &&
      client.getQueryData(key) === before &&
      client.isFetching({ queryKey: key, exact: true }) === 0;
    setLoadingMore(true);
    clearPage();
    try {
      const page = await requestJson<Page>(
        `${visitsPath}?q=${encodeURIComponent(words)}&offset=${before.visits.length}`,
      );
      if (!current()) return false;
      const next = { visits: [...before.visits, ...page.visits], more: page.more };
      keep.current = next.visits.length;
      client.setQueryData<Page>(key, next);
      return !page.more;
    } catch (cause) {
      if (current()) pageError(cause);
      return false;
    } finally {
      setLoadingMore(false);
    }
  };

  const openDialog = (opener: HTMLElement | null, visit: Visit | null) => {
    if (opener) remember(opener);
    setEditing({ visit, date: visit?.date ?? today ?? '' });
  };
  const closeDialog = () => {
    setEditing(null);
    returnFocus();
  };

  const remove = async (visit: Visit) => {
    try {
      await remover.mutateAsync({ path: `${visitsPath}/${visit.id}`, method: 'DELETE' });
    } catch (cause) {
      // Already gone counts as deleted; anything else keeps the dialog open with the reason.
      if (!(cause instanceof RequestError && cause.status === 404)) {
        toast.error(errorText(cause));
        throw cause;
      }
    }
    toast.success('Deleted');
    // Dropped now, so its delete button is not what the closing dialog hands focus back to.
    client.setQueryData<Page>(
      listKey(words),
      (current) =>
        current && { ...current, visits: current.visits.filter((item) => item.id !== visit.id) },
    );
    setMoveFocus((count) => count + 1);
    reload((visits?.length ?? 0) - 1);
  };

  return (
    <section aria-labelledby="page-title" className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1
          id="page-title"
          ref={heading}
          tabIndex={-1}
          className="rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          Clinic
        </h1>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <form
          role="search"
          // A row of its own on a phone: beside the add button the field cut its hint short (#131).
          className="flex min-w-0 flex-1 basis-full gap-2 sm:basis-0"
          onSubmit={(event) => {
            event.preventDefault();
            search(query.trim());
          }}
        >
          <Input
            type="search"
            aria-label="Search clinic records"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        <Button onClick={(event) => openDialog(event.currentTarget, null)}>
          <Plus aria-hidden />
          Add visit
        </Button>
      </div>
      <Notice notice={notice} />
      {visits === null && !notice ? (
        <p role="status" className="text-body-sm text-muted-foreground">
          Loading…
        </p>
      ) : null}
      {visits?.length === 0 ? (
        <EmptyState
          title={applied ? 'No matching records' : 'No clinic records'}
          description={applied ? 'Try a different search term.' : 'Record your first clinic visit.'}
        />
      ) : null}
      {visits?.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {visits.map((visit) => (
            <VisitCard
              key={visit.id}
              visit={visit}
              onEdit={(opener) => openDialog(opener, visit)}
              onDelete={() => remove(visit)}
            />
          ))}
        </div>
      ) : null}
      {/* Always in the page: a status region added along with its text may not be read out. */}
      <p
        ref={status}
        role="status"
        tabIndex={-1}
        className={cn(
          'rounded-sm text-body-sm text-muted-foreground outline-none empty:hidden',
          'focus-visible:ring-[3px] focus-visible:ring-ring/50',
        )}
      >
        {visits?.length
          ? more
            ? `Showing ${visits.length} visits. There are more.`
            : `${visits.length} ${visits.length === 1 ? 'visit' : 'visits'}`
          : null}
      </p>
      {visits?.length && more ? (
        <MoreFoodsButton loading={loadingMore || searching} onLoad={loadMore} afterLast={status} />
      ) : null}
      <Notice notice={pageNotice} />
      {editing ? (
        <VisitDialog
          visit={editing.visit}
          date={editing.date}
          used={{
            clinics: usedValues(visits?.map((visit) => visit.clinic) ?? []),
            departments: usedValues(visits?.map((visit) => visit.department) ?? []),
          }}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog();
            toast.success('Saved');
            // A new visit takes a place in the list, so one more is read to keep the last one shown.
            reload((visits?.length ?? 0) + (editing.visit ? 0 : 1));
          }}
        />
      ) : null}
    </section>
  );
}
