import "dotenv/config";
import express from "express";
import cors from "cors";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { authRouter } from "./routes/auth";
import { workflowsRouter } from "./routes/workflows";
import { executionsRouter } from "./routes/executions";
import { webhooksRouter } from "./routes/webhooks";
import { setupSocketIO } from "./socket";
import { verifyToken } from "./middleware/auth";

const app = express();
const server = http.createServer(app);

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

app.use("/auth", authRouter);
app.use("/webhooks", webhooksRouter);
app.use("/workflows", verifyToken, workflowsRouter);
app.use("/executions", verifyToken, executionsRouter);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  },
});

setupSocketIO(io);

const port = Number(process.env.PORT) || 4000;
server.listen(port, () => {
  console.log(`[API] Listening on http://localhost:${port}`);
});
