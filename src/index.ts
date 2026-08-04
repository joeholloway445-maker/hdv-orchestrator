import "dotenv/config";
import express from "express";
import { Topology } from "./nodes/Topology";
import { Apex } from "./orchestrator/Apex";
import { Hope } from "./agents/Hope";
import { Knoll } from "./agents/Knoll";

async function main() {
  console.log("========================================");
  console.log("  HDV Orchestrator v0.2.0");
  console.log("  Apex-controlled 20,480-node topology");
  console.log("========================================\n");

  const topology = new Topology();
  const apex = new Apex(topology);
  const hope = new Hope(apex);
  const knoll = new Knoll();

  const app = express();
  app.use(express.json());

  app.get("/", (_req, res) => {
    res.json({
      service: "HDV Orchestrator",
      version: "0.2.0",
      status: "online",
      topology: topology.stats(),
      message: "Talk to HOPE. KNOLL gates every route. APEX is the only road through.",
    });
  });

  app.get("/stats", (_req, res) => {
    res.json({
      apex: apex.getStats(),
      knoll: knoll.stats(),
      hope: { recentIntents: hope.recentIntents(3) },
    });
  });

  app.post("/intent", (req, res) => {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text is required" });
    }

    const gate = knoll.check({ text });
    if (!gate.allowed) {
      return res.status(403).json({ error: "Blocked by KNOLL", reason: gate.reason });
    }

    const result = hope.interpret(text);
    res.json(result);
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`\n[Server] Listening on http://localhost:${port}`);
    console.log("[Server] POST /intent  { \"text\": \"your message\" }");
    console.log("[Server] GET  /stats\n");
  });
}

main().catch(console.error);
