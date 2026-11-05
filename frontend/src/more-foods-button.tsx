import { Button } from './components/ui/button';
import { Spinner } from './components/ui/spinner';

/** Reads the next page of a food list; shown only while the server says there is one. */
export function MoreFoodsButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="self-start"
      disabled={loading}
      aria-busy={loading || undefined}
      onClick={onClick}
    >
      {loading ? <Spinner size="sm" label="불러오는 중" /> : null}
      결과 더 보기
    </Button>
  );
}
