import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Notice } from './components/ui/notice';
import { SkeletonText } from './components/ui/skeleton';
import { formatDate } from './daily-date';
import { apiKey, useApiQuery } from './lib/query';
import { errorText, type NoticeValue } from './lib/use-notice';
import { howText, type Medication, medicationsPagePath, medicationsPath } from './med-text';
import {
  clinicText,
  procedureText,
  type Visit,
  visitsPagePath,
  visitsPath,
  wonText,
} from './visit-text';
import { useReadAfterWrites } from './writes';

// The daily page gives this a key per date, so nothing here outlives the day it was loaded for.
// Visits are written on the clinic page; this card shows the day's and links there (#39).
export function VisitsCard({ date }: { date: string }) {
  const [moveFocus, setMoveFocus] = useState(0);
  const heading = useRef<HTMLDivElement>(null);
  // A save from the clinic or medicine page may still be on its way; read after it lands (#71).
  const ready = useReadAfterWrites(visitsPath, medicationsPath);
  // The clinic and medicine pages invalidate these after each change (#282).
  const options = { enabled: ready };
  const day = useApiQuery<{ visits: Visit[] }>(
    apiKey(visitsPath, date),
    `${visitsPath}?date=${date}`,
    options,
  );
  const taken = useApiQuery<{ medications: Medication[] }>(
    apiKey(medicationsPath, date),
    `${medicationsPath}?date=${date}`,
    options,
  );
  // Both parts show together, as one read did before.
  const both = ready && day.data && taken.data ? { day: day.data, taken: taken.data } : undefined;
  const visits = both?.day.visits;
  const medications = both?.taken.medications;
  const failed = [day, taken].find((part) => part.isError && !part.isFetching);
  const notice: NoticeValue | undefined = failed
    ? { kind: 'error', text: errorText(failed.error) }
    : undefined;
  // One read of each part at a time; a part already read is not read again.
  const load = () => {
    for (const part of [day, taken]) {
      if (part.isError) void part.refetch({ cancelRefetch: false });
    }
  };

  // The pressed button is gone by now.
  useEffect(() => {
    if (!moveFocus) return;
    const timer = setTimeout(() => heading.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [moveFocus]);

  return (
    <Card>
      <CardHeader>
        <div ref={heading} tabIndex={-1} className="outline-none">
          <CardTitle asHeading="h2">Clinic and medication</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Notice notice={notice} />
        {notice && visits === undefined ? (
          <Button
            variant="outline"
            className="self-start"
            onClick={() => {
              load();
              // Trying again removes this button, which would drop keyboard focus to the page (#65).
              setMoveFocus((count) => count + 1);
            }}
          >
            Try again
          </Button>
        ) : null}
        {!notice && visits === undefined ? (
          <div role="status" aria-busy="true" aria-label="Loading clinic and medication records">
            <SkeletonText lines={2} />
          </div>
        ) : null}
        {visits?.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">No clinic visits on this day.</p>
        ) : null}
        {visits?.length ? (
          <ul aria-label="Clinic visits on this day" className="flex flex-col gap-3 text-body-sm">
            {visits.map((visit) => (
              <li key={visit.id} className="flex flex-col gap-1">
                <span className="font-medium wrap-anywhere">{clinicText(visit)}</span>
                {visit.procedures.map((item, index) => (
                  <span key={index} className="wrap-anywhere text-muted-foreground">
                    {procedureText(item)}
                  </span>
                ))}
                {visit.cost !== null ? (
                  <span className="text-muted-foreground">Visit cost {wonText(visit.cost)}</span>
                ) : null}
                {visit.nextVisitOn ? (
                  <span className="text-muted-foreground">
                    Next appointment {formatDate(visit.nextVisitOn)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {visits !== undefined ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`${visitsPagePath}?new=${date}`}>
                <Plus aria-hidden />
                Record a clinic visit for this day
              </Link>
            </Button>
            {visits.length ? (
              <Button asChild variant="ghost" size="sm">
                <Link to={visitsPagePath}>View clinic records</Link>
              </Button>
            ) : null}
          </div>
        ) : null}
        {medications !== undefined ? (
          <section aria-labelledby={`meds-${date}`} className="flex flex-col gap-2 text-body-sm">
            <h3 id={`meds-${date}`} className="font-medium">
              Medication taken this day
            </h3>
            {medications.length ? (
              <ul className="flex flex-col gap-1">
                {medications.map((item) => {
                  const how = howText(item);
                  return (
                    <li key={item.id} className="wrap-anywhere">
                      {item.name}
                      {how ? <span className="text-muted-foreground"> · {how}</span> : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-muted-foreground">No medication records for this day.</p>
            )}
            <Button asChild variant="ghost" size="sm" className="self-start">
              <Link to={medicationsPagePath}>View medication records</Link>
            </Button>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
