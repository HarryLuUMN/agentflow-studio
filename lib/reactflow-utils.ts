import { Position, type Edge, type Node } from 'reactflow';
import type { NodeOutput, WorkflowState } from '../types';
import { agentNodes, stageNames, stages } from './risks.ts';

export function buildWorkflowGraph(config: WorkflowState, outputs: Record<string, NodeOutput>, activeStage: number, finished: boolean) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const colors = ['#b45309', '#2563eb', '#047857'] as const;
  const strategyLabels = { single: 'Single Agent', sequential: 'Sequential', voting: 'Voting', discussion: 'Discussion' };

  for (const stage of stages) {
    const strategy = config.strategies[stage];
    const agents = agentNodes(stage, strategy);
    const y = stage * 255 + 110;
    const prefix = `stage${stage}`;
    const start = `${prefix}-start`;
    const end = `${prefix}-end`;
    const color = colors[stage];
    const addNode = (id: string, label: string, x: number, y: number, accent: string = color) => {
      const status = outputs[id]?.verification?.status;
      const border = status && status !== 'verified' ? '#b45309' : accent;
      nodes.push({
        id, data: { label }, position: { x, y },
        sourcePosition: finished && id === 'stage2-end' ? Position.Bottom : Position.Right,
        targetPosition: Position.Left,
        style: {
          width: 155, whiteSpace: 'pre-line', color: '#17233a', padding: 10,
          border: `2px solid ${border}`, borderRadius: 8,
          background: outputs[id] ? '#f0fdf4' : activeStage === stage ? '#eef2ff' : '#fff',
        },
      });
    };
    const connect = (source: string, target: string) => {
      edges.push({ id: `${source}-${target}`, source, target, style: { stroke: color, strokeWidth: 2 } });
    };

    addNode(start, `${stageNames[stage]}\n${strategyLabels[strategy]}`, 10, y);
    let previous = start;
    agents.forEach((id, index) => {
      const ghost = config.ghosts.includes(id);
      const manager = config.manager === id;
      const role = ghost ? 'Ghost' : 'Agent';
      const status = outputs[id]?.verification?.status;
      const badge = status ? ` · ${status.replace('_', ' ')}` : '';
      const label = `${role} ${index + 1}${manager ? `\nManager${badge}` : strategy === 'discussion' ? `\nTurn ${index + 1}` : ''}`;
      addNode(id, label, strategy === 'voting' ? 220 : 220 + index * 192,
        strategy === 'voting' ? y + (index - 1) * 75 : y, ghost ? '#a21caf' : manager ? '#0f766e' : color);
      connect(strategy === 'voting' ? start : previous, id);
      previous = id;
    });

    if (strategy === 'discussion' || strategy === 'voting') {
      const node = strategy === 'discussion' ? `${prefix}-facilitator` : `${prefix}-aggregator`;
      addNode(node, strategy === 'discussion' ? 'Discussion Facilitator' : 'Vote Aggregator',
        strategy === 'discussion' ? 796 : 535, y);
      if (strategy === 'voting') agents.forEach(id => connect(id, node));
      else connect(previous, node);
      previous = node;
    }

    addNode(end, 'Stage Output', 1000, y);
    connect(previous, end);
    if (stage > 0) {
      edges.push({
        id: `stage${stage - 1}-to-${stage}`, source: `stage${stage - 1}-end`, target: start,
        type: 'smoothstep', style: { stroke: '#667085', strokeWidth: 1.5, strokeDasharray: '5 5' },
      });
    }
  }

  if (finished) {
    nodes.push({
      id: 'final-report', data: { label: 'Final Report' },
      position: { x: 800, y: 700 }, targetPosition: Position.Top,
      type: 'output', style: { fontWeight: 'bold', borderColor: '#b45309' },
    });
    edges.push({ id: 'stage2-to-final', source: 'stage2-end', target: 'final-report', type: 'smoothstep' });
  }

  return { nodes, edges };
}
