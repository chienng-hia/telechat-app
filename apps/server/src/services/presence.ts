export class PresenceTracker {
  private readonly socketsByUser = new Map<string, Set<string>>();

  addSocket(userId: string, socketId: string): boolean {
    let set = this.socketsByUser.get(userId);
    const wasOffline = !set || set.size === 0;
    if (!set) {
      set = new Set();
      this.socketsByUser.set(userId, set);
    }
    set.add(socketId);
    return wasOffline;
  }

  removeSocket(userId: string, socketId: string): boolean {
    const set = this.socketsByUser.get(userId);
    if (!set) return false;
    set.delete(socketId);
    if (set.size === 0) {
      this.socketsByUser.delete(userId);
      return true;
    }
    return false;
  }

  isOnline(userId: string): boolean {
    const set = this.socketsByUser.get(userId);
    return Boolean(set && set.size > 0);
  }
}
