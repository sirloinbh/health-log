import { type KeyboardEvent, useState } from 'react';

import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { serviceToday } from './daily-date';
import type { Form } from './food-form';
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
  const [path, setPath] = useState<string | null>(null);
  const [missingName, setMissingName] = useState(false);
  // `reads` counts picks: a new key remounts the message, so picking again reads it out again.
  const [filled, setFilled] = useState<{ lines: string[]; reads: number } | null>(null);
  const query = useApiQuery<MfdsAnswer>(apiKey(path ?? ''), path ?? '', { enabled: path !== null });
  const answer = path !== null ? query.data : undefined;
  const searching = path !== null && query.isFetching;

  const search = () => {
    const q = name.trim();
    setMissingName(q === '');
    if (!q) return;
    const next = mfdsPath(q, maker.trim());
    setFilled(null);
    // The same words again ask again: the portal may answer now after failing before.
    if (next === path) void query.refetch({ cancelRefetch: false });
    else setPath(next);
  };
  // The fields sit inside the food form: Enter here searches instead of saving the food.
  const onEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (!locked) search();
  };

  const results = answer?.state === 'ok' ? answer.results : [];
  const more = answer?.state === 'ok' ? moreText(answer.read, answer.total) : null;
  const problem = missingName
    ? emptyText
    : query.isError && path !== null && !searching
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
            aria-describedby="mfds-help"
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
      <p id="mfds-help" className="text-caption break-keep text-muted-foreground">
        Searches the Ministry of Food and Drug Safety nutrition database by name, in Korean as the
        product shows it. Picking a match fills the fields below; nothing is saved until Save.
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        disabled={locked}
        aria-busy={searching || undefined}
        onClick={search}
      >
        {searching ? 'Searching…' : 'Search MFDS'}
      </Button>
      {/* One region for what the search and the pick did; a new pick remounts it to be read again. */}
      <div
        key={filled?.reads ?? 0}
        role="status"
        className="flex flex-col gap-1 text-body-sm break-keep"
      >
        {!searching && answer?.state === 'off' ? <p>{offText}</p> : null}
        {!searching && answer?.state === 'unavailable' ? <p>{unavailableText}</p> : null}
        {!searching && answer?.state === 'ok' && results.length === 0 ? <p>{noMatchText}</p> : null}
        {!searching && more ? <p>{more}</p> : null}
        {filled?.lines.map((line) => (
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
                  setFilled({ lines: fill.lines, reads: (filled?.reads ?? 0) + 1 });
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
