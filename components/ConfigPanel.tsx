import type { Strategy, WorkflowState } from '../types';
import { baseballGroundTruth, kidneyGroundTruth } from '../lib/groundTruth';
import { agentNodes, risks, stageNames, stages, type AgentNodeId, type Scenario } from '../lib/risks';

const strategies: Record<Strategy, string> = {
  single: 'Single Agent', sequential: 'Sequential', voting: 'Voting', discussion: 'Discussion',
};

interface ConfigPanelProps {
  config: WorkflowState;
  running: boolean;
  apiKey: string;
  onKeyChange: (key: string) => void;
  onScenarioChange: (scenario: Scenario) => void;
  onConfigChange: (config: WorkflowState) => void;
  onRun: () => void;
  onReset: () => void;
}

export function ConfigPanel({ config, running, apiKey, onKeyChange, onScenarioChange, onConfigChange, onRun, onReset }: ConfigPanelProps) {
  const available = stages.flatMap(stage => agentNodes(stage, config.strategies[stage]));
  const risk = config.scenario === 'baseline' ? undefined : risks[config.scenario];
  const nodeLabel = (id: AgentNodeId) => `${stageNames[Number(id[5])]} · Agent ${id.slice(-1)}`;

  return (
    <aside className="workflow-config" aria-label="Workflow configuration">
      <fieldset disabled={running}>
        <legend>Configuration</legend>
        <label>
          OpenAI API key
          <input type="password" autoComplete="off" value={apiKey} onChange={event => onKeyChange(event.target.value)} />
        </label>
        <label>
          Dataset
          <select value={config.dataset} onChange={event => onConfigChange({ ...config, dataset: event.target.value === 'kidney' ? 'kidney' : 'baseball' })}>
            <option value="baseball">Baseball</option>
            <option value="kidney">Kidney stone treatment</option>
          </select>
        </label>
        <details className="dataset-reference">
          <summary>Dataset reference</summary>
          <p>{(config.dataset === 'baseball' ? baseballGroundTruth : kidneyGroundTruth).trim()}</p>
        </details>
        <label>
          Risk scenario
          <select value={config.scenario} onChange={event => onScenarioChange(event.target.value as Scenario)}>
            <option value="baseline">Baseline</option>
            {Object.entries(risks).map(([id, metadata]) => <option key={id} value={id}>{metadata.label}</option>)}
          </select>
        </label>
        {risk && <p className="config-note">{'description' in risk ? risk.description : risk.calibration}</p>}

        <h2>Stage strategies</h2>
        {stages.map(stage => (
          <label key={stage}>
            {stageNames[stage]}
            <select value={config.strategies[stage]} onChange={event => {
              const next = [...config.strategies] as WorkflowState['strategies'];
              next[stage] = event.target.value as Strategy;
              onConfigChange({ ...config, strategies: next });
            }}>
              {Object.entries(strategies).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
        ))}

        {!!config.ghosts.length && <h2>Ghost placement</h2>}
        {config.ghosts.map((ghost, index) => (
          <label key={index}>
            Ghost {index + 1}
            <select value={ghost} onChange={event => {
              const ghosts = [...config.ghosts];
              ghosts[index] = event.target.value as AgentNodeId;
              onConfigChange({ ...config, ghosts });
            }}>
              {available.filter(id => id === ghost || (id !== config.manager && !config.ghosts.includes(id)))
                .map(id => <option key={id} value={id}>{nodeLabel(id)}</option>)}
            </select>
          </label>
        ))}
        <h2>Verification</h2>
        <label>
          Editorial Manager
          <select value={config.manager ?? ''} onChange={event => onConfigChange({
            ...config, manager: event.target.value ? event.target.value as AgentNodeId : null,
          })}>
            <option value="">Unassigned</option>
            {available.filter(id => !config.ghosts.includes(id)).map(id =>
              <option key={id} value={id}>{nodeLabel(id)}</option>)}
          </select>
        </label>
        <p className="config-note">Assign an existing agent to verify its received work against the original data during its turn.</p>
      </fieldset>
      <div className="workflow-actions">
        <button type="button" disabled={running} onClick={onRun}>{running ? 'Running…' : 'Run workflow'}</button>
        <button type="button" disabled={running} onClick={onReset}>Reset</button>
      </div>
    </aside>
  );
}
