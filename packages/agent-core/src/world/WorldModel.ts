import { WorldState } from "../core/types";

const WORLD_API_URL = process.env.WORLD_API_URL ?? "";

export class WorldModel {
  async generate(prompt: string): Promise<WorldState> {
    if (!WORLD_API_URL) {
      return this.stubWorld(prompt);
    }

    try {
      const res = await fetch(WORLD_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return this.stubWorld(prompt);
      const data = await res.json() as WorldState;
      return data;
    } catch {
      return this.stubWorld(prompt);
    }
  }

  private stubWorld(prompt: string): WorldState {
    return {
      sceneId: `stub-${Date.now()}`,
      description: prompt,
      entities: [
        { type: "user", presence: "active" },
        { type: "companion", presence: "attentive" },
      ],
      mood: "calm",
    };
  }
}
