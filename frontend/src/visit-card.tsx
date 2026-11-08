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
          <CardTitle asHeading="h2">병원·약</CardTitle>
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
            다시 시도
          </Button>
        ) : null}
        {!notice && visits === undefined ? (
          <div role="status" aria-busy="true" aria-label="병원·약 기록 불러오는 중">
            <SkeletonText lines={2} />
          </div>
        ) : null}
        {visits?.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">이 날 병원 방문 기록이 없습니다.</p>
        ) : null}
        {visits?.length ? (
          <ul aria-label="이 날 병원 방문" className="flex flex-col gap-3 text-body-sm">
            {visits.map((visit) => (
              <li key={visit.id} className="flex flex-col gap-1">
                <span className="font-medium wrap-anywhere">{clinicText(visit)}</span>
                {visit.procedures.map((item, index) => (
                  <span key={index} className="wrap-anywhere text-muted-foreground">
                    {procedureText(item)}
                  </span>
                ))}
                {visit.cost !== null ? (
                  <span className="text-muted-foreground">진료비 {wonText(visit.cost)}</span>
                ) : null}
                {visit.nextVisitOn ? (
                  <span className="text-muted-foreground">
                    다음 예약 {formatDate(visit.nextVisitOn)}
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
                <Plus aria-hidden />이 날 병원 방문 기록
              </Link>
            </Button>
            {visits.length ? (
              <Button asChild variant="ghost" size="sm">
                <Link to={visitsPagePath}>병원 기록 보기</Link>
              </Button>
            ) : null}
          </div>
        ) : null}
        {medications !== undefined ? (
          <section aria-labelledby={`meds-${date}`} className="flex flex-col gap-2 text-body-sm">
            <h3 id={`meds-${date}`} className="font-medium">
              이 날 먹은 약
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
              <p className="text-muted-foreground">이 날 먹은 약 기록이 없습니다.</p>
            )}
            <Button asChild variant="ghost" size="sm" className="self-start">
              <Link to={medicationsPagePath}>약 기록 보기</Link>
            </Button>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
