import { useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, { Background, Controls, MiniMap, useNodesInitialized, useNodesState, useReactFlow } from 'reactflow';
import Head from 'next/head';
import { ConfigPanel } from '../components/ConfigPanel';
import { ReportChart } from '../components/ReportChart';
import { aggregateCSVData, loadCSVData } from '../lib/csvLoader';
import { callLLM } from '../lib/openai';
import { buildWorkflowGraph } from '../lib/reactflow-utils';
import { reconcileAssignments, scenarioDefaults, stageNames, stages, type AgentNodeId, type Scenario, type Stage } from '../lib/risks';
import { previewAgentPrompt, runStage } from '../lib/strategies';
import type { NodeOutput, StageResult, WorkflowState } from '../types';

const initialConfig: WorkflowState = {
  dataset: 'baseball', scenario: 'baseline', manager: null, ...scenarioDefaults('baseline'),
};
const stageKeys = ['title', 'article', 'visualization'] as const;

function NodeDetails({ output }: { output: NodeOutput }) {
  const review = output.verification;
  return <>
    <h3>MODEL:</h3><pre>gpt-4o-mini</pre>
    {output.prompt && <><h3>SYSTEM PROMPT:</h3><pre>{output.prompt}</pre></>}
    <h3>INPUT:</h3><pre>{output.input || 'No input yet...'}</pre>
    <h3>OUTPUT:</h3><pre>{output.output || 'No output yet...'}</pre>
    {review && <section>
      <h3>Manager verification</h3>
      <p><strong>{review.status.replace('_', ' ')}</strong></p>
      {review.issues.length > 0 && <ul>{review.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>}
      <details><summary>Original task draft</summary><pre>{review.draft}</pre></details>
      <details><summary>Verification prompt and evidence</summary><pre>{review.system}</pre><pre>{review.user}</pre></details>
    </section>}
  </>;
}

function FitWorkflow({ layout }: { layout: string }) {
  const initialized = useNodesInitialized();
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!initialized) return;
    const frame = requestAnimationFrame(() => fitView({ padding: 0.19 }));
    return () => cancelAnimationFrame(frame);
  }, [initialized, layout, fitView]);
  return null;
}

export default function Home() {
  const [config, setConfig] = useState(initialConfig);
  const [apiKey, setApiKey] = useState(process.env.NEXT_PUBLIC_OPENAI_API_KEY ?? '');
  const [activeStage, setActiveStage] = useState<Stage | -1>(-1);
  const running = useRef(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<StageResult>({});
  const [outputs, setOutputs] = useState<Record<string, NodeOutput>>({});
  const [selected, setSelected] = useState('');
  const finished = Boolean(result.visualization);
  const graph = useMemo(() => buildWorkflowGraph(config, outputs, activeStage, finished), [config, outputs, activeStage, finished]);
  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const lastConfig = useRef(config);
  useEffect(() => {
    const preservePositions = lastConfig.current === config;
    lastConfig.current = config;
    setNodes(current => {
      if (!preservePositions) return graph.nodes;
      const positions = new Map(current.map(node => [node.id, node.position]));
      return graph.nodes.map(node => ({ ...node, position: positions.get(node.id) ?? node.position }));
    });
  }, [config, graph.nodes, setNodes]);
  const selectedNode = graph.nodes.find(node => node.id === selected);
  const selectedStage = stages.find(stage => selected === `stage${stage}-end`);
  const selectedLabel = selectedNode?.data.label.split('\n')[0];
  const selectedAgentStage = stages.find(stage => selected.startsWith('stage' + stage + '-agent'));
  const preview = selectedAgentStage === undefined ? undefined : {
    nodeId: selected, agentName: selectedLabel ?? 'Agent', stage: selectedAgentStage, input: '', output: '',
    prompt: previewAgentPrompt(config, selectedAgentStage, selected as AgentNodeId),
  };
  const output = outputs[selected] ?? preview;
  const resultForStage = selectedStage === undefined ? undefined : result[stageKeys[selectedStage]];

  function clearRun() {
    setStatus('');
    setError('');
    setResult({});
    setOutputs({});
    setSelected('');
  }

  function changeConfig(next: WorkflowState) {
    if (running.current) return;
    setConfig({ ...next, ...reconcileAssignments(next.strategies, next.ghosts, next.manager) });
    clearRun();
  }

  function changeScenario(scenario: Scenario) {
    changeConfig({ ...config, scenario, manager: null, ...scenarioDefaults(scenario) });
  }

  async function runWorkflow() {
    if (running.current) return;
    const key = apiKey.trim();
    if (!key) {
      setError('Enter an OpenAI API key to run the workflow.');
      return;
    }
    running.current = true;
    clearRun();
    setActiveStage(0);
    setStatus('Loading dataset…');

    try {
      const counts = aggregateCSVData(config.dataset, await loadCSVData(config.dataset));
      let previousOutput = '';
      for (const stage of stages) {
        setActiveStage(stage);
        setStatus(`Running ${stageNames[stage].toLowerCase()}…`);
        previousOutput = await runStage({
          config, stage, counts, previousOutput,
          complete: async ({ system, user }) => {
            const answer = await callLLM(key, { system, prompt: user });
            if (!answer.success || !answer.content.trim()) {
              throw new Error(answer.error || 'The model returned an empty response.');
            }
            return answer.content;
          },
          onNodeComplete: node => setOutputs(all => ({ ...all, [node.nodeId]: node })),
        });
        const value = stage === 2 ? JSON.parse(previousOutput) : previousOutput;
        setResult(current => ({ ...current, [stageKeys[stage]]: value }));
      }
      setStatus('Workflow complete.');
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      setStatus('Workflow failed.');
    } finally {
      running.current = false;
      setActiveStage(-1);
    }
  }

  return (
    <main className="workflow">
      <Head><title>AgentFlow Studio</title></Head>
      <header className="workflow-header">
        <h1>🔬 AgentFlow</h1>
      </header>
      <div className="workflow-layout">
        <div className="workflow-sidebar">
          <ConfigPanel config={config} running={activeStage !== -1} apiKey={apiKey} onKeyChange={setApiKey}
            progress={status} error={error} onScenarioChange={changeScenario} onConfigChange={changeConfig}
            onRun={runWorkflow} onReset={() => changeConfig(initialConfig)} />
        </div>
        <section className="workflow-canvas" aria-label="Workflow graph">
          <ReactFlow nodes={nodes} edges={graph.edges} onNodesChange={onNodesChange} fitView
            onNodeClick={(_, node) => {
              if (node.id === 'final-report' || /-(agent\d|aggregator|facilitator|end)$/.test(node.id)) {
                setSelected(node.id);
              }
            }}>
            <Background /><Controls /><MiniMap />
            <FitWorkflow layout={config.strategies.join(',') + ':' + finished} />
          </ReactFlow>
        </section>
      </div>

      {selected && <div className="dialog-backdrop" onClick={() => setSelected('')}>
        <section className="workflow-dialog" role="dialog" aria-modal="true" aria-labelledby="node-title"
          onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') setSelected(''); }}>
          <header>
            <h2 id="node-title">{output?.agentName ?? (selected === 'final-report' ? 'Final Report' :
              selectedStage !== undefined ? `${stageNames[selectedStage]} output` :
              selectedLabel)}</h2>
            <button type="button" autoFocus onClick={() => setSelected('')}>✕ Close</button>
          </header>

          {output && <NodeDetails output={output} />}
          {selected === 'final-report' && <>
            <h3>{result.title}</h3>
            <p className="report-text">{result.article}</p>
            {result.visualization && <ReportChart spec={result.visualization} />}
          </>}
          {typeof resultForStage === 'string' && <p className="report-text">{resultForStage}</p>}
          {resultForStage && typeof resultForStage !== 'string' && <ReportChart spec={resultForStage} />}
          {!output && !resultForStage && selected !== 'final-report' && <p>Run the workflow to view this node’s output.</p>}
        </section>
      </div>}
    </main>
  );
}
