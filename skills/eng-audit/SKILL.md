---
name: eng-audit
description: >
  Audit recent code changes against nine engineering principles, then report violations grouped by
  principle with file:line and severity. Run at the end of a major development phase, before a PR, or
  on demand via /eng-audit. Verifies findings against the code; never audits from memory.
---

# Engineering-principles audit

Audit the current phase's changes against the nine principles below. Be honest and specific: a vague
or padded audit is worse than none. Verify every finding against the code (grep, read the file,
confirm it is actually dead/duplicated) before reporting it. No speculative findings.

## The nine principles

One philosophy: write as little as possible, keep impurity and coupling at the edges and visible, and
never astonish the next reader.

1. **Write less code.** Not writing it is the win. Code that is easy to *delete* without consequence
   beats code that is easy to change; easy-to-change beats code that must be rewritten when
   requirements shift. When you must add, reach first for a self-contained module with a narrow
   interface. Deletability is the metric.
2. **Keep coupling visible: think connascence.** Judge coupling through connascence
   (name → type → meaning → position → algorithm → timing) and prefer weaker, more local forms.
   Naming is design; what you leave out matters as much as what you write.
   <https://connascence.io>
3. **Prefer functional over imperative.** Default to pure functions and referential transparency;
   avoid unnecessary mutation. Prefer declarative transforms (`map`/`filter`/`reduce`) over
   hand-rolled loops and in-place mutation. Make state change the deliberate exception.
4. **Functional core, imperative shell.** Push side effects, I/O, and edge cases out to the boundary
   and make them explicit in the interface; keep the core pure and decision-rich.
   <https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell>
5. **Least astonishment, then delight.** Behavior should match what a reasonable reader or user
   already expects; surprise is a defect. Then go past "not surprising" and actively delight.
   <https://en.wikipedia.org/wiki/Principle_of_least_astonishment>
6. **Methods tell a story.** Structure a method top to bottom: collect input, do the work
   confidently (no defensive mid-flow checks), deliver output, handle failure at the edges (guards up
   top, rescue at the bottom). Coerce inputs once rather than sprinkling conditionals through the body.
7. **Comments explain why, never what.** Write a comment only when it adds the why: rationale,
   constraint, gotcha, or why an ugly construct is intentional. Delete comments that restate the code.
8. **Hold tests to the highest standard.** Tests get written and, more importantly, maintained. A
   flaky, misleading, or passes-for-the-wrong-reason test is worse than no test. Correctness first,
   then efficiency.
9. **No unspoken side effects: think downstream.** Before a non-trivial change, name who and what it
   touches beyond the diff (other services, billing, data integrity, CI time, on-call). Surface the
   blast radius; do not ship effects nobody signed off on.

## Scope

Audit what changed this phase, plus anything that change touches. Default to the working-tree +
staged diff and the commits since the phase began:

```sh
git diff --stat HEAD            # uncommitted
git log --oneline -15           # recent commits (find the phase boundary)
git diff <phase-start>..HEAD --stat
```

If it is not a git repo, audit the files you created or edited this phase.

## How to audit

Work through the changes looking for concrete violations of each principle. Verify each one against
the code before reporting it. For each finding capture: which principle, a one-line description,
`file:line`, severity, and a recommended fix.

Severity:
- ⚠ correctness / astonishment (behaves wrong, or a documented thing is a no-op)
- ▲ structural (duplication, coupling, dead code, leaked side effect)
- ▽ minor / efficiency / polish

Also call out what is clean: principles the change upholds well, so the report is not only negative.

## Output

Lead with the headline (how many findings, worst severity). Then list findings worst-first, grouped
or tagged by principle, each with `file:line` and a fix. Keep it scannable.

End by asking which to fix. Trivial, unambiguous fixes (a dead import, obvious duplication) you may
state you will just do; anything that is a judgment call (architecture, deleting a feature, loosening
coupling) ask first, and do not apply unilaterally. Never auto-fix on a read-only `--check` intent.

## When to run (the trigger)

A phase boundary is: a feature or milestone shipped, a PR readied for review, a sizable refactor
finished, or just before switching to the next substantial chunk of work. NOT: a one-line tweak, a
doc edit, or a conversational turn.

## Lineage

The principles draw on connascence, functional-core/imperative-shell, the principle of least
astonishment, and Avdi Grimm's *Confident Ruby* (principle 6). eng-audit is also one of the four
disciplines fused into [flint](https://github.com/jah2488/flint), where the same principles run
continuously rather than only at phase boundaries.
