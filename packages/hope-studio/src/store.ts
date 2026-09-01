/**
 * In-memory store for personas, scenarios, and scenes.
 * Swap this for a Supabase-backed implementation in production.
 */

import type { Persona, Scenario, Scene } from "./types";

export class StudioStore {
  private personas = new Map<string, Persona>();
  private scenarios = new Map<string, Scenario>();

  // ── Personas ────────────────────────────────────────────────────────────────

  upsertPersona(persona: Persona): void {
    this.personas.set(persona.id, { ...persona, updatedAt: new Date().toISOString() });
  }

  getPersona(id: string): Persona | undefined {
    return this.personas.get(id);
  }

  listPersonas(): Persona[] {
    return Array.from(this.personas.values());
  }

  deletePersona(id: string): boolean {
    return this.personas.delete(id);
  }

  // ── Scenarios ───────────────────────────────────────────────────────────────

  upsertScenario(scenario: Scenario): void {
    this.scenarios.set(scenario.id, { ...scenario, updatedAt: new Date().toISOString() });
  }

  getScenario(id: string): Scenario | undefined {
    return this.scenarios.get(id);
  }

  listScenariosForPersona(personaId: string): Scenario[] {
    return Array.from(this.scenarios.values()).filter((s) => s.personaId === personaId);
  }

  deleteScenario(id: string): boolean {
    return this.scenarios.delete(id);
  }

  // ── Scenes (accessed via their parent scenario) ──────────────────────────────

  getScene(scenarioId: string, sceneId: string): Scene | undefined {
    return this.getScenario(scenarioId)?.scenes.find((s) => s.id === sceneId);
  }

  upsertScene(scenarioId: string, scene: Scene): boolean {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) return false;
    const idx = scenario.scenes.findIndex((s) => s.id === scene.id);
    const updated = { ...scene, updatedAt: new Date().toISOString() };
    if (idx >= 0) {
      scenario.scenes[idx] = updated;
    } else {
      scenario.scenes.push(updated);
    }
    this.scenarios.set(scenarioId, { ...scenario, updatedAt: new Date().toISOString() });
    return true;
  }

  deleteScene(scenarioId: string, sceneId: string): boolean {
    const scenario = this.scenarios.get(scenarioId);
    if (!scenario) return false;
    const before = scenario.scenes.length;
    scenario.scenes = scenario.scenes.filter((s) => s.id !== sceneId);
    if (scenario.scenes.length === before) return false;
    this.scenarios.set(scenarioId, { ...scenario, updatedAt: new Date().toISOString() });
    return true;
  }
}
