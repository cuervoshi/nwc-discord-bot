type ReleaseFunction = () => void;

export class SimpleLock {
  private locked: boolean;
  private queue: Array<() => void>;

  constructor() {
    this.locked = false;
    this.queue = [];
  }

  acquire(): Promise<ReleaseFunction> {
    return new Promise((resolve) => {
      let released = false;

      const timeout = setTimeout(() => {
        if (!released) {
          released = true;
          this.release();
        }
      }, 5000);

      const release: ReleaseFunction = () => {
        if (!released) {
          clearTimeout(timeout);
          released = true;
          this.release();
        }
      };

      if (!this.locked) {
        this.locked = true;
        resolve(release);
      } else {
        this.queue.push(() => {
          clearTimeout(timeout);
          released = true;
          resolve(release);
        });
      }
    });
  }

  private release(): void {
    if (this.queue.length > 0) {
      const nextResolve = this.queue.shift()!;
      nextResolve();
    } else {
      this.locked = false;
    }
  }
}
