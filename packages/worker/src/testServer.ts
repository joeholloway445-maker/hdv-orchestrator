import http from "node:http";
import { PrismaClient } from "@prisma/client";
import { executeNode } from "./nodes/index";

export function startTestServer(prisma: PrismaClient) {
  const port = Number(process.env.WORKER_HTTP_PORT) || 4001;

  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/test-node") {
      res.writeHead(404);
      res.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", async () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString());
        const { node, input } = body;
        if (!node) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing node" }));
          return;
        }
        const output = await executeNode(node, input || {}, prisma);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ output }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: message }));
      }
    });
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`[TestServer] Listening on 127.0.0.1:${port}`);
  });
}
