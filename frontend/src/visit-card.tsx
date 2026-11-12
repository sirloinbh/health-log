import { Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Notice } from './components/ui/notice';
import { SkeletonText } from './components/ui/skeleton';
import { formatDate } from './daily-date';
import { requestJson } from './lib/api';
import { useNotice } from './lib/use-notice';
import { howText, type Medication, medicationsPagePath, medicationsPath } from './med-text';
import { writesSettled } from './pending-writes';
import {
  clinicText,
  procedureText,
  type Visit,
  visitsPagePath,
  visitsPath,
  wonText,
} from './visit-text';

// The daily page gives this a key per date, so nothing here outlives the day it was loaded for.
// Visits are written on the clinic page; this card shows the day's and links there (#39).
export function VisitsCard({ date }: { date: string }) {
  const [visits, setVisits] = useState<Visit[] | undefined>(undefined);
  const [medications, setMedications] = useState<Medication[] | undefined>(undefined);
  const { notice, error, clear } = useNotice();
  const [moveFocus, setMoveFocus] = useState(0);
  const heading = useRef<HTMLDivElement>(null);
  const live = useRef(true);

  const load = useCallback(async () => {
    clear();
    try {
      // A save from the clinic or medicine page may still be on its way; read after it lands (#71).
      await Promise.all([writesSettled(`${visitsPath}/`), writesSettled(`${medicationsPath}/`)]);
      // Left again while waiting: nothing would show the answer.
      if (!live.current) return;
      const [day, taken] = await Promise.all([
        requestJson<{ visits: Visit[] }>(`${visitsPath}?date=${date}`),
        requestJson<{ medications: Medication[] }>(`${medicationsPath}?date=${date}`),
      ]);
      if (!live.current) return;
      setVisits(day.visits);
      setMedications(taken.medications);
    } catch (cause) {
      if (live.current) error(cause);
    }
  }, [clear, date, error]);

  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
    };
  }, [load]);

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
              void load();
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
