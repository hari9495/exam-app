import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Server, ServerOptions } from 'socket.io';

// D1: socket.io across several API servers. Each server publishes room messages through Redis and receives the others'
// (the official @socket.io/redis-adapter), so a requester on one server and the agent on another share the chat room.
export class ChatIoAdapter extends IoAdapter {
  private readonly clients: Redis[] = [];

  constructor(app: INestApplicationContext, private readonly url = process.env.REDIS_URL ?? 'redis://localhost:6379') {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    const pub = new Redis(this.url, { maxRetriesPerRequest: null });
    const sub = pub.duplicate();
    for (const c of [pub, sub]) c.on('error', (e) => new Logger('ChatIoAdapter').warn(`Redis: ${e.message}`));
    this.clients.push(pub, sub);
    server.adapter(createAdapter(pub, sub));
    return server;
  }

  async close(server: Server) {
    await super.close(server);
    this.clients.splice(0).forEach((c) => c.disconnect());
  }
}
