import { NextRequest, NextResponse } from "next/server";

import { orchestrate, type OrchestratorStreamEvent } from "@/server/orchestrator";

type AgentHubStreamEvent =
  | OrchestratorStreamEvent
  | { type: "session"; sessionId: string }
  | { type: "done"; sessionId: string }
  | { type: "error"; message: string };

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sessionId, message, state, adjustInstruction } = body ?? {};

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: AgentHubStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const result = await orchestrate(
          { sessionId, message, state, adjustInstruction },
          (event) => send(event),
        );
        send({ type: "session", sessionId: result.sessionId });
        send({ type: "done", sessionId: result.sessionId });
      } catch (error) {
        console.error("agent-hub error", error);
        send({ type: "error", message: (error as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
