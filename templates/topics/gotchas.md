# Resolved Gotchas & Edge Cases (Tier 2 - Lazy Loaded)
> **CRUD RULE**: Format strictly as `[Component/Symptom] -> [Root Cause] -> [Fix]`. Delete obsolete entries.

- `[Example: Auth Token Refresh]` -> `[Race condition on parallel 401s]` -> `[Use mutex lock in interceptor]`
