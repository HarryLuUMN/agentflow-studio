import { compile, type TopLevelSpec } from 'vega-lite';

export function parseModelJSON(output: string): unknown {
  return JSON.parse(output.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/, ''));
}

export function parseChart(output: string): TopLevelSpec {
  const chart = parseModelJSON(output) as Record<string, unknown> | null;
  if (!chart || typeof chart !== 'object' || Array.isArray(chart) ||
      !['mark', 'spec', 'layer', 'concat', 'hconcat', 'vconcat'].some(key => key in chart)) {
    throw new Error('The visualization did not return a Vega-Lite specification.');
  }
  const data = chart.data as { values?: unknown[] } | undefined;
  if (!Array.isArray(data?.values) || data.values.length === 0) {
    throw new Error('The visualization requires inline dataset counts.');
  }
  JSON.stringify(chart, (key, value) => {
    if (key === 'url') throw new Error('The visualization requires inline data.');
    return value;
  });
  const spec = chart as unknown as TopLevelSpec;
  compile(spec);
  return spec;
}
