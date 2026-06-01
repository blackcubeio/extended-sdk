/**
 * Coalescing + throttling des messages subscribe/unsubscribe (pattern commun aux SDK Blackcube,
 * porté par copie). Extended souscrit **par path** (la connexion EST l'abonnement), donc ce batcher
 * sert surtout à throttler d'éventuelles frames de contrôle ; il est généralisé via les fabriques
 * `buildSub`/`buildUnsub`. API publique **identique** aux autres SDK.
 */
export class SubscriptionBatcher {
  private readonly pendingSub = new Set<string>();
  private readonly pendingUnsub = new Set<string>();
  private readonly outbox: string[] = [];
  private flushScheduled = false;
  private draining = false;
  private open = false;

  constructor(
    private readonly rawSend: (frame: string) => void,
    private readonly buildSub: (names: string[]) => unknown,
    private readonly buildUnsub: (names: string[]) => unknown,
    private readonly chunk = 1,
    private readonly intervalMs = 100,
  ) {}

  public subscribe(name: string): void {
    this.pendingUnsub.delete(name);
    this.pendingSub.add(name);
    this.schedule();
  }

  public unsubscribe(name: string): void {
    this.pendingSub.delete(name);
    this.pendingUnsub.add(name);
    this.schedule();
  }

  public resubscribe(names: Iterable<string>): void {
    for (const name of names) {
      this.pendingUnsub.delete(name);
      this.pendingSub.add(name);
    }
    this.schedule();
  }

  public setOpen(isOpen: boolean): void {
    this.open = isOpen;
    if (isOpen === true) {
      this.pump();
    }
  }

  public reset(): void {
    this.outbox.length = 0;
    this.draining = false;
  }

  private schedule(): void {
    if (this.flushScheduled === true) {
      return;
    }
    this.flushScheduled = true;
    queueMicrotask(() => {
      this.flushScheduled = false;
      this.flush();
    });
  }

  private flush(): void {
    this.enqueue(this.buildUnsub, this.pendingUnsub);
    this.pendingUnsub.clear();
    this.enqueue(this.buildSub, this.pendingSub);
    this.pendingSub.clear();
  }

  private enqueue(build: (names: string[]) => unknown, names: Set<string>): void {
    const all = [...names];
    for (let i = 0; i < all.length; i += this.chunk) {
      const slice = all.slice(i, i + this.chunk);
      const frame = build(slice);
      if (frame !== undefined && frame !== null) {
        this.outbox.push(JSON.stringify(frame));
      }
    }
    this.pump();
  }

  private pump(): void {
    if (this.draining === true || this.open === false || this.outbox.length === 0) {
      return;
    }
    this.draining = true;
    const frame = this.outbox.shift() as string;
    this.rawSend(frame);
    setTimeout(() => {
      this.draining = false;
      this.pump();
    }, this.intervalMs);
  }
}
