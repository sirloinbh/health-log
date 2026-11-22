import { Pencil, Pill, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { type ApiRequest, useApiMutation } from './lib/query';
import { errorText, useNotice } from './lib/use-notice';
import { cn } from './lib/utils';
import { medicationsPagePath } from './med-text';
import { MoreFoodsButton } from './more-foods-button';
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

/** `today` is undefined while the server is still being asked, and null if it could not say. */
export function VisitsPage({ today }: { today: string | null | undefined }) {
  const remover = useApiMutation<unknown, ApiRequest>(asRequest);
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const applied = useRef('');
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // While a search or a reload runs, the next page would be read for the list being replaced.
  const [searching, setSearching] = useState(false);
  // null: closed. Otherwise the visit being edited (null for a new one) and the date it starts on.
  const [editing, setEditing] = useState<{ visit: Visit | null; date: string } | null>(null);
  const { notice, error, clear } = useNotice();
  const { notice: pageNotice, error: pageError, clear: clearPage } = useNotice();
  const latest = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef<HTMLParagraphElement>(null);
  const { remember, returnFocus } = useReturnFocus(heading);
  const [moveFocus, setMoveFocus] = useState(0);

  // A deleted visit takes its buttons with it, and a closing dialog restores focus on a timer first.
  useEffect(() => {
    if (!moveFocus) return;
    const timer = setTimeout(() => heading.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [moveFocus]);

  /**
   * Reads the list from the start. `keep` is how many visits were shown: after a save or a delete
   * the pages are read again up to that many, so someone who loaded more keeps their place (#208).
   */
  const load = useCallback(
    async (words: string, keep = 0) => {
      // A slow older answer must not overwrite a newer one.
      const request = ++latest.current;
      clearPage();
      setSearching(true);
      try {
        const path = `${visitsPath}?q=${encodeURIComponent(words)}`;
        let page = await requestJson<Page>(path);
        const list = [...page.visits];
        while (page.more && list.length < keep) {
          if (request !== latest.current) return;
          page = await requestJson<Page>(`${path}&offset=${list.length}`);
          list.push(...page.visits);
        }
        if (request !== latest.current) return;
        applied.current = words;
        clear();
        setVisits(list);
        setMore(page.more);
      } catch (cause) {
        if (request === latest.current) error(cause);
      } finally {
        if (request === latest.current) setSearching(false);
      }
    },
    [clear, clearPage, error],
  );

  useEffect(() => {
    void load('');
  }, [load]);

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
    const request = latest.current;
    setLoadingMore(true);
    clearPage();
    try {
      const page = await requestJson<Page>(
        `${visitsPath}?q=${encodeURIComponent(applied.current)}&offset=${visits?.length ?? 0}`,
      );
      if (request !== latest.current) return false;
      setVisits((current) => [...(current ?? []), ...page.visits]);
      setMore(page.more);
      return !page.more;
    } catch (cause) {
      if (request === latest.current) pageError(cause);
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
    setVisits((list) => list?.filter((item) => item.id !== visit.id) ?? list);
    setMoveFocus((count) => count + 1);
    void load(applied.current, (visits?.length ?? 0) - 1);
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
        <p className="text-body text-muted-foreground">
          Record clinic visits and the procedures you had, and look them up again.
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <form
          role="search"
          // A row of its own on a phone: beside the add button the field cut its hint short (#131).
          className="flex min-w-0 flex-1 basis-full gap-2 sm:basis-0"
          onSubmit={(event) => {
            event.preventDefault();
            void load(query.trim());
          }}
        >
          <Input
            type="search"
            aria-label="Search clinic records"
            placeholder="Clinic or procedure name"
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
          title={applied.current ? 'No matching records' : 'No clinic records'}
          description={
            applied.current ? 'Try a different search term.' : 'Record your first clinic visit.'
          }
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
        ref={shown}
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
        <MoreFoodsButton loading={loadingMore || searching} onLoad={loadMore} afterLast={shown} />
      ) : null}
      <Notice notice={pageNotice} />
      {editing ? (
        <VisitDialog
          visit={editing.visit}
          date={editing.date}
          onClose={closeDialog}
          onSaved={() => {
            closeDialog();
            toast.success('Saved');
            // A new visit takes a place in the list, so one more is read to keep the last one shown.
            void load(applied.current, (visits?.length ?? 0) + (editing.visit ? 0 : 1));
          }}
        />
      ) : null}
    </section>
  );
}
