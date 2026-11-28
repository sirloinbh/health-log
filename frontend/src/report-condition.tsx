import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { plural } from './lib/format';
import {
  type ConditionGroup,
  type ConditionSplit,
  fewConditionDays,
  type Report,
  scoreAverageText,
} from './report-text';

const comparisons = [
  {
    key: 'shortSleep',
    title: 'Short sleep',
    yes: 'Under 6 h of sleep',
    no: '6 h or more of sleep',
  },
  { key: 'drinking', title: 'Drinking', yes: 'After drinking', no: 'After no drinking' },
  { key: 'junkFood', title: 'Junk food', yes: 'After junk food', no: 'After no junk food' },
] as const;

const columns = [
  { key: 'mood', title: 'Mood' },
  { key: 'energy', title: 'Energy' },
  { key: 'stress', title: 'Stress' },
] as const;

function GroupRow({ label, group }: { label: string; group: ConditionGroup }) {
  return (
    <tr className="border-t">
      <th scope="row" className="py-1 pr-2 text-left font-normal">
        {label} <span className="text-muted-foreground">({plural(group.days, 'day')})</span>
      </th>
      {columns.map(({ key }) => (
        <td key={key} className="py-1 text-right tabular-nums">
          {scoreAverageText(group[key].average)}
        </td>
      ))}
    </tr>
  );
}

function Comparison({
  title,
  yes,
  no,
  split,
}: {
  title: string;
  yes: string;
  no: string;
  split: ConditionSplit;
}) {
  const thin = Math.min(split.with.days, split.without.days) < fewConditionDays;
  return (
    <section aria-label={title} className="flex flex-col gap-2 text-body-sm">
      <h3 className="font-medium">{title}</h3>
      {thin ? (
        <p className="text-muted-foreground">
          Too few days to compare. It needs at least {plural(fewConditionDays, 'day')} with a score
          on each side; there are {split.with.days} and {split.without.days} so far.
        </p>
      ) : (
        <table className="w-full">
          <caption className="sr-only">{`Average condition by ${title.toLowerCase()}`}</caption>
          <thead>
            <tr>
              <th scope="col" className="text-left font-normal text-muted-foreground">
                Group
              </th>
              {columns.map(({ key, title: column }) => (
                <th key={key} scope="col" className="text-right font-normal text-muted-foreground">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <GroupRow label={yes} group={split.with} />
            <GroupRow label={no} group={split.without} />
          </tbody>
        </table>
      )}
    </section>
  );
}

export function ConditionAfter({ report }: { report: Report }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle asHeading="h2">Condition the next day</CardTitle>
        <CardDescription className="break-keep">
          Average scores from 1 to 5. This shows a relationship only; it does not establish a cause.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {comparisons.map(({ key, ...words }) => (
          <Comparison key={key} {...words} split={report.conditionAfter[key]} />
        ))}
        <p className="text-caption break-keep text-muted-foreground">
          Sleep is compared with the condition of the day you woke up. Drinking and junk food are
          compared with the next day. Days without a record of that input are left out.
        </p>
      </CardContent>
    </Card>
  );
}
