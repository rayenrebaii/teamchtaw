import { INestApplicationContext } from "@nestjs/common";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { Server, ServerOptions } from "socket.io";
import type { IncomingMessage } from "node:http";
export class RestrictedSocketAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private origins: string[],
  ) {
    super(app);
  }
  override createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.origins, credentials: false },
      maxHttpBufferSize: 16384,
      connectTimeout: 10000,
      allowRequest: (
        request: IncomingMessage,
        callback: (error: string | null | undefined, success: boolean) => void,
      ) => callback(null, !request.headers.origin || this.origins.includes(request.headers.origin)),
    }) as Server;
  }
}
