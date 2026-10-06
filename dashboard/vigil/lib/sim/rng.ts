/** Small deterministic PRNG (mulberry32) + Gaussian helper, so every run of the simulator is repeatable. */
export class Rng {
  private s: number
  private spare = 0
  private hasSpare = false

  constructor(seed = 1) {
    this.s = seed >>> 0
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(a: number, b: number): number {
    return a + (b - a) * this.next()
  }

  /** Standard normal (Box–Muller, cached pair). */
  gauss(): number {
    if (this.hasSpare) {
      this.hasSpare = false
      return this.spare
    }
    let u = 0
    while (u === 0) u = this.next()
    const v = this.next()
    const m = Math.sqrt(-2 * Math.log(u))
    this.spare = m * Math.sin(2 * Math.PI * v)
    this.hasSpare = true
    return m * Math.cos(2 * Math.PI * v)
  }
}
