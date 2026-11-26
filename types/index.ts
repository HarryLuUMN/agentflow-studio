import type { TopLevelSpec } from 'vega-lite';
import type { Dataset } from '../lib/prompts';
import type { AgentNodeId, Scenario, Stage, StageStrategies } from '../lib/risks';
import type { ManagerVerification } from '../lib/managerVerification';

export type Strategy = 'voting' | 'sequential' | 'single' | 'discussion';

export interface WorkflowState {
  dataset: Dataset;
  scenario: Scenario;
  strategies: StageStrategies;
  ghosts: AgentNodeId[];
  manager: AgentNodeId | null;
}

export interface StageResult {
  title?: string;
  article?: string;
  visualization?: TopLevelSpec;
}

export interface NodeOutput {
  nodeId: string;
  agentName: string;
  output: string;
  stage: Stage;
  prompt: string;
  input: string;
  verification?: ManagerVerification;
}
