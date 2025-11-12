# 对话式学习路径生成方案

## 1. 对话流与状态机

- 阶段：`intro` → `goal_focus` → `level_check` → `recap_confirm` → `outline_draft` → `daily_plan` → `final_confirm`。
- 前端使用状态机（XState 或自定义 reducer）管理阶段与槽位（goal/duration/level/resources/test_score）。
- 每轮交互写入 `path_sessions`（`session_id`, `user_id`, `state`, `slots jsonb`, `chat_history jsonb`, `updated_at`）以支持断点恢复。
- 状态机决定下一提示词与问题；槽位填充完整后方可进入后续阶段。

## 2. LLM 接口设计

|接口|用途|输入|输出|
|---|---|---|---|
|`POST /api/chat/collect`|处理信息收集阶段对话|`session_id`, `message`|`assistant_reply`, `slots_delta`, `next_state`|
|`POST /api/generate/outline`|生成 3 段式大纲|`session_id`, `slots`|`summary`, `stages[]` （包含 `id/name/objective/focus_topics`）|
|`POST /api/generate/path`|生成最终路径+任务 JSON|`session_id`, `confirmed_outline`|`stages[]`, `nodes[]`, `daily_schedule[]`（最终结构）|
|`POST /api/adjust`|处理用户修改需求|`current_plan`, `instruction`|更新后的路径 JSON|
|`GET /api/quiz` / `POST /api/quiz/grade`|生成并评分小测|目标/水平、用户回答|`questions[]`; `score`, `misconceptions`, `recommended_start_stage`|

LLM Prompt 需显式约束 JSON schema（可用 zod/ajv 验证与自动重试），并要求保持未修改部分稳定。

## 3. 小测与水平评估

- 根据用户目标动态生成 2–3 题（概念判断、简答或代码片段）。
- 评分后映射到水平（0–40 初级、40–70 中级、70+ 高级）并写入槽位。
- `recommended_start_stage` 影响生成路径的起始节点。

## 4. 数据库存储（Supabase）

- `learning_paths(id, user_id, goal, duration_days, level, summary, session_id, created_at)`
- `path_nodes(id, path_id, stage_id, title, description, skills text[], difficulty, est_minutes, resources jsonb, order_idx)`
- `daily_tasks(id, path_id, day_index, focus, node_ids text[], checklist jsonb)`
- `path_feedback(id, path_id, rating, comments)`
- `path_sessions`（存临时状态，草稿阶段使用）

所有写库操作在最终确认后通过事务执行，确保路径与节点、任务一致。

## 5. 前端体验

- Chat UI（Next.js + Vercel AI SDK/LangChain JS）负责流式对话。
- 右侧 `PathPreview` 使用 react-flow 展示阶段/节点草稿，实时读取 state。
- 大纲阶段可拖拽重排；确认后触发详细计划生成。
- `final_confirm` 展示日程（timeline + daily cards），提供“接受并保存 / 重新生成”选项；调整走 `adjust` 接口。

## 6. 验证与监控

- 后端对 LLM 输出执行 schema 验证（zod/ajv），失败时重试并记录日志。
- `generation_logs` 记录每次调用的 prompt/响应/token 用量供分析。
- 指标：路径生成完成率、平均对话轮数、大纲满意度评分、节点覆盖度（≥3 阶段）与任务时间一致性。

## 7. Prompt 模板

### 7.1 全局 System Prompt

```
You are FlowLearn, an AI learning coach helping developers design personalized study plans.
- Goal: guide the user through a conversational wizard, collect structured slots, and produce JSON outputs that downstream services can parse.
- Style: friendly, concise, use Chinese unless user switches language; avoid bullet lists longer than 3 items.
- Always respect the current wizard state passed in `state_hint`.
- When asked to emit JSON, respond with only valid JSON (no backticks, comments, or extra text).
```

### 7.2 `POST /api/chat/collect`

**Message模板**

```
<system_prompt>

Context:
- Current state: {state_hint}
- Slots (may be null): {slots_json}
- Conversation excerpt: {history_snippet}

Instruction:
1. Ask ONE question that best progresses toward filling missing slots for this state.
2. If the user just answered, acknowledge briefly and either ask the next question or mark the state as ready.
3. When enough info is gathered for this state, set `state_ready` = true and suggest transition.

Output JSON schema:
{
  "assistant_reply": "对话自然语言",
  "slot_updates": { ... only changed keys ... },
  "state_ready": true/false,
  "next_state_hint": "goal_focus|level_check|recap_confirm|outline_draft"
}
```

**阶段指引**

- `intro`: 了解动机/背景，问题轻松开放。
- `goal_focus`: 追问目标、时间投入、具体技术栈；引导用户聚焦。
- `level_check`: 先让用户自评，再引出小测准备。
- `recap_confirm`: 以自然语言总结 slots，询问是否需要修改，若确认则 `state_ready=true` → `outline_draft`。

### 7.3 `GET /api/quiz`

```
<system_prompt>

User goal: {goal}
Target level (self-assessed): {level_hint}
Known experience: {experience_notes}

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
```

### 7.4 `POST /api/quiz/grade`

```
<system_prompt>

Questions: {questions_json}
User answers: {user_answers_json}

Steps:
1. 对比答案并给出每题得分（0-1）与反馈。
2. 给出 overall score (0-100)。
3. 推断 level: beginner/intermediate/advanced。
4. 输出 `recommended_start_stage`（如 "Foundations" 或 "Stage 2"）。

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
```

### 7.5 `POST /api/generate/outline`

```
<system_prompt>

Slots: {slots_json}  // 包含 goal, duration_days, level, time_commitment, preferences, quiz_score

Task: Produce a 3-stage learning outline (Foundations → Practice → Project/Deepening).
Constraints:
- Exactly 3 stages unless duration > 30 days (then max 4).
- Each stage must include `objective`, `focus_topics` (3-5 bullet strings), `entry_requirement`.
- Provide `summary` (<= 2 sentences).

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
```

### 7.6 `POST /api/generate/path`

```
<system_prompt>

Inputs:
- Confirmed outline: {outline_json}
- Slots (goal/duration/level/preferences): {slots_json}

Produce detailed plan:
1. Expand each stage into 3-5 nodes with fields:
   { "id","stage_id","title","description","skills","est_minutes","difficulty","resources":[{title,url,type}] }
2. Build `daily_schedule`: distribute nodes across `duration_days`, include focus, node_ids, checklist (2-3 actionable bullets).
3. Ensure total estimated minutes per day ≈ user time commitment (allow ±20%).
4. Include buffer/review days every 5-6 days.

Return JSON:
{
  "stages": [...],        // copy of outline with optional tweaks
  "nodes": [...],         // detailed nodes
  "daily_schedule": [
    {"day_index":1,"focus":"...","node_ids":["node-1"],"checklist":["..."]}
  ]
}
```

### 7.7 `POST /api/adjust`

```
<system_prompt>

Current plan JSON: {current_plan}
User instruction: "{adjust_request}"

Rules:
- Only modify sections relevant to the request.
- Keep IDs stable for unchanged nodes/tasks.
- If the request conflicts with constraints (time, prerequisites), explain within `notes`.

Return JSON:
{
  "updated_plan": { ... same schema as generate/path ... },
  "notes": ["说明本次修改影响，如延长 3 天"]
}
```
