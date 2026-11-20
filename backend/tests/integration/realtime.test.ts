import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { Redis } from 'ioredis';
import { SignJWT } from 'jose';
import { io, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { pool } from '../../src/infrastructure/database/pool.js';
import { createEventBus, type DomainEvent } from '../../src/infrastructure/events/event-bus.js';
import { eventBus } from '../../src/infrastructure/events/index.js';
import { redis, redisSubscriber } from '../../src/infrastructure/redis/redis.js';
import { attachRealtime } from '../../src/infrastructure/realtime/realtime.js';
import { createPresence } from '../../src/infrastructure/realtime/presence.js';
import { addMember, as, closeConnections, createProject, createWorkspace, migrateTestDatabase, registerUser, resetDatabase, type TestUser } from './helpers.js';

const clients: Socket[] = [];
const extra: Redis[] = [];
const gateways: ReturnType<typeof attachRealtime>[] = [];
const ports: number[] = [];
let remoteSubscriber: Redis;
let remoteBus: ReturnType<typeof createEventBus>;
function newRedis() { const c = new Redis(config.REDIS_URL); extra.push(c); return c; }
const delay = (ms=120) => new Promise((resolve) => setTimeout(resolve,ms));
function event<T = unknown>(socket: Socket, name: string): Promise<T> {
  return new Promise((resolve,reject) => {
    const timer=setTimeout(() => { socket.off(name,receive); reject(new Error(`Timed out waiting for ${name}`)); },4000);
    function receive(value: T) { clearTimeout(timer); resolve(value); }
    socket.once(name,receive);
  });
}
async function connect(user: TestUser, index=0, token=user.accessToken) {
  const socket=io(`http://127.0.0.1:${ports[index]}`, { path:'/api/socket.io', transports:['websocket'], auth:{token}, autoConnect:false, reconnection:false });
  clients.push(socket);
  const connected=event(socket,'connect'); socket.connect(); await connected; return socket;
}
function ack(socket: Socket, name: string, value: unknown): Promise<{ok:boolean;data?:any;error?:{code:string}}> {
  return socket.timeout(3000).emitWithAck(name,value);
}
beforeAll(async () => {
  await migrateTestDatabase();
  await eventBus.start();
  const pub=newRedis(), sub=newRedis();
  remoteSubscriber=sub;
  remoteBus=createEventBus({ publisher:pub, subscriber:sub, channel:config.EVENTS_CHANNEL, instanceId:()=> 'test-api-b' });
  await remoteBus.start();
  for (let n=0;n<2;n++) {
    const server: Server=createServer(createApp());
    gateways.push(attachRealtime(server,n===0 ? { bus:eventBus, client:redis, subscriber:redisSubscriber } : { bus:remoteBus, client:pub, subscriber:sub }));
    await new Promise<void>((resolve)=>server.listen(0,'127.0.0.1',resolve));
    ports.push((server.address() as {port:number}).port);
  }
});
beforeEach(resetDatabase);
afterEach(async()=>{ vi.restoreAllMocks(); for(const c of clients.splice(0)) c.disconnect(); await delay(50); });
afterAll(async()=>{
  for(const g of gateways) await g.close();
  await Promise.all([eventBus.stop(),remoteBus?.stop()]);
  await Promise.all(extra.map(c=>c.quit()));
  await closeConnections();
});
async function team() {
  const owner=await registerUser(), member=await registerUser(), outsider=await registerUser();
  const ws=await createWorkspace(owner); await addMember(owner,ws.id,member);
  return {owner,member,outsider,ws};
}

describe('authenticated real-time delivery across API servers',()=>{
  it('rejects missing/invalid/expired tokens and untrusted browser origins',async()=>{
    for(const token of ['', 'invalid']) {
      const socket=io(`http://127.0.0.1:${ports[0]}`,{ path:'/api/socket.io', transports:['websocket'],auth:{token},autoConnect:false,reconnection:false }); clients.push(socket);
      const failed=event(socket,'connect_error'); socket.connect(); expect(await failed).toBeInstanceOf(Error);
    }
    const user=await registerUser();
    const expired=await new SignJWT({email:user.user.email}).setProtectedHeader({alg:'HS256'}).setSubject(user.user.id).setIssuer(config.JWT_ISSUER).setAudience('syncspace-web').setExpirationTime('0s').sign(new TextEncoder().encode(config.JWT_ACCESS_SECRET));
    const socket=io(`http://127.0.0.1:${ports[0]}`,{path:'/api/socket.io',transports:['websocket'],auth:{token:expired},autoConnect:false,reconnection:false}); clients.push(socket);
    const failed=event<Error & {data:{code:string}}>(socket,'connect_error');socket.connect();expect((await failed).data.code).toBe('TOKEN_EXPIRED');
    const origin=io(`http://127.0.0.1:${ports[0]}`,{path:'/api/socket.io',transports:['websocket'],auth:{token:user.accessToken},extraHeaders:{Origin:'https://untrusted.example'},autoConnect:false,reconnection:false});clients.push(origin);
    const rejected=event(origin,'connect_error');origin.connect();await rejected;
  });
  it('blocks outsider joins and chat; validates payloads',async()=>{
    const {outsider,ws}=await team();const socket=await connect(outsider);
    expect((await ack(socket,'workspace:join',{workspaceId:ws.id})).error?.code).toBe('NOT_FOUND');
    expect((await ack(socket,'workspace:join',{workspaceId:'bad'})).error?.code).toBe('VALIDATION_ERROR');
    expect((await ack(socket,'chat:send',{workspaceId:ws.id,body:'forbidden',clientId:randomUUID()})).error?.code).toBe('NOT_FOUND');
    await as(outsider).get(`/api/chat/${ws.id}/messages`).expect(404);
    await as(outsider).get(`/api/chat/${ws.id}/presence`).expect(404);
  });
  it('delivers a committed task change and duplicate publication exactly once to each server',async()=>{
    const {owner,member,ws}=await team();const project=await createProject(owner,ws.id);
    const a=await connect(owner), b=await connect(member,1);
    await ack(a,'workspace:join',{workspaceId:ws.id});await ack(b,'workspace:join',{workspaceId:ws.id});
    const receivedA:DomainEvent[]=[], receivedB:DomainEvent[]=[];
    a.on('workspace:event',(e)=>receivedA.push(e));b.on('workspace:event',(e)=>receivedB.push(e));
    const delivered=event<DomainEvent>(b,'workspace:event');
    const created=await as(owner).post(`/api/projects/${project.id}/tasks`,{title:'Live'}).expect(201);
    const signal=await delivered;expect(signal.taskId).toBe(created.body.task.id);
    await redis.publish(config.EVENTS_CHANNEL,JSON.stringify(signal));await delay();
    expect(receivedA.filter(e=>e.id===signal.id)).toHaveLength(1);expect(receivedB.filter(e=>e.id===signal.id)).toHaveLength(1);
    await redis.publish(config.EVENTS_CHANNEL,JSON.stringify({id:randomUUID(),type:'task.updated'}));await delay();
    expect(receivedB).toHaveLength(1); // malformed envelope ignored
  });
  it('persists chat before delivery, retries idempotently and rejects ID reuse with different content',async()=>{
    const {owner,member,ws}=await team();const a=await connect(owner),b=await connect(member,1);
    await ack(b,'workspace:join',{workspaceId:ws.id});
    const received:DomainEvent[]=[];b.on('workspace:event',(e)=>received.push(e));
    const delivered=event<DomainEvent>(b,'workspace:event');
    const input={workspaceId:ws.id,body:'Hello from A',clientId:randomUUID()};
    const first=await ack(a,'chat:send',input);expect(first.ok).toBe(true);expect((await delivered).type).toBe('chat.message');
    const stored=await as(member).get(`/api/chat/${ws.id}/messages`).expect(200);expect(stored.body.messages[0].body).toBe(input.body);
    const duplicate=await ack(a,'chat:send',input);expect(duplicate.data.id).toBe(first.data.id);
    expect((await ack(a,'chat:send',{...input,body:'different'})).error?.code).toBe('CLIENT_ID_REUSED');
    await delay();expect(received.filter(e=>e.type==='chat.message')).toHaveLength(1);
  });
  it('emits nothing when the database write fails',async()=>{
    const {owner,member,ws}=await team();const b=await connect(member,1);await ack(b,'workspace:join',{workspaceId:ws.id});
    const received:DomainEvent[]=[];b.on('workspace:event',(e)=>received.push(e));
    vi.spyOn(pool,'connect').mockRejectedValueOnce(new Error('simulated database outage'));
    await as(owner).post(`/api/chat/${ws.id}/messages`,{body:'Must not broadcast',clientId:randomUUID()}).expect(500);
    await delay();expect(received).toEqual([]);
    expect((await as(owner).get(`/api/chat/${ws.id}/messages`)).body.messages).toEqual([]);
  });
  it('evicts removed members on both servers and prevents future broadcasts/sends',async()=>{
    const {owner,member,ws}=await team();const a=await connect(member),b=await connect(member,1);
    await ack(a,'workspace:join',{workspaceId:ws.id});await ack(b,'workspace:join',{workspaceId:ws.id});
    const revokedA=event(a,'workspace:revoked'),revokedB=event(b,'workspace:revoked');
    await as(owner).delete(`/api/workspaces/${ws.id}/members/${member.user.id}`).expect(204);await Promise.all([revokedA,revokedB]);
    const signals:unknown[]=[];b.on('workspace:event',e=>signals.push(e));
    await as(owner).post(`/api/chat/${ws.id}/messages`,{body:'Private after removal',clientId:randomUUID()}).expect(201);await delay();expect(signals).toEqual([]);
    expect((await ack(b,'chat:send',{workspaceId:ws.id,body:'No access',clientId:randomUUID()})).error?.code).toBe('NOT_FOUND');
  });
  it('deduplicates tabs in presence and keeps the second tab online after one disconnects',async()=>{
    const {owner,ws}=await team();const a=await connect(owner),b=await connect(owner,1);
    await ack(a,'workspace:join',{workspaceId:ws.id});const joined=await ack(b,'workspace:join',{workspaceId:ws.id});
    expect(joined.data.userIds).toEqual([owner.user.id]);a.disconnect();await delay();
    expect((await as(owner).get(`/api/chat/${ws.id}/presence`)).body.userIds).toEqual([owner.user.id]);
    b.disconnect();await delay();expect((await as(owner).get(`/api/chat/${ws.id}/presence`)).body.userIds).toEqual([]);
  });
  it('expires crashed presence records using real Redis time',async()=>{
    const online=createPresence(redis,80),workspaceId=randomUUID(),userId=randomUUID();
    await online.touch(workspaceId,userId,'dead-socket');expect(await online.list(workspaceId)).toEqual([userId]);
    await delay(100);expect(await online.list(workspaceId)).toEqual([]);
  });
  it('disconnects a socket when its access token expires',async()=>{
    const owner=await registerUser();
    const token=await new SignJWT({email:owner.user.email}).setProtectedHeader({alg:'HS256'}).setSubject(owner.user.id).setIssuer(config.JWT_ISSUER).setAudience('syncspace-web').setExpirationTime(Math.floor(Date.now()/1000)+2).sign(new TextEncoder().encode(config.JWT_ACCESS_SECRET));
    const socket=await connect(owner,0,token);const expired=event(socket,'auth:expired');const disconnected=event(socket,'disconnect');await expired;await disconnected;expect(socket.connected).toBe(false);
  });
  it('shares socket rate limits across both API servers',async()=>{
    const {owner,ws}=await team();const a=await connect(owner),b=await connect(owner,1);
    const key=`rl:socket:${owner.user.id}:${Math.floor(Date.now()/10_000)}`;await redis.set(key,'240','PX',10_000);
    expect((await ack(a,'workspace:join',{workspaceId:ws.id})).error?.code).toBe('RATE_LIMITED');
    expect((await ack(b,'workspace:join',{workspaceId:ws.id})).error?.code).toBe('RATE_LIMITED');
  });
  it('signals degraded delivery and resyncs after a Redis subscriber interruption',async()=>{
    const {owner,member,ws}=await team();const b=await connect(member,1);
    await ack(b,'workspace:join',{workspaceId:ws.id});
    try {
      const degraded=event(b,'realtime:degraded');remoteSubscriber.disconnect();await degraded;
      await as(owner).post(`/api/chat/${ws.id}/messages`,{body:'Missed while disconnected',clientId:randomUUID()}).expect(201);
      const resync=event(b,'realtime:resync');await remoteSubscriber.connect();await resync;await delay();
      expect((await as(member).get(`/api/chat/${ws.id}/messages`)).body.messages[0].body).toBe('Missed while disconnected');
      const delivered=event<DomainEvent>(b,'workspace:event');
      await as(owner).post(`/api/chat/${ws.id}/messages`,{body:'Delivered after recovery',clientId:randomUUID()}).expect(201);
      expect((await delivered).type).toBe('chat.message');
    } finally { if(remoteSubscriber.status==='end') await remoteSubscriber.connect(); }
  });
  it('paginates history without duplicates or cross-workspace cursor leakage',async()=>{
    const {owner,ws}=await team();
    for(let n=0;n<4;n++) await as(owner).post(`/api/chat/${ws.id}/messages`,{body:`Message ${n}`,clientId:randomUUID()}).expect(201);
    const first=await as(owner).get(`/api/chat/${ws.id}/messages?limit=2`).expect(200);
    const second=await as(owner).get(`/api/chat/${ws.id}/messages?limit=2&before=${first.body.nextCursor}`).expect(200);
    expect(new Set([...first.body.messages,...second.body.messages].map(m=>m.id)).size).toBe(4);expect(second.body.nextCursor).toBeNull();
    const other=await createWorkspace(owner,'Other');expect((await as(owner).get(`/api/chat/${other.id}/messages?before=${first.body.nextCursor}`)).body.messages).toEqual([]);
    await as(owner).post(`/api/chat/${ws.id}/messages`,{body:' ',clientId:randomUUID()}).expect(400);
    await as(owner).get(`/api/chat/${ws.id}/messages?limit=1000`).expect(400);
  });
});
