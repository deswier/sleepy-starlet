You are a senior React/TypeScript developer.

Update the existing automated tests after recent security/database changes.

Do NOT weaken security logic.
Do NOT change production code unless you find an actual production bug and explain it first.

---

# Context

Recent security/database changes updated the intended behavior:

* direct inserts into `child_users` are no longer allowed
* child linking must happen only through secure RPC flows
* roles must not be self-assigned directly
* last owner/admin cannot be removed
* permission checks are stricter
* child access must be validated through proper server-side logic

---

# Task

Review and update the existing test suite so it matches the new intended behavior.

Do not assume tests are currently failing.
Proactively update outdated tests, mocks, fixtures, and expectations.

---

# What to Update

## 1. Supabase / Database mocks

Update mocks to reflect new behavior:

* direct `child_users.insert(...)` should be denied
* direct `child_user_roles.insert(...)` should be denied
* child linking should be mocked through RPC:

    * `create_child_with_link`
    * `redeem_child_invite`
* role changes should respect owner/admin permissions
* deleting or demoting the last owner/admin should be denied

---

## 2. Test fixtures

Update fixtures so they represent valid states:

* every child must have at least one owner/admin
* linked users must have valid roles
* no orphan child without owner/admin
* no fake self-assigned admin role

---

## 3. Unit tests

Add or update tests for:

* denied direct insert into `child_users`
* denied self-insert into `child_user_roles`
* successful child creation through RPC
* successful invite redemption through RPC
* denied last owner/admin removal
* denied editor/viewer destructive actions
* owner/admin permissions still work correctly

---

## 4. Integration / component tests

Update flows to use current intended behavior:

* creating child uses RPC flow
* joining child uses invite/RPC flow
* member removal respects permissions
* role management respects permissions
* deleted/restored child actions are owner/admin-only

---

# Rules

* Do not skip tests just to make suite green.
* Do not remove meaningful tests.
* Do not add weak tests that only check rendering.
* Prefer behavior-based assertions.
* Keep tests deterministic.
* Mock Supabase consistently.
* If a test relied on insecure old behavior, rewrite it to assert that the behavior is now rejected.

---

# Output

Provide:

1. What test files were updated.
2. What outdated assumptions were replaced.
3. What new tests were added.
4. Whether any production bugs were discovered.
5. How to run the updated tests.

Implement exactly as described.
