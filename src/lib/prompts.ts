type PromptSection = {
  name: string;
  content: string;
};

const template = (sections: PromptSection[]): string =>
  sections
    .map((section) => {
      const header = section.name ? `### ${section.name}\n` : "";
      return `${header}${section.content.trim()}`;
    })
    .join("\n\n");

const SYSTEM_PROMPT = `
You are FlowLearn, an AI learning coach helping developers design personalized study plans.
- Goal: guide the user through a conversational wizard, collect structured slots, and produce JSON outputs that downstream services can parse.
- Style: friendly, concise, use Chinese unless the user switches language; avoid bullet lists longer than 3 items.
- Always respect the current wizard state passed in "state_hint".
- When asked to emit JSON, respond with only valid JSON (no backticks, comments, or extra text).
`.trim();

export const buildChatCollectPrompt = ({
  stateHint,
  slotsJson,
  historySnippet,
}: {
  stateHint: string;
  slotsJson: string;
  historySnippet: string;
}) =>
  template([
    { name: "System", content: SYSTEM_PROMPT },
    {
      name: "Context",
      content: [
        `- Current state: ${stateHint}`,
        `- Slots (may be null): ${slotsJson}`,
        `- Conversation excerpt: ${historySnippet}`,
      ].join("\n"),
    },
    {
      name: "Instruction",
      content: `
1. Ask ONE question that best progresses toward filling missing slots for this state.
2. If the user just answered, acknowledge briefly and either ask the next question or mark the state as ready.
3. When enough info is gathered for this state, set "state_ready" = true and suggest transition.
Output JSON schema:
{
  "assistant_reply": "对话自然语言",
  "slot_updates": { ... only changed keys ... },
  "state_ready": true/false,
  "next_state_hint": "goal_focus|level_check|recap_confirm|outline_draft"
}
      `.trim(),
    },
  ]);

export const buildQuizPrompt = ({
  goal,
  levelHint,
  experienceNotes,
}: {
  goal: string;
  levelHint: string;
  experienceNotes?: string;
}) =>
  template([
    { name: "System", content: SYSTEM_PROMPT },
    {
      name: "Context",
      content: [
        `User goal: ${goal}`,
        `Target level (self-assessed): ${levelHint}`,
        `Known experience: ${experienceNotes ?? "unknown"}`,
      ].join("\n"),
    },
    {
      name: "Instruction",
      content: `
Generate an array of 2-3 diagnostic questions tailored to the goal.
Mix question types: short answer, concept check, or mini coding task.
Each item schema:
{
  "id": "quiz-1",
  "type": "concept|code|choice",
  "prompt": "...",
  "expected_answer": "...",
  "explanation": "用于评分时的参考"
}
Return JSON: { "questions": [ ... ] }
      `.trim(),
    },
  ]);

export const buildQuizGradePrompt = ({
  questionsJson,
  userAnswersJson,
}: {
  questionsJson: string;
  userAnswersJson: string;
}) =>
  template([
    { name: "System", content: SYSTEM_PROMPT },
    {
      name: "Context",
      content: [`Questions: ${questionsJson}`, `User answers: ${userAnswersJson}`].join("\n"),
    },
    {
      name: "Instruction",
      content: `
Steps:
1. 对比答案并给出每题得分（0-1）与反馈。
2. 给出 overall score (0-100)。
3. 推断 level: beginner/intermediate/advanced。
4. 输出 "recommended_start_stage"（如 "Foundations" 或 "Stage 2"）。

Return JSON:
{
  "score": 72,
  "level": "intermediate",
  "recommended_start_stage": "Stage 2",
  "per_question": [
    {"id":"quiz-1","score":1,"feedback":"..."}
  ],
  "misconceptions": ["..."]
}
      `.trim(),
    },
  ]);

export const buildOutlinePrompt = ({
  slotsJson,
}: {
  slotsJson: string;
}) =>
  template([
    { name: "System", content: SYSTEM_PROMPT },
    {
      name: "Context",
      content: `Slots: ${slotsJson}`,
    },
    {
      name: "Instruction",
      content: `
Produce a 3-stage learning outline (Foundations → Practice → Project/Deepening).
Constraints:
- Exactly 3 stages unless duration > 30 days (then max 4).
- Each stage must include "objective", "focus_topics" (3-5 bullet strings), "entry_requirement".
- Provide "summary" (<= 2 sentences).

Return JSON:
{
  "summary": "...",
  "stages": [
    {
      "id": "stage-1",
      "name": "Foundations",
      "objective": "...",
      "focus_topics": ["..."],
      "entry_requirement": "..."
    }
  ]
}
      `.trim(),
    },
  ]);

export const buildPathPrompt = ({
  outlineJson,
  slotsJson,
}: {
  outlineJson: string;
  slotsJson: string;
}) =>
  template([
    { name: "System", content: SYSTEM_PROMPT },
    {
      name: "Context",
      content: [`Confirmed outline: ${outlineJson}`, `Slots: ${slotsJson}`].join("\n"),
    },
    {
      name: "Instruction",
      content: `
Produce detailed plan:
1. Expand each stage into 3-5 nodes with fields:
   { "id","stage_id","title","description","skills","est_minutes","difficulty","resources":[{title,url,type}] }
2. Build "daily_schedule": distribute nodes across "duration_days", include focus, node_ids, checklist (2-3 actionable bullets).
3. Ensure total estimated minutes per day ≈ user time commitment (allow ±20%).
4. Include buffer/review days every 5-6 days.

Return JSON:
{
  "stages": [...],
  "nodes": [...],
  "daily_schedule": [
    {"day_index":1,"focus":"...","node_ids":["node-1"],"checklist":["..."]}
  ]
}
      `.trim(),
    },
  ]);

export const buildAdjustPrompt = ({
  currentPlanJson,
  instruction,
}: {
  currentPlanJson: string;
  instruction: string;
}) =>
  template([
    { name: "System", content: SYSTEM_PROMPT },
    {
      name: "Context",
      content: [
        `Current plan JSON: ${currentPlanJson}`,
        `User instruction: "${instruction}"`,
      ].join("\n"),
    },
    {
      name: "Instruction",
      content: `
Rules:
- Only modify sections relevant to the request.
- Keep IDs stable for unchanged nodes/tasks.
- If the request conflicts with constraints (time, prerequisites), explain within "notes".

Return JSON:
{
  "updated_plan": { ... same schema as generate/path ... },
  "notes": ["说明本次修改影响，如延长 3 天"]
}
      `.trim(),
    },
  ]);
