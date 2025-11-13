'use client';

import { useCallback, useMemo, useState } from "react";
import type { SessionState, AgentType } from "@/lib/schema";

type StreamEvent =
  | { type: "agent_message"; agent: AgentType; content: string }
  | { type: "state"; state: SessionState }
  | { type: "session"; sessionId: string }
  | { type: "done"; sessionId: string }
  | { type: "error"; message: string };

const EMPTY_STATE: SessionState = {
  slots: {},
  quiz: { status: "idle" },
  history: [],
  next_agent: "none",
};

const agentLabel: Record<AgentType, string> = {
  navigator: "导航教练",
  diagnostic: "诊断测评",
  curriculum: "大纲规划",
  scheduler: "计划排程",
  adjust: "计划调整",
  none: "系统",
};

export function WizardClient() {
  const [sessionId, setSessionId] = useState<string>();
  const [sessionState, setSessionState] = useState<SessionState>(EMPTY_STATE);
  const [messages, setMessages] = useState<Array<{ role: "user" | "agent"; agent?: AgentType; content: string }>>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [adjustNote, setAdjustNote] = useState("");
  const [activeStreamController, setActiveStreamController] = useState<AbortController | null>(null);

  const hydrateQuizAnswers = useCallback((state: SessionState) => {
    if (state.quiz?.questions?.length) {
      setQuizAnswers((prev) => {
        const next = { ...prev };
        state.quiz?.questions?.forEach((q) => {
          if (next[q.id] === undefined) {
            next[q.id] = "";
          }
        });
        return next;
      });
    }
  }, []);

  const handleStreamEvent = useCallback(
    (event: StreamEvent) => {
      switch (event.type) {
        case "session":
          setSessionId(event.sessionId);
          break;
        case "agent_message":
          setMessages((prev) => [...prev, { role: "agent", agent: event.agent, content: event.content }]);
          break;
        case "state":
          setSessionState(event.state);
          setMessages(event.state.history ?? []);
          hydrateQuizAnswers(event.state);
          break;
        case "error":
          setError(event.message);
          break;
        case "done":
          setSessionId((prev) => prev ?? event.sessionId);
          break;
        default:
          break;
      }
    },
    [hydrateQuizAnswers],
  );

  const callAgentHub = useCallback(
    async (opts: { message?: string; stateOverride?: SessionState; adjustInstruction?: string }) => {
      activeStreamController?.abort();
      const controller = new AbortController();
      setActiveStreamController(controller);
      setIsLoading(true);
      setError(undefined);
      try {
        const response = await fetch("/api/agent-hub", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            state: opts.stateOverride ?? sessionState,
            message: opts.message,
            adjustInstruction: opts.adjustInstruction,
          }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          throw new Error(`Agent hub error: ${response.status}`);
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const chunk = buffer.slice(0, boundary).trim();
            buffer = buffer.slice(boundary + 2);
            if (chunk) {
              const payload = chunk.startsWith("data:") ? chunk.slice(5).trim() : chunk;
              if (payload) {
                try {
                  const event: StreamEvent = JSON.parse(payload);
                  handleStreamEvent(event);
                } catch (err) {
                  console.error("Failed to parse agent stream event", err, chunk);
                }
              }
            }
            boundary = buffer.indexOf("\n\n");
          }
        }
        const remaining = buffer.trim();
        if (remaining) {
          try {
            const event: StreamEvent = JSON.parse(remaining.startsWith("data:") ? remaining.slice(5).trim() : remaining);
            handleStreamEvent(event);
          } catch {
            // ignore trailing noise
          }
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
        setActiveStreamController(null);
      }
    },
    [activeStreamController, sessionId, sessionState, handleStreamEvent],
  );

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    const nextMessages = [...messages, { role: "user" as const, content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    await callAgentHub({ message: trimmed });
  };

  const pendingQuizQuestions = useMemo(() => {
    if (sessionState.quiz?.status !== "awaiting_answers") return [];
    return sessionState.quiz.questions ?? [];
  }, [sessionState.quiz]);

  const submitQuizAnswers = async () => {
    if (!sessionState.quiz?.questions) return;
    const answersPayload = sessionState.quiz.questions.reduce<Record<string, string>>((acc, question) => {
      acc[question.id] = quizAnswers[question.id] ?? "";
      return acc;
    }, {});
    const updatedState: SessionState = {
      ...sessionState,
      quiz: {
        ...sessionState.quiz,
        answers: answersPayload,
        status: "needs_grading",
      },
      next_agent: "diagnostic",
    };
    await callAgentHub({ stateOverride: updatedState });
  };

  const requestAgent = async (agent: AgentType) => {
    const updatedState: SessionState = {
      ...sessionState,
      next_agent: agent,
    };
    await callAgentHub({ stateOverride: updatedState });
  };

  const submitAdjustment = async () => {
    if (!adjustNote.trim()) return;
    const updatedState: SessionState = {
      ...sessionState,
      next_agent: "adjust",
    };
    await callAgentHub({ stateOverride: updatedState, adjustInstruction: adjustNote });
    setAdjustNote("");
  };

  return (
    <div className="flex flex-col gap-4 max-w-4xl mx-auto py-8 px-4">
      <header>
        <h1 className="text-2xl font-semibold">开发者学习助手 · 多 Agent 向导</h1>
        <p className="text-sm text-gray-500">与 Orchestrator 对话，实时生成路径，小测与计划。</p>
      </header>

      <section className="flex flex-col gap-2 border rounded-lg p-4 bg-white/60 max-h-[420px] overflow-y-auto">
        {(sessionState.history ?? []).map((entry, idx) => {
          if (entry.role === "user") {
            return (
              <div key={idx} className="text-right">
                <div className="inline-block rounded-lg bg-blue-600 text-white px-3 py-2 text-sm">{entry.content}</div>
              </div>
            );
          }
          return (
            <div key={idx} className="text-left">
              <div className="text-xs text-gray-500 mb-1">{agentLabel[(entry.agent ?? "navigator") as AgentType]}</div>
              <div className="inline-block rounded-lg bg-gray-100 px-3 py-2 text-sm whitespace-pre-line">{entry.content}</div>
            </div>
          );
        })}
        {isLoading && <div className="text-xs text-gray-400">Agent 正在思考…</div>}
        {error && <div className="text-xs text-red-500">错误：{error}</div>}
      </section>

      <section className="flex items-center gap-2">
        <input
          className="flex-1 border rounded-md px-3 py-2 text-sm"
          placeholder="告诉 FlowLearn 你的目标或问题…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm" onClick={handleSend} disabled={isLoading}>
          发送
        </button>
      </section>

      {pendingQuizQuestions.length > 0 && (
        <section className="border rounded-lg p-4 bg-yellow-50 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">诊断小测</h2>
            <span className="text-xs text-orange-600">回答后提交，Agent 将自动评分</span>
          </div>
          {pendingQuizQuestions.map((question) => (
            <div key={question.id} className="space-y-1">
              <p className="text-sm font-medium">
                {question.prompt} <span className="text-xs text-gray-500">（{question.type}）</span>
              </p>
              <textarea
                className="w-full border rounded-md px-2 py-1 text-sm"
                rows={3}
                value={quizAnswers[question.id] ?? ""}
                onChange={(e) => setQuizAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))}
              />
            </div>
          ))}
          <button className="px-4 py-2 rounded-md bg-green-600 text-white text-sm" onClick={submitQuizAnswers} disabled={isLoading}>
            提交答案
          </button>
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-3">
        <button className="border rounded-md px-3 py-2 text-sm" onClick={() => requestAgent("curriculum")} disabled={isLoading}>
          生成学习大纲
        </button>
        <button className="border rounded-md px-3 py-2 text-sm" onClick={() => requestAgent("scheduler")} disabled={isLoading}>
          生成详细计划
        </button>
        <button className="border rounded-md px-3 py-2 text-sm" onClick={() => requestAgent("diagnostic")} disabled={isLoading}>
          重新触发小测
        </button>
      </section>

      <section className="border rounded-lg p-4 space-y-2">
        <h2 className="text-sm font-semibold">计划调整</h2>
        <textarea
          className="w-full border rounded-md px-2 py-1 text-sm"
          rows={3}
          placeholder="例如：把第三周项目换成 LangChain QA Bot"
          value={adjustNote}
          onChange={(e) => setAdjustNote(e.target.value)}
        />
        <button className="self-start px-3 py-2 rounded-md bg-purple-600 text-white text-sm" onClick={submitAdjustment} disabled={isLoading}>
          提交调整需求
        </button>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-2">大纲</h3>
          {sessionState.outline ? (
            <div className="space-y-2 text-sm">
              <p className="text-gray-600">{sessionState.outline.summary}</p>
              <ul className="space-y-2">
                {sessionState.outline.stages.map((stage) => (
                  <li key={stage.id} className="border rounded-md p-2">
                    <div className="font-medium">{stage.name}</div>
                    <p className="text-xs text-gray-500">{stage.objective}</p>
                    <ul className="text-xs list-disc pl-4 mt-1">
                      {stage.focus_topics.map((topic) => (
                        <li key={topic}>{topic}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-gray-500">还没有生成大纲。</p>
          )}
        </div>
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-2">每日计划</h3>
          {sessionState.plan ? (
            <ul className="space-y-2 max-h-64 overflow-y-auto text-sm">
              {sessionState.plan.daily_schedule.map((day) => (
                <li key={day.day_index} className="border rounded-md p-2">
                  <div className="font-medium">第 {day.day_index} 天 · {day.focus}</div>
                  <ul className="text-xs list-disc pl-4 mt-1">
                    {day.checklist.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-500">计划尚未生成。</p>
          )}
        </div>
      </section>
    </div>
  );
}
