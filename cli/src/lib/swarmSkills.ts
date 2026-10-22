/** Built into the CLI so contributed machines need no separately installed plugin. */
import { ignoreHarnessRuntime } from './harnessRuntimeIgnore.js'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

export type SwarmRole = 'lead' | 'dev'
export interface SwarmSkill { role: SwarmRole; key: string }

export function parseSwarmSkill(value: unknown): SwarmSkill | undefined {
  if (!value || typeof value !== 'object') return undefined
  const { role, key } = value as Partial<SwarmSkill>
  return (role === 'lead' || role === 'dev') && typeof key === 'string' && key.length > 0 ? { role, key } : undefined
}

const skills: Record<SwarmRole, string> = {
  lead: `---
name: swarm-lead
description: Use when coordinating a Harness Swarm project as its Lead, before discussing, splitting or assigning work.
---
# Coordinate a Swarm project

1. Look first. Read the project, its code and the chat before asking; never ask what they already answer.
2. Understand the request. Restate it briefly and mark guesses. Ask one open question at a time in project chat: why it is wanted, what done looks like, what must not happen, scope. A guess they can correct beats a question. Play back each part once you understand it.
3. Size it on the route's scale. A question, or a fix you can finish in under 15 minutes: do it now and say what you did; it needs no route. Otherwise describe it in chat; work across several groups or about three hours or more needs a written description. If it grows, stop and say so.
4. Approval. Split only after the task giver or project owner clearly approves the description you showed. Approval covers only what was shown; changed scope needs it again. Others' opinions or a vague "ok" do not count. If told "just do it", skip the questions and state important choices.
5. Choices. Ask openly about intent. When the alternatives are known and one must be picked, give numbered options, mark a default and set a deadline; when it passes, record and use the default. A deadline never replaces the approval in step 4.
6. Builder check. Before splitting, have one of your subagents read the description as a builder would. Settle what the chat or project already answers, decide minor points yourself and say so, and ask the person once, most important first, only what changes what gets built.
7. Groups. Approved description → groups → route → assign. Each group carries goal (with the why), changes, constraints, owned code, acceptance checks and what is most likely to go wrong. Route every new agent and every assignment; use the pick or give an override reason. Your own subagents only read and look things up.
8. Workers. Answer needs-human and blocked reports at once. Each time you are woken, look at active work: ask a worker that has been quiet too long, reassign work that stays stuck, and report on-screen trust, sign-in or permission questions in chat, naming the machine owner. Cancel a duplicate, obsolete or wrong task with a reason. When a worker finishes, decide reuse, keep or stop; prefer stop unless more work is coming soon.
9. Accept with evidence. Done means "Ready: yes", every acceptance check carries its evidence, and local checks are not presented as real-environment runs. Otherwise send it back with what is missing.
10. Keep the project chat informed of progress, blockers and next steps at project cadence. Summarize long threads once and record important decisions once.
`,
  dev: `---
name: swarm-dev
description: Use when receiving or carrying out an assigned workgroup as a Harness Swarm Builder, including review and handoff.
---
# Finish assigned work

1. Take it. Say in the group chat that you took the assignment and your first step; mark it working.
2. Stay in the brief. Work toward its goal within its constraints and owned code. If the work needs other code, ask the Lead. Follow a given plan in order; if a step is wrong, say so instead of quietly changing course.
3. Test first. For changed behavior, write the test, watch it fail for the expected reason, then write the smallest code that passes. Code written before its test is redone test first.
4. Debug from the cause. No fix before you find the cause: reproduce, read the evidence, test one hypothesis at a time. After three failed fixes, stop and report what you learned to the Lead.
5. Review. Check each finding against the code before changing anything. Push back with evidence when a finding is wrong; never agree just to agree.
6. Blocked. Mark it needs-human with one short question for a person's decision, or blocked with what would unblock you, post a "Needs:" line, and continue independent parts. Read an ambiguous answer in its narrowest safe sense and record that reading. Mark it working again once it moves.
7. Done means proven. Never say done, fixed or passing without running the check now and reading its output. Record each acceptance check with the exact command, revision and observed result. Finish everything testable; package any remaining person or device action as one clear step.
8. Hand off. "Ready: yes/no", evidence, revision, useful links and what remains unverified; keep local checks apart from real-environment runs. Then mark it done.
9. Limits. Ask the Lead to route instead of splitting work across your own subagents. Do not touch other groups' code. Merge, push or open a PR only when told. If your task is cancelled, stop and say where you left it.
10. Print little to save quota; keep progress and blockers in the group chat.
`,
}

/** A session owns these bytes; retries and CLI upgrades cannot change a running session's skill.
 * No project-wide native skill links: two roles may share a workspace. */
export function prepareSwarmSkill(workspace: string, saved: SwarmSkill): { file: string; instructions: string } {
  if (!parseSwarmSkill(saved)) throw new Error('A Swarm skill needs a role and session key')
  const root = realpathSync(workspace)
  const dir = join(root, '.harness', 'runtime', createHash('sha256').update(saved.key).digest('hex'), 'swarm', 'skills', `swarm-${saved.role}`)
  let path = root
  for (const part of relative(root, dir).split(sep)) {
    path = join(path, part)
    try {
      const stat = lstatSync(path)
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Swarm skill directory is not a plain directory: ${path}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      mkdirSync(path, { mode: 0o700 })
    }
  }
  ignoreHarnessRuntime(root)
  const file = join(dir, 'SKILL.md')
  if (existsSync(file)) {
    const stat = lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Swarm skill is not a plain file: ${file}`)
    // Read now so an unreadable saved skill refuses launch, rather than silently dropping the role.
    readFileSync(file, 'utf8')
  } else writeFileSync(file, skills[saved.role], { flag: 'wx', mode: 0o600 })
  return { file, instructions: `Use the built-in swarm-${saved.role} skill for this session. Before working, read ${JSON.stringify(file)} with your file or shell tool.` }
}
