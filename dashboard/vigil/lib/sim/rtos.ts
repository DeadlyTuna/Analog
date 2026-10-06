/**
 * A small fixed-priority preemptive RTOS, simulated in virtual time (milliseconds).
 *
 *  - a 1 kHz SysTick releases periodic tasks
 *  - ISRs run at their event time and steal a few microseconds of CPU from whatever is running
 *  - the highest-priority ready job always owns the CPU; a new release preempts immediately
 *  - a job can block on I/O (UART DMA) and resume with a second burst
 *  - every job records release → start → end so response time, jitter and deadline misses are measured, not assumed
 */
import { Ring } from './ring'

/** Tie-break order for events that land on the same instant. */
export const ORD = { ADC: 0, TACHO: 1, WORLD: 2, TICK: 3, WAKE: 4, MISC: 5 } as const

interface Ev {
  t: number
  ord: number
  seq: number
  fn: () => void
}

class EventHeap {
  private a: Ev[] = []
  get size() {
    return this.a.length
  }
  peek(): Ev | undefined {
    return this.a[0]
  }
  private less(x: Ev, y: Ev) {
    return x.t < y.t || (x.t === y.t && (x.ord < y.ord || (x.ord === y.ord && x.seq < y.seq)))
  }
  push(e: Ev) {
    const a = this.a
    a.push(e)
    let i = a.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (!this.less(a[i], a[p])) break
      ;[a[i], a[p]] = [a[p], a[i]]
      i = p
    }
  }
  pop(): Ev {
    const a = this.a
    const top = a[0]
    const last = a.pop()!
    if (a.length) {
      a[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < a.length && this.less(a[l], a[m])) m = l
        if (r < a.length && this.less(a[r], a[m])) m = r
        if (m === i) break
        ;[a[i], a[m]] = [a[m], a[i]]
        i = m
      }
    }
    return top
  }
}

/** Gantt-chart segments (struct of arrays, ring buffer). */
export class SegLog {
  readonly t0: Float64Array
  readonly t1: Float64Array
  readonly lane: Uint8Array
  head = 0
  count = 0
  constructor(readonly cap: number) {
    this.t0 = new Float64Array(cap)
    this.t1 = new Float64Array(cap)
    this.lane = new Uint8Array(cap)
  }
  push(a: number, b: number, lane: number) {
    if (b - a < 1e-9) return
    if (this.count) {
      const last = (this.head - 1 + this.cap) % this.cap
      if (this.lane[last] === lane && Math.abs(this.t1[last] - a) < 1e-9) {
        this.t1[last] = b
        return
      }
    }
    this.t0[this.head] = a
    this.t1[this.head] = b
    this.lane[this.head] = lane
    this.head = (this.head + 1) % this.cap
    if (this.count < this.cap) this.count++
  }
  /** Iterate oldest → newest, skipping everything that ended before `fromT`. */
  forEach(fromT: number, cb: (t0: number, t1: number, lane: number) => void) {
    const start = (this.head - this.count + this.cap) % this.cap
    for (let i = 0; i < this.count; i++) {
      const k = (start + i) % this.cap
      if (this.t1[k] < fromT) continue
      cb(this.t0[k], this.t1[k], this.lane[k])
    }
  }
}

export type TaskState = 'RUNNING' | 'READY' | 'BLOCKED'

export interface Job {
  id: number
  task: Task
  release: number
  start: number
  remaining: number
  deadline: number
  blocked: boolean
  burst: number
  data?: unknown
}

export interface TaskDef {
  id: string
  name: string
  prio: number
  deadlineMs: number
  periodMs?: number
  offsetMs?: number
  stackWords: number
  /** Periodic tasks that return false are skipped at release time (e.g. the stress injector at 0 %). */
  enabled?(): boolean
  /** CPU time this job needs (ms) — called when the job is released. */
  wcet(job: Job): number
  /** Called the first time the job gets the CPU. */
  onStart?(job: Job): void
  /** Called when a CPU burst completes. Return `{blockMs, nextMs}` to wait on I/O and run a second burst. */
  run(job: Job): void | { blockMs: number; nextMs: number }
}

export interface TaskStats {
  jobs: number
  misses: number
  overruns: number
  dropped: number
  respLast: number
  respMin: number
  respMax: number
  respSum: number
  cpuMs: number
  startLatLast: number
  startLatMax: number
  lastEnd: number
  lastMissAt: number
}

export class Task {
  state: TaskState = 'BLOCKED'
  waitReason = ''
  pending: Job[] = []
  nextRelease: number
  preemptions = 0
  stackHigh = 0
  readonly resp = new Ring(160)
  readonly stats: TaskStats = {
    jobs: 0,
    misses: 0,
    overruns: 0,
    dropped: 0,
    respLast: 0,
    respMin: Infinity,
    respMax: 0,
    respSum: 0,
    cpuMs: 0,
    startLatLast: 0,
    startLatMax: 0,
    lastEnd: 0,
    lastMissAt: -1,
  }
  /** Utilisation over the last ~second, for the task table. */
  load = 0
  private loadAcc = 0
  constructor(
    readonly def: TaskDef,
    readonly index: number,
  ) {
    this.nextRelease = def.offsetMs ?? 0
  }
  addLoad(ms: number) {
    this.loadAcc += ms
  }
  rollLoad(windowMs: number) {
    this.load += (this.loadAcc / windowMs - this.load) * 0.4
    this.loadAcc = 0
  }
}

export interface IsrStat {
  name: string
  source: string
  nvic: number
  /** CPU cost per call at 84 MHz, µs */
  costUs: number
  rateHz: number
  count: number
  lastAt: number
  latencyUs: number
  maxLatencyUs: number
  busyMs: number
}

export const ISR_LANE = 15

export class Rtos {
  now = 0
  cpuT = 0
  tickCount = 0
  readonly tasks: Task[] = []
  readonly isrs = new Map<string, IsrStat>()
  readonly segs = new SegLog(7000)
  running: Job | null = null
  ctxSwitches = 0
  preemptions = 0
  busyMs = 0
  idleMs = 0
  isrMs = 0
  load = 0
  peakLoad = 0
  clockMHz = 48
  onTick: ((tick: number, now: number) => void) | null = null

  private byId = new Map<string, Task>()
  private heap = new EventHeap()
  private seq = 0
  private jobSeq = 0
  private winBusy = 0

  constructor(private jitter: () => number) {}

  get clockScale() {
    return 84 / this.clockMHz
  }

  addTask(def: TaskDef): Task {
    const t = new Task(def, this.tasks.length)
    this.tasks.push(t)
    this.byId.set(def.id, t)
    return t
  }

  task(id: string): Task {
    const t = this.byId.get(id)
    if (!t) throw new Error(`unknown task ${id}`)
    return t
  }

  registerIsr(name: string, source: string, nvic: number, costUs: number, rateHz: number) {
    this.isrs.set(name, {
      name,
      source,
      nvic,
      costUs,
      rateHz,
      count: 0,
      lastAt: -1,
      latencyUs: 0,
      maxLatencyUs: 0,
      busyMs: 0,
    })
  }

  at(t: number, ord: number, fn: () => void) {
    this.heap.push({ t, ord, seq: this.seq++, fn })
  }

  /** Begin ticking. */
  start(at = 0) {
    this.at(at + 1, ORD.TICK, this.onSysTick)
  }

  private onSysTick = () => {
    this.tickCount++
    this.isr('SysTick', false)
    for (const task of this.tasks) {
      const p = task.def.periodMs
      if (p && this.now + 1e-9 >= task.nextRelease) {
        task.nextRelease += p
        if (!task.def.enabled || task.def.enabled()) this.release(task, this.now)
      }
    }
    if (this.tickCount % 100 === 0) {
      const inst = this.winBusy / 100
      this.load += (inst - this.load) * 0.35
      if (inst > this.peakLoad) this.peakLoad = inst
      this.winBusy = 0
    }
    if (this.tickCount % 250 === 0) for (const t of this.tasks) t.rollLoad(250)
    this.onTick?.(this.tickCount, this.now)
    this.at(this.now + 1, ORD.TICK, this.onSysTick)
  }

  /** Run the CPU + event queue up to absolute time T. */
  advanceTo(T: number) {
    for (;;) {
      const ev = this.heap.peek()
      if (!ev || ev.t > T) break
      this.heap.pop()
      this.runCpu(ev.t)
      this.now = ev.t
      ev.fn()
    }
    this.runCpu(T)
    this.now = T
  }

  /** Make a job ready at time `at`. */
  release(task: Task, at: number, data?: unknown): Job {
    const job: Job = {
      id: ++this.jobSeq,
      task,
      release: at,
      start: -1,
      remaining: 0,
      deadline: at + task.def.deadlineMs,
      blocked: false,
      burst: 0,
      data,
    }
    job.remaining = task.def.wcet(job)
    if (task.pending.length > 0) task.stats.overruns++
    if (task.pending.length >= 8) {
      // bounded queue: drop the oldest job that has not started yet
      const idx = task.pending[0].start >= 0 ? 1 : 0
      task.pending.splice(idx, 1)
      task.stats.dropped++
    }
    task.pending.push(job)
    return job
  }

  /** Account for an interrupt that fires now. Steals CPU time from whatever is running. */
  isr(name: string, record = true) {
    const s = this.isrs.get(name)
    if (!s) return
    const cost = (s.costUs / 1000) * this.clockScale
    const start = Math.max(this.cpuT, this.now)
    const wait = (start - this.now) * 1000
    s.count++
    s.lastAt = this.now
    s.latencyUs = 0.55 + 12 / this.clockMHz + wait + this.jitter() * 0.5
    if (s.latencyUs > s.maxLatencyUs) s.maxLatencyUs = s.latencyUs
    s.busyMs += cost
    this.cpuT = start + cost
    this.isrMs += cost
    this.winBusy += cost
    if (record) this.segs.push(start, this.cpuT, ISR_LANE)
  }

  private pick(): Job | null {
    let best: Job | null = null
    let bestPrio = -1
    for (const t of this.tasks) {
      const j = t.pending[0]
      if (!j || j.blocked) continue
      if (t.def.prio > bestPrio) {
        best = j
        bestPrio = t.def.prio
      }
    }
    return best
  }

  private runCpu(T: number) {
    while (this.cpuT < T - 1e-12) {
      const job = this.pick()
      if (!job) {
        this.idleMs += T - this.cpuT
        this.cpuT = T
        this.running = null
        break
      }
      const task = job.task
      if (this.running !== job) {
        if (this.running && this.running.remaining > 1e-9 && !this.running.blocked) {
          this.preemptions++
          this.running.task.preemptions++
        }
        this.ctxSwitches++
        this.running = job
      }
      if (job.start < 0) {
        job.start = this.cpuT
        const lat = job.start - job.release
        task.stats.startLatLast = lat
        if (lat > task.stats.startLatMax) task.stats.startLatMax = lat
        task.def.onStart?.(job)
      }
      const dur = Math.min(job.remaining, T - this.cpuT)
      const t0 = this.cpuT
      this.cpuT += dur
      job.remaining -= dur
      task.stats.cpuMs += dur
      task.addLoad(dur)
      this.busyMs += dur
      this.winBusy += dur
      this.segs.push(t0, this.cpuT, task.index)
      if (job.remaining <= 1e-9) this.finish(job)
    }
  }

  private finish(job: Job) {
    const task = job.task
    const res = task.def.run(job)
    if (res && typeof res === 'object') {
      job.blocked = true
      job.remaining = res.nextMs
      job.burst++
      this.running = null
      this.at(this.cpuT + res.blockMs, ORD.WAKE, () => {
        job.blocked = false
      })
      return
    }
    task.pending.shift()
    const end = this.cpuT
    const resp = end - job.release
    const s = task.stats
    s.jobs++
    s.respLast = resp
    s.respSum += resp
    if (resp < s.respMin) s.respMin = resp
    if (resp > s.respMax) s.respMax = resp
    s.lastEnd = end
    task.resp.push(resp)
    if (end > job.deadline + 1e-9) {
      s.misses++
      s.lastMissAt = end
      this.onDeadlineMiss?.(task, resp, job)
    }
    if (this.running === job) this.running = null
  }

  onDeadlineMiss: ((task: Task, resp: number, job: Job) => void) | null = null

  stateOf(task: Task): TaskState {
    if (this.running && this.running.task === task) return 'RUNNING'
    const j = task.pending[0]
    if (!j) return 'BLOCKED'
    return j.blocked ? 'BLOCKED' : 'READY'
  }
}
