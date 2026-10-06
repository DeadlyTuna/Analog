/** Fixed-size float ring buffer. Index 0 is the oldest sample, count-1 the newest. */
export class Ring {
  readonly buf: Float32Array
  head = 0
  count = 0
  /** Monotonic number of samples ever pushed — handy for cheap change detection. */
  total = 0

  constructor(readonly capacity: number) {
    this.buf = new Float32Array(capacity)
  }

  push(v: number) {
    this.buf[this.head] = v
    this.head = (this.head + 1) % this.capacity
    if (this.count < this.capacity) this.count++
    this.total++
  }

  at(i: number): number {
    const start = (this.head - this.count + this.capacity) % this.capacity
    return this.buf[(start + i) % this.capacity]
  }

  last(): number {
    return this.count ? this.buf[(this.head - 1 + this.capacity) % this.capacity] : 0
  }

  /** Copy the newest `n` samples (oldest first) into `out`. Returns how many were copied. */
  readLast(n: number, out: ArrayLike<number> & { [i: number]: number }): number {
    const m = Math.min(n, this.count)
    let idx = (this.head - m + this.capacity) % this.capacity
    for (let i = 0; i < m; i++) {
      out[i] = this.buf[idx]
      idx++
      if (idx === this.capacity) idx = 0
    }
    return m
  }

  clear() {
    this.buf.fill(0)
    this.head = 0
    this.count = 0
  }
}
