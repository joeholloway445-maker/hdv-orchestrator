# HDV Orchestrator v0.2.0

Correct architecture:

- **HOPE** (persistent) — Interprets user intent and governs. Assigns work via Apex.
- **APEX** (persistent) — Pure orchestrator / traffic controller. Assigns nodes.
- **KNOLL** (persistent) — Security gate.
- **DREAM / VISION** — Ephemeral matrices. Nodes are spun up only when needed and self-terminate.

Topology:
- 5 matrices
- 64 sub-managers per matrix (8×8)
- 64 nodes per manager
- **20,480 total nodes**
- 100 personas per node → **2,048,000 logical personas**

Almost all nodes stay dormant. Only activated nodes do work, then self-terminate.

## Quick start (on your KVM4)

```bash
git clone https://github.com/joeholloway445-maker/hdv-orchestrator.git
cd hdv-orchestrator
npm install
cp .env.example .env
npm run dev
```

Then test:

```bash
curl -X POST http://localhost:3000/intent \
  -H "Content-Type: application/json" \
  -d '{"text": "Imagine a private subliminal chamber"}'
```

```bash
curl http://localhost:3000/stats
```
