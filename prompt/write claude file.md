You are a senior software engineer and technical writer.

Using the full conversation context, update and complete the project documentation.

---

# Goal

Generate and/or update the following files:

* claude.md — instructions for AI (development rules, architecture, constraints)
* README.md — project overview for developers

Do NOT invent new features. Use ONLY information from the conversation.

---

# Requirements

## 1. Use Full Context

* Analyze the entire conversation.
* Extract:

    * product logic
    * UX rules
    * state machines
    * data models
    * edge cases
    * localization rules
    * role/permission logic
    * deletion/restoration flows
    * sleep tracking logic

---

## 2. claude.md (AI Instructions)

This file must contain:

### Project rules

* architecture expectations
* coding constraints
* what NOT to do

### Business logic

* sleep state machine
* interruptions logic
* wake window logic
* routing logic
* deletion/restoration logic
* roles and permissions

### UX constraints

* minimal UI
* no overload
* behavior rules

### Localization rules

* RU + EN required
* no raw keys in UI
* gender-specific text

### Critical invariants

Examples:

```text
A child must always have at least one owner
Interruptions must not overlap
Active sleep must be visible in history
```

---

## 3. README.md (Developer Overview)

This file must contain:

### Project description

What the app does

### Key features

* sleep tracking
* interruptions
* wake windows
* family access
* analytics

### Core concepts

* Sleep session
* Interruption
* Wake window
* Child / User / Roles

### Tech stack

```text
React + TypeScript (TSX)
```

### How to run (generic)

### Important notes

* offline behavior
* localization
* data consistency

---

## 4. Style Requirements

* Clear structure
* Use headings
* Avoid long paragraphs
* Use bullet points
* Be concise but complete

---

## 5. Output Format

Return two separate sections:

```text
--- claude.md ---
<content>

--- README.md ---
<content>
```

---

## 6. Important

* Do NOT hallucinate missing logic
* Do NOT contradict previous decisions
* If something is unclear, make a reasonable assumption but keep it consistent
* Prefer explicit rules over vague descriptions

---

Generate both files.
