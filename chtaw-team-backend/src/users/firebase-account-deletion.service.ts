import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { FirebaseIdentity } from "../auth/firebase.service";
import { PrismaService } from "../prisma/prisma.module";

@Injectable()
export class FirebaseAccountDeletionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FirebaseAccountDeletionService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private db: PrismaService, private firebase: FirebaseIdentity) {}
  onModuleInit() {
    if (!this.firebase.enabled) return;
    void this.drain();
    this.timer = setInterval(() => void this.drain(), 30000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async process(firebaseUid: string) {
    if (!this.firebase.enabled) return;
    try {
      const now = new Date();
      // Atomic lease: concurrent requests/instances cannot normally process the same UID.
      // Expiry also recovers a worker that crashes before completing the SDK call.
      const claim = await this.db.firebaseAccountDeletion.updateMany({
        where: { firebaseUid, completedAt: null, nextAttemptAt: { lte: now } },
        data: { attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + 5 * 60000) },
      });
      if (!claim.count) return;
      // Never delete an identity that is still attached to an active business account.
      if (await this.db.user.count({ where: { firebaseUid, disabledAt: null } })) {
        this.logger.warn("Firebase account cleanup deferred: active account still linked.");
        return;
      }
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          this.firebase.deleteAccount(firebaseUid),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => reject(new Error("Firebase deletion timeout")), 15000);
            timeout.unref();
          }),
        ]);
      } finally { if (timeout) clearTimeout(timeout); }
      await this.db.firebaseAccountDeletion.updateMany({ where: { firebaseUid, completedAt: null }, data: { completedAt: new Date() } });
    } catch {
      // Keep the durable intent after every failure, including a failure to mark completion.
      // Do not log SDK errors, identity data or credentials.
      this.logger.warn("Firebase account deletion deferred; durable retry retained.");
    }
  }

  async drain() {
    if (this.running || !this.firebase.enabled) return;
    this.running = true;
    try {
      const jobs = await this.db.firebaseAccountDeletion.findMany({
        where: { completedAt: null, nextAttemptAt: { lte: new Date() } },
        select: { firebaseUid: true }, orderBy: [{ nextAttemptAt: "asc" }, { firebaseUid: "asc" }], take: 20,
      });
      for (const job of jobs) await this.process(job.firebaseUid);
    } catch { this.logger.warn("Firebase deletion queue temporarily unavailable."); }
    finally { this.running = false; }
  }
}
