import type { Guide } from "./guide.js";
import type { Session } from "./session.js";

/** Wall clock, injected so state machines and tests stay deterministic. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export interface GuideRepository {
  get(id: string): Promise<Guide | undefined>;
  put(guide: Guide): Promise<void>;
  list(): Promise<Guide[]>;
}

export interface SessionRepository {
  get(id: string): Promise<Session | undefined>;
  put(session: Session): Promise<void>;
}

export interface JobQueue {
  enqueue(name: string, payload: unknown): Promise<string>;
}

/** In-memory repositories for tests and single-process development. */
export class InMemoryGuideRepository implements GuideRepository {
  private readonly guides = new Map<string, Guide>();

  async get(id: string): Promise<Guide | undefined> {
    return this.guides.get(id);
  }

  async put(guide: Guide): Promise<void> {
    this.guides.set(guide.id, guide);
  }

  async list(): Promise<Guide[]> {
    return [...this.guides.values()];
  }
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, Session>();

  async get(id: string): Promise<Session | undefined> {
    return this.sessions.get(id);
  }

  async put(session: Session): Promise<void> {
    this.sessions.set(session.id, session);
  }
}
