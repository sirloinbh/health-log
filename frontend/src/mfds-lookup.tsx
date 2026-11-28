import { type KeyboardEvent, useState } from 'react';

import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import type { Form } from './food-form';
import { serviceToday } from './lib/format';
import { apiKey, useApiQuery } from './lib/query';
import {
  fillFromMfds,
  type MfdsAnswer,
  mfdsPath,
  moreText,
  noMatchText,
  offText,
  resultText,
  unavailableText,
} from './mfds';

const emptyText = 'Enter a food name to search for';

// Counts every search on the page, not per dialog: the dialog unmounts on close, and a count that
// started again would meet the answers cached by the dialog opened before.
let searches = 0;

/**
 * #118: search the MFDS food nutrition database and fill the form from a match. Only the app's API is
 * called; it holds the portal key. Picking a match fills the fields; nothing is saved until Save.
 */
export function MfdsLookup({
  form,
  locked,
  onFill,
}: {
  form: Form;
  locked: boolean;
  onFill: (form: Form) => void;
}) {
  const [name, setName] = useState('');
  const [maker, setMaker] = useState('');
  // Each press is its own search (`count` is in the query key), so pressing again always asks the
  // portal again, even for words searched before: it may answer now after failing. An answer never
  // goes stale, so a window that gets focus back does not search again on its own.
  const [search, setSearch] = useState<{ path: string; count: number } | null>(null);
  const [missingName, setMissingName] = useState(false);
  const [filled, setFilled] = useState<string[] | null>(null);
  const query = useApiQuery<MfdsAnswer>(
    apiKey(search?.path ?? '', search?.count),
    search?.path ?? '',
    { enabled: search !== null, staleTime: Infinity },
  );
  const answer = search !== null ? query.data : undefined;
  const searching = search !== null && query.isFetching;

  const run = () => {
    const q = name.trim();
    setMissingName(q === '');
    if (!q) return;
    setFilled(null);
    searches += 1;
    setSearch({ path: mfdsPath(q, maker.trim()), count: searches });
  };
  // The fields sit inside the food form: Enter here searches instead of saving the food. Enter that
  // ends a Korean input composition only finishes the word (Safari reports that Enter as key code 229).
  const onEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    const composing = event.nativeEvent.isComposing || event.keyCode === 229;
    if (event.key !== 'Enter' || composing) return;
    event.preventDefault();
    if (!locked) run();
  };

  const results = answer?.state === 'ok' ? answer.results : [];
  const more = answer?.state === 'ok' ? moreText(answer.read, answer.total) : null;
  const problem = missingName
    ? emptyText
    : query.isError && search !== null && !searching
      ? query.error.message
      : null;

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-body-sm font-medium">Find in the MFDS database</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="mfds-name">MFDS food name</Label>
          <Input
            id="mfds-name"
            autoComplete="off"
            readOnly={locked}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={onEnter}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="mfds-maker">MFDS maker (optional)</Label>
          <Input
            id="mfds-maker"
            autoComplete="off"
            readOnly={locked}
            value={maker}
            onChange={(event) => setMaker(event.target.value)}
            onKeyDown={onEnter}
          />
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={locked}
        aria-busy={searching || undefined}
        onClick={run}
      >
        {searching ? 'Searching…' : 'Search MFDS'}
      </Button>
      {/* One region that stays in the page for what the search and the pick did, so its text is read out. */}
      <div role="status" className="flex flex-col gap-1 text-body-sm break-keep">
        {searching ? <p>Searching the MFDS database…</p> : null}
        {!searching && answer?.state === 'off' ? <p>{offText}</p> : null}
        {!searching && answer?.state === 'unavailable' ? <p>{unavailableText}</p> : null}
        {!searching && answer?.state === 'ok' && results.length === 0 ? <p>{noMatchText}</p> : null}
        {!searching && more ? <p>{more}</p> : null}
        {filled?.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
      {problem ? (
        <p role="alert" className="text-body-sm break-keep text-destructive">
          {problem}
        </p>
      ) : null}
      {!searching && results.length ? (
        <ul aria-label="MFDS matches" className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {results.map((result) => (
            <li
              key={result.code}
              className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
            >
              <div className="flex min-w-0 flex-col">
                <span className="text-body-sm font-medium break-keep">{result.name}</span>
                <span className="text-caption break-keep text-muted-foreground">
                  {resultText(result)}
                </span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={locked}
                aria-label={`Use ${result.name}`}
                onClick={() => {
                  const fill = fillFromMfds(form, result, serviceToday());
                  onFill(fill.form);
                  setFilled(fill.lines);
                }}
              >
                Use
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </fieldset>
  );
}
