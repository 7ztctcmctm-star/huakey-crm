# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## 5. 修复验证规则（强制执行）

**每次代码修改后，必须执行验证闭环，否则不得标记为"已修复"。**

### 验证步骤

每次修改代码后，必须依次完成：

1. **回读文件** — 用 Read 工具重新打开你修改过的文件
2. **确认改动** — 报告具体改了哪些行、改了什么内容（不能只说"已修复"）
3. **列出清单** — 列出本次修改的所有文件路径
4. **标记完成** — 只有验证通过后才能说"已修复"

### 禁止行为

- 未回读文件就声称"已修复"
- 批量标记多个"已修复"而不逐项验证
- 只描述"我打算怎么改"而不确认"改完了、这是证据"
- 改了A文件但忘记改联动的B文件（如改了前端但没改后端接口）

### 输出格式

每次修复完成后，必须输出：

```
## 修复验证报告

修改文件：
- [文件路径1]：第XX-XX行，[改了什么]
- [文件路径2]：第XX-XX行，[改了什么]

验证结果：
- [文件路径1]：已确认修改生效 ✓
- [文件路径2]：已确认修改生效 ✓

回滚方式：
- [如何撤销本次修改]
```

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
