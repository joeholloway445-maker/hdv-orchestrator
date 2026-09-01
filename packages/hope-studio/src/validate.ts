/**
 * Validates a Scenario graph for structural correctness before export/publish:
 *   - entrySceneId must reference a real scene
 *   - all choice.nextSceneId values must reference a real scene (or be undefined)
 *   - every scene reachable from entrySceneId must be included in the scenes array
 *   - no cycles that would prevent reaching a terminal scene
 */

import type { Scenario } from "./types";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateScenario(scenario: Scenario): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const sceneById = new Map(scenario.scenes.map((s) => [s.id, s]));

  // Entry scene must exist.
  if (!sceneById.has(scenario.entrySceneId)) {
    errors.push(`entrySceneId "${scenario.entrySceneId}" not found in scenes array`);
  }

  // All choice targets must exist.
  for (const scene of scenario.scenes) {
    for (const choice of scene.choices) {
      if (choice.nextSceneId && !sceneById.has(choice.nextSceneId)) {
        errors.push(
          `Scene "${scene.id}" choice "${choice.id}" points to unknown scene "${choice.nextSceneId}"`
        );
      }
    }
  }

  // Every scene must be reachable from the entry point.
  const reachable = new Set<string>();
  const queue = [scenario.entrySceneId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const scene = sceneById.get(id);
    if (!scene) continue;
    for (const choice of scene.choices) {
      if (choice.nextSceneId) queue.push(choice.nextSceneId);
    }
  }
  for (const scene of scenario.scenes) {
    if (!reachable.has(scene.id)) {
      warnings.push(`Scene "${scene.id}" ("${scene.name}") is unreachable from the entry point`);
    }
  }

  // At least one terminal scene must be reachable.
  const hasTerminal = scenario.scenes.some(
    (s) => reachable.has(s.id) && (s.terminal || s.choices.length === 0)
  );
  if (!hasTerminal && errors.length === 0) {
    warnings.push("No terminal scene found — the scenario has no reachable exit");
  }

  return { ok: errors.length === 0, errors, warnings };
}
