# This repo's role in the Periliminal Space ecosystem

This is a pristine, unmodified clone of
[`mistralai/mistral-inference`](https://github.com/mistralai/mistral-inference)
(the repo name "APEX-Nodes" is cosmetic at the GitHub level only — there is
no internal branding or orchestration code reflecting that name).

## Why this repo exists in this account

[Periliminal Space](https://github.com/joeholloway445-maker/CATSINO.CASINO)
is a Godot/Next.js game/SIM with an AI companion ("Hope") whose
conversational dialogue currently hardcodes the Anthropic API
(`apps/hdv-core/app/api/hope/route.ts` in the monorepo), and a
`services/psychology` behavioral engine that is currently a pure heuristic
with no LLM at all. This repo is the evaluated candidate for a
self-hosted alternative — see
[`docs/ECOSYSTEM.md`](https://github.com/joeholloway445-maker/CATSINO.CASINO/blob/HEAD/docs/ECOSYSTEM.md)
in the monorepo for the full account-wide picture.

## Deployment path (already in this repo, not yet used)

`deploy/Dockerfile` builds a CUDA 12.1 image running
`vllm.entrypoints.openai.api_server`, exposing an OpenAI-compatible
`/v1/chat/completions` endpoint — Hope's dialogue code or the psychology
engine could call this exactly like an OpenAI client.

## License caveat — read before picking a model

Code is Apache 2.0. **Model weights are not uniformly licensed**:
- Commercially usable: Mistral 7B, Mistral Nemo, Mistral Small 3.1,
  Mathstral, Codestral-Mamba.
- Non-commercial only: Codestral (MNPL), Mistral Large 2 (MRL).

Any integration into a commercial product must stick to the first group.
`README.md` also carries a "usage restrictions regarding third-party
rights" clause (added upstream in the commit history) worth re-reading
before deployment.

Nothing has been deployed or wired into CATSINO.CASINO yet — this file
documents the connection, not a shipped integration.
