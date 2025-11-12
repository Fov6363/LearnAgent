import { NextRequest, NextResponse } from "next/server";

import { orchestrate } from "@/server/orchestrator";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, userId, message, state, adjustInstruction } = body ?? {};
    const result = await orchestrate({ sessionId, userId, message, state, adjustInstruction });
    return NextResponse.json(result);
  } catch (error) {
    console.error("agent-hub error", error);
    return NextResponse.json({ error: "Agent hub failed" }, { status: 500 });
  }
}
