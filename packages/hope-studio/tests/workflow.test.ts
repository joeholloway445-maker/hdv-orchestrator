/**
 * tests/workflow.test.ts — Unit tests for HOPE Studio workflow integration.
 *
 * Tests heuristicRoute, scenarioToWorkflow, and dev-mode submit functions
 * without any network calls or orchestrator dependency.
 *
 * Run: node --import tsx --test tests/workflow.test.ts
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { heuristicRoute, scenarioToWorkflow, simulateScenario, triggerScenario } from '../src/workflow';
import type { Persona, Scenario } from '../src/types';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makePersona(id = 'p1'): Persona {
  return {
    id,
    name: 'Lumen',
    personality: 'curious and warm',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function makeScenario(opts: { terminal?: boolean; withChoice?: boolean } = {}): Scenario {
  const sceneId = 's1';
  return {
    id: 'sc1',
    personaId: 'p1',
    title: 'First Meeting',
    entrySceneId: sceneId,
    scenes: [
      {
        id: sceneId,
        scenarioId: 'sc1',
        name: 'Opening Scene',
        lines: [{ speaker: 'hope', text: 'Hello traveler.' }],
        choices: opts.withChoice
          ? [{ id: 'c1', label: 'Continue', nextSceneId: 's2' }]
          : [],
        terminal: opts.terminal ?? true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── heuristicRoute ────────────────────────────────────────────────────────────

describe('heuristicRoute — MoE model selection', () => {
  test('simulation/high → fable', () => {
    assert.strictEqual(heuristicRoute('run scenario', 'simulation', 'high'), 'claude-fable-5');
  });

  test('simulation/medium → sonnet', () => {
    assert.strictEqual(heuristicRoute('run scenario', 'simulation', 'medium'), 'claude-sonnet-5');
  });

  test('security/high → opus', () => {
    assert.strictEqual(heuristicRoute('audit this', 'security', 'high'), 'claude-opus-5');
  });

  test('code/low → haiku', () => {
    assert.strictEqual(heuristicRoute('fix bug', 'code', 'low'), 'claude-haiku-4-5-20251001');
  });

  test('vision/any → sonnet', () => {
    assert.strictEqual(heuristicRoute('describe image', 'vision', 'medium'), 'claude-sonnet-5');
  });

  test('chat/low → haiku', () => {
    assert.strictEqual(heuristicRoute('hello', 'chat', 'low'), 'claude-haiku-4-5-20251001');
  });

  test('intent "dream" keyword → fable', () => {
    assert.strictEqual(heuristicRoute('dream up a world', 'general', 'medium'), 'claude-fable-5');
  });

  test('intent "audit" keyword → opus', () => {
    assert.strictEqual(heuristicRoute('audit security config', 'general', 'medium'), 'claude-opus-5');
  });

  test('low default → haiku', () => {
    assert.strictEqual(heuristicRoute('do stuff', 'general', 'low'), 'claude-haiku-4-5-20251001');
  });
});

// ── scenarioToWorkflow ────────────────────────────────────────────────────────

describe('scenarioToWorkflow — DAG generation', () => {
  const persona = makePersona();

  test('workflow contains a KNOLL audit node first', () => {
    const wf = scenarioToWorkflow(makeScenario(), persona);
    const knoll = wf.nodes.find((n) => n.type === 'knoll');
    assert.ok(knoll, 'should have a knoll node');
    assert.strictEqual(knoll!.id, 'knoll-0');
    assert.strictEqual(wf.nodes[0].id, 'knoll-0');
  });

  test('workflow contains an APEX MoE router node', () => {
    const wf = scenarioToWorkflow(makeScenario(), persona);
    const apex = wf.nodes.find((n) => n.type === 'apex');
    assert.ok(apex, 'should have an apex node');
    assert.strictEqual(apex!.data.nodeType, 'apex');
  });

  test('APEX data includes intent, category, budgetTier, moeModel', () => {
    const wf = scenarioToWorkflow(makeScenario(), persona, 'high');
    const apex = wf.nodes.find((n) => n.type === 'apex')!;
    assert.ok(typeof apex.data.intent === 'string' && (apex.data.intent as string).length > 0);
    assert.strictEqual(apex.data.category, 'simulation');
    assert.strictEqual(apex.data.budgetTier, 'high');
    assert.strictEqual(apex.data.moeModel, 'claude-fable-5');
  });

  test('knoll → apex edge exists', () => {
    const wf = scenarioToWorkflow(makeScenario(), persona);
    const hasEdge = wf.edges.some((e) => e.source === 'knoll-0' && e.target === 'apex-0');
    assert.ok(hasEdge);
  });

  test('each scene becomes a workflow node', () => {
    const wf = scenarioToWorkflow(makeScenario(), persona);
    const sceneNode = wf.nodes.find((n) => n.id === 'scene-s1');
    assert.ok(sceneNode, 'scene node should exist');
    assert.strictEqual(sceneNode!.type, 'ai');
    assert.strictEqual(sceneNode!.data.sceneId, 's1');
  });

  test('terminal scene generates a respond node', () => {
    const wf = scenarioToWorkflow(makeScenario({ terminal: true }), persona);
    const respond = wf.nodes.find((n) => n.type === 'respond');
    assert.ok(respond, 'should have a respond node for terminal scene');
  });

  test('choice edge is created when scene has nextSceneId', () => {
    const wf = scenarioToWorkflow(makeScenario({ withChoice: true }), persona);
    const choiceEdge = wf.edges.some((e) => e.source === 'scene-s1' && e.target === 'scene-s2');
    assert.ok(choiceEdge, 'choice edges should be created');
  });

  test('metadata includes scenarioId, personaId, moeModel', () => {
    const wf = scenarioToWorkflow(makeScenario(), persona);
    assert.strictEqual(wf.metadata.scenarioId, 'sc1');
    assert.strictEqual(wf.metadata.personaId, 'p1');
    assert.ok(typeof wf.metadata.moeModel === 'string' && wf.metadata.moeModel.length > 0);
  });

  test('budgetTier defaults to high (fable)', () => {
    const wf = scenarioToWorkflow(makeScenario(), persona);
    assert.strictEqual(wf.metadata.moeModel, 'claude-fable-5');
  });
});

// ── simulateScenario / triggerScenario — dev mode ────────────────────────────

describe('simulateScenario — dev mode (no orchestrator)', () => {
  test('returns error status when orchestrator not configured', async () => {
    delete process.env.WORKFLOW_API_URL;
    delete process.env.WORKFLOW_API_KEY;

    const result = await simulateScenario(makeScenario(), makePersona());
    assert.strictEqual(result.status, 'error');
    assert.ok(result.error?.includes('not configured'));
    assert.ok(result.moeModel.length > 0);
  });

  test('moeModel is fable for simulation/high', async () => {
    delete process.env.WORKFLOW_API_URL;
    const result = await simulateScenario(makeScenario(), makePersona(), 'high');
    assert.strictEqual(result.moeModel, 'claude-fable-5');
  });
});

describe('triggerScenario — dev mode (no orchestrator)', () => {
  test('returns error status when orchestrator not configured', async () => {
    delete process.env.WORKFLOW_API_URL;
    delete process.env.WORKFLOW_API_KEY;

    const result = await triggerScenario('wf-1', makeScenario(), makePersona());
    assert.strictEqual(result.status, 'error');
    assert.ok(result.error?.includes('not configured'));
  });
});
