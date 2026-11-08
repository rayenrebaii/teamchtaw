import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import webpush from "web-push";
@Injectable()
export class PushTransport {
  constructor(private config: ConfigService) {}
  get enabled() {
    return this.config.get<boolean>("PUSH_ENABLED", false);
  }
  get publicKey() {
    return this.enabled ? this.config.get<string>("VAPID_PUBLIC_KEY", "") : "";
  }
  async send(
    subscription: { endpoint: string; p256dh: string; auth: string },
    payload: object,
    ttl: number,
  ) {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      {
        vapidDetails: {
          subject: this.config.getOrThrow<string>("VAPID_SUBJECT"),
          publicKey: this.config.getOrThrow<string>("VAPID_PUBLIC_KEY"),
          privateKey: this.config.getOrThrow<string>("VAPID_PRIVATE_KEY"),
        },
        TTL: Math.max(1, Math.min(3600, ttl)),
        timeout: 10000,
      },
    );
  }
}
