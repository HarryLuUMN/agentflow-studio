import { useEffect, useRef, useState } from 'react';
import type { TopLevelSpec } from 'vega-lite';
import type { Result } from 'vega-embed';

export function ReportChart({ spec }: { spec: TopLevelSpec }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let cancelled = false;
    let chart: Result | undefined;
    setError('');
    import('vega-embed').then(async ({ default: embed }) => {
      if (cancelled) return;
      chart = await embed(element, spec, { actions: false, renderer: 'svg' });
      if (cancelled) chart.finalize();
    }).catch((error: unknown) => {
      if (!cancelled) setError(error instanceof Error ? error.message : String(error));
    });
    return () => {
      cancelled = true;
      chart?.finalize();
    };
  }, [spec]);

  return <>
    <div className="report-chart" ref={container} />
    {error && <p role="alert">{error}</p>}
    <details><summary>Vega-Lite specification</summary><pre>{JSON.stringify(spec, null, 2)}</pre></details>
  </>;
}
