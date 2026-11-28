import { Download } from 'lucide-react';
import { useState } from 'react';

import { addDays } from './components/period-nav/periods';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import { toast } from './components/ui/sonner';
import { earliestDate, latestDate } from './daily-date';
import { downloadExport, type ExportKind, exportKinds, rangeProblem } from './export-text';
import { serviceToday } from './lib/format';
import { useNotice } from './lib/use-notice';

/** Download my records for a date range, as one CSV file per kind or every kind in one zip. */
export function ExportCard() {
  // The last 30 days, by this device's clock in the service time zone; both dates stay editable.
  const [to, setTo] = useState(() => serviceToday());
  const [from, setFrom] = useState(() => addDays(serviceToday(), -29));
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const { notice, status, error, clear } = useNotice();

  const download = async (kind: ExportKind) => {
    // The buttons stay pressable while a file is being made, so a second press is ignored here.
    if (busy) return;
    const problem = rangeProblem(from, to);
    if (problem) {
      error(problem);
      return;
    }
    clear();
    setBusy(kind);
    status('Preparing the file…');
    try {
      const name = await downloadExport(kind, from, to);
      clear();
      toast.success(`Downloaded ${name}`);
    } catch (cause) {
      error(cause);
    } finally {
      setBusy(null);
    }
  };

  // aria-disabled, not disabled: a disabled button drops keyboard focus to the page.
  const busyProps = (kind: ExportKind) => ({
    'aria-disabled': busy ? true : undefined,
    'aria-busy': busy === kind ? true : undefined,
    className: 'aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle asHeading="h2">Download my records</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid max-w-md gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="export-from">From</Label>
            <Input
              id="export-from"
              type="date"
              min={earliestDate}
              max={latestDate}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="export-to">To</Label>
            <Input
              id="export-to"
              type="date"
              min={earliestDate}
              max={latestDate}
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        </div>
        <div>
          <Button onClick={() => void download('all')} {...busyProps('all')}>
            <Download aria-hidden />
            {busy === 'all' ? 'Preparing…' : 'Download everything (zip)'}
          </Button>
        </div>
        <Notice notice={notice} />
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Download one kind">
          {exportKinds.map((kind) => (
            <li
              key={kind.key}
              className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-body-sm font-medium">{kind.label}</p>
                <p className="text-caption text-muted-foreground">{kind.detail}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                aria-label={`Download ${kind.label} as CSV`}
                onClick={() => void download(kind.key)}
                {...busyProps(kind.key)}
              >
                <Download aria-hidden />
                CSV
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
