---
name: fixer-ci
description: CI 加安全扫描
tools: Read, Edit
---

改 .github/workflows/ci.yml：backend-test job 的 test 步骤后加：

- run: cd backend && npm audit --audit-level=high
- run: cd backend && npx eslint . --max-warnings=0 || true
