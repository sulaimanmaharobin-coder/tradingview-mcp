# MEMORY.md

Essential facts with a material impact on workflow. Keep entries short and dated.

## Claude Code usage limits (noted 2026-09-18)

- On 2026-09-14 Anthropic ended the temporary 50% Claude Code weekly boost and replaced it with a permanent 25% increase. Net effect for anyone who had been working on the boosted allowance was roughly a 17% cut in weekly capacity.
- Weekly and 5-hour limits are separate. The 5-hour rolling window was not changed; the weekly cap is what shrank.
- Fable 5.1 is heavy on usage. Reports from Max subscribers say a single large task can consume most of a session's allowance. Reserve Fable for genuinely complex work and default to Sonnet, per existing model preferences.
- Community reaction was strong: cancellations and visible switching to OpenAI Codex, which is preferred by many developers for uninterrupted daily use even though Claude's code quality is rated higher in blind reviews.
- Practical rule: keep `/model sonnet` as default, use `/effort low` or `medium` for drafts and edits, and step up to Opus or Fable only when the task earns it. Plan large Claude Code sessions early in the weekly window.
