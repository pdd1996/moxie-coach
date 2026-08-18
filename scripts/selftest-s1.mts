import { seedProblems } from '../src/data/seed.ts'
import metaJson from '../src/data/problems.json'

const meta = metaJson as unknown as any[]
const userById: Record<number, any> = {}
for (const p of seedProblems) userById[p.id] = p
const merged = meta.map((m) => ({
  ...m, ...(userById[m.id] || {}),
  status: userById[m.id]?.status || 'new',
  history: userById[m.id]?.history || [],
  testCases: userById[m.id]?.testCases || [],
}))
console.log('meta:', meta.length, '| seed user:', seedProblems.length, '| merged:', merged.length)

const today = '2026-08-18'
const diff = (a: string, b: string) =>
  Math.round((+new Date(a + 'T00:00:00') - +new Date(b + 'T00:00:00')) / 86400000)
const REVIEW = new Set(['learned', 'pending-review', 'self-solved', 'reviewing'])
const rq = merged
  .filter((p) => p.nextReviewAt && p.nextReviewAt <= today && REVIEW.has(p.status))
  .sort((a, b) => diff(today, b.nextReviewAt) - diff(today, a.nextReviewAt))
console.log('reviewQueue:', rq.map((p) => `${p.id}[${p.status},nr=${p.nextReviewAt},od=${Math.max(0, diff(today, p.nextReviewAt))}d]`).join(' '))

for (const s of [1, 2, 3, 4]) {
  const all = merged.filter((p) => p.stage === s && !p.optional)
  const done = all.filter((p) => ['self-solved', 'learned', 'reviewing', 'mastered'].includes(p.status)).length
  console.log(`stage${s}:`, `${done}/${all.length}`)
}

let sug: any = null
for (const s of [1, 2, 3, 4]) {
  const f = merged.find((p) => p.stage === s && !p.optional && p.status === 'new')
  if (f) { sug = f; break }
}
console.log('suggested:', sug ? `${sug.id} ${sug.title} stage${sug.stage}` : 'none')
console.log('optional:', merged.filter((p) => p.optional).map((p) => `${p.id} ${p.title}`).join(' '))