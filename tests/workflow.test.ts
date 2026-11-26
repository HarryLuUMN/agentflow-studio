import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { NodeOutput, Strategy, WorkflowState } from '../types';
import { buildWorkflowGraph } from '../lib/reactflow-utils.ts';
import { scenarioDefaults, reconcileAssignments, risks, type Scenario } from '../lib/risks.ts';
import { runStage } from '../lib/strategies.ts';

const counts = [
  { player: 'Derek Jeter', year: '1995', is_hit: 'Hit', count: 12 },
  { player: 'David Justice', year: '1995', is_hit: 'Hit', count: 104 },
];
const chart = JSON.stringify({ data: { values: counts }, mark: 'bar', encoding: { x: { field: 'player' }, y: { field: 'count' } } });
const configFor = (scenario: Scenario): WorkflowState => ({
  dataset: 'baseball', scenario, manager: null, ...scenarioDefaults(scenario),
});

test('all five scenarios apply the right Ghost roles, count, evidence, and starting strategy', async () => {
  assert.equal(Object.keys(risks).length, 5);
  for (const scenario of Object.keys(risks) as Array<keyof typeof risks>) {
    const config = configFor(scenario);
    assert.equal(config.ghosts.length, scenario === 'collusion' ? 2 : 1);
    assert.equal(config.strategies[0], scenario === 'collusion' ? 'discussion' : 'sequential');
    const nodes: NodeOutput[] = [];
    await runStage({
      config, stage: 0, counts, previousOutput: '', onNodeComplete: node => nodes.push(node),
      complete: async () => 'Sample newsroom claim.',
    });
    const ghosts = nodes.filter(node => node.agentName.startsWith('Ghost'));
    assert.equal(ghosts.length, config.ghosts.length);
    for (const ghost of ghosts) {
      assert.ok(ghost.prompt.includes(risks[scenario].injection));
      assert.match(ghost.input, /Derek Jeter leads in both individual years/);
    }
    for (const node of nodes.filter(node => node.agentName.startsWith('Agent'))) {
      assert.doesNotMatch(node.input, /Derek Jeter leads in both individual years/);
      assert.match(node.input, /"player":"Derek Jeter"[^}]+12/);
    }
  }
});

test('Discussion forwards public turns, applies node-local verification before the next turn, and synthesizes once', async () => {
  const config = { ...configFor('collusion'), manager: 'stage0-agent3' as const };
  const calls: string[] = [];
  const nodes: NodeOutput[] = [];
  const output = await runStage({
    config, stage: 0, counts, previousOutput: 'Prior artifact',
    onNodeComplete: node => nodes.push(node),
    complete: async ({ system, user }) => {
      calls.push(user);
      if (system.includes('additional verification responsibility')) {
        const input = JSON.parse(user);
        assert.match(input.receivedInput, /public turn 1/);
        assert.match(input.receivedInput, /public turn 2/);
        assert.match(input.receivedInput, /Prior artifact/);
        assert.deepEqual(JSON.parse(input.originalCounts), counts);
        return JSON.stringify({ status: 'issues_found', issues: ['Wrong winner'], artifact: 'corrected turn' });
      }
      return system.includes('discussion facilitator') ? 'Final headline' : `public turn ${calls.length}`;
    },
  });
  assert.equal(output, 'Final headline');
  assert.equal(calls.length, 5);
  assert.match(calls[1]!, /public turn 1/);
  assert.doesNotMatch(calls[2]!, /Derek Jeter leads in both individual years/);
  assert.match(calls[4]!, /corrected turn/);
  assert.doesNotMatch(calls[4]!, /private evidence|public turn 3/);
  assert.equal(nodes[2]?.verification?.status, 'issues_found');
  assert.equal(nodes[3]?.nodeId, 'stage0-facilitator');
});

test('Manager verification respects the four strategy boundaries and catches invalid responses', async () => {
  for (const strategy of ['single', 'sequential', 'voting', 'discussion'] as Strategy[]) {
    const config = configFor('baseline');
    config.strategies[1] = strategy;
    config.manager = strategy === 'single' ? 'stage1-agent1' : 'stage1-agent2';
    const nodes: NodeOutput[] = [];
    await runStage({
      config, stage: 1, counts, previousOutput: 'Upstream title',
      onNodeComplete: node => nodes.push(node),
      complete: async ({ system, user }) => {
        if (system.includes('additional verification responsibility')) {
          const context = JSON.parse(user).receivedInput;
          assert.match(context, /Upstream title/);
          assert.equal(context.includes('peer draft'), strategy === 'sequential' || strategy === 'discussion');
          return 'malformed';
        }
        if (system.includes('voting aggregator') || system.includes('discussion facilitator')) {
          assert.match(user, /peer draft/);
        }
        return 'peer draft';
      },
    });
    const manager = nodes.find(node => node.nodeId === config.manager);
    assert.equal(manager?.verification?.status, 'failed');
    assert.equal(manager?.output, 'peer draft');
  }
});

test('a corrected chart is handed off as valid JSON and an invalid Manager chart retains the draft', async () => {
  const config = configFor('baseline');
  config.manager = 'stage2-agent1';
  for (const corrected of [chart, '{"data":{"url":"https://example.com/data"},"mark":"bar"}']) {
    let node: NodeOutput | undefined;
    const output = await runStage({
      config, stage: 2, counts, previousOutput: 'Prior article', onNodeComplete: next => { node = next; },
      complete: async ({ system }) => system.includes('additional verification responsibility')
        ? JSON.stringify({ status: 'verified', issues: [], artifact: corrected }) : chart,
    });
    assert.deepEqual(JSON.parse(output), JSON.parse(chart));
    assert.equal(node?.verification?.status, corrected === chart ? 'verified' : 'failed');
  }
});

test('switching strategies preserves the risk Ghost count and the graph maps every executable node', () => {
  const config = configFor('collusion');
  config.strategies[0] = 'single';
  config.manager = 'stage1-agent1';
  Object.assign(config, reconcileAssignments(config.strategies, config.ghosts, config.manager));
  assert.deepEqual(config.ghosts, ['stage0-agent1', 'stage1-agent2']);
  assert.equal(config.manager, 'stage1-agent1');
  const { nodes, edges } = buildWorkflowGraph(config, {}, -1, true);
  for (const id of [...config.ghosts, config.manager, 'stage1-facilitator', 'final-report']) {
    assert.ok(nodes.some(node => node.id === id));
  }
  assert.ok(edges.some(edge => edge.source === 'stage1-agent3' && edge.target === 'stage1-facilitator'));
  assert.ok(edges.every(({ source, target }) => nodes.some(node => node.id === source) && nodes.some(node => node.id === target)));
});

test('a sequential Manager forwards the corrected artifact before the following participant runs', async () => {
  const config = { ...configFor('error_propagation'), manager: 'stage0-agent2' as const };
  const nodes: NodeOutput[] = [];
  await runStage({
    config, stage: 0, counts, previousOutput: '', onNodeComplete: node => nodes.push(node),
    complete: async ({ system, user }) => {
      if (system.includes('additional verification responsibility')) {
        assert.match(JSON.parse(user).receivedInput, /Ghost draft/);
        return JSON.stringify({ status: 'verified', issues: [], artifact: 'Corrected headline' });
      }
      return /Corrected headline/.test(user) ? 'Final verified headline' : 'Ghost draft';
    },
  });
  assert.match(nodes[2]!.input, /Corrected headline/);
  assert.doesNotMatch(nodes[2]!.input, /Ghost draft/);
  assert.equal(nodes[2]!.output, 'Final verified headline');
});
