/**
 * Core types for HOPE Studio content authoring.
 *
 * A Persona is a named HOPE character with traits and a voice style.
 * A Scene is a discrete interaction unit: one set of dialogue lines + choices.
 * A Scenario groups scenes into a traversable graph.
 */

export interface Persona {
  id: string;
  name: string;
  /** Short prose describing personality — fed to the LLM as system context. */
  personality: string;
  /** Tone/voice hints for TTS or stylistic generation. */
  voiceStyle?: string;
  /** Big-5 axis seeds (0–1 each): openness, conscientiousness, extraversion, agreeableness, neuroticism */
  big5?: Partial<Record<"O" | "C" | "E" | "A" | "N", number>>;
  createdAt: string;
  updatedAt: string;
}

export interface DialogueLine {
  speaker: "hope" | "player" | string;
  text: string;
  /** Optional TTS voice override for this specific line. */
  voice?: string;
}

export interface Choice {
  id: string;
  label: string;
  /** Scene ID to transition to when this choice is selected. */
  nextSceneId?: string;
  /** Axis deltas applied after the player picks this choice (e.g. { A: 0.05 }). */
  axisDelta?: Partial<Record<"O" | "C" | "E" | "A" | "N", number>>;
}

export interface Scene {
  id: string;
  scenarioId: string;
  name: string;
  lines: DialogueLine[];
  choices: Choice[];
  /** If true, this scene ends the scenario branch. */
  terminal?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Scenario {
  id: string;
  personaId: string;
  title: string;
  description?: string;
  /** ID of the first scene in the graph. */
  entrySceneId: string;
  scenes: Scene[];
  createdAt: string;
  updatedAt: string;
}
