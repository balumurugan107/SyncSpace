import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RealtimeProvider, useRealtime } from './realtime-provider';

const mocks=vi.hoisted(()=>({ socket: null as any, refresh:vi.fn(), toast:vi.fn() }));
vi.mock('@/features/auth/auth-provider',()=>({ useAuth:()=>({ state:{ user:{id:'me'},status:'authenticated' } }) }));
vi.mock('@/lib/api-client',()=>({ getAccessToken:()=> 'token', refreshSession:mocks.refresh,
  api:{ get:async()=>({ workspaces:[{id:'workspace',name:'Workspace'}] }) } }));
vi.mock('sonner',()=>({ toast:{info:mocks.toast} }));
vi.mock('socket.io-client',()=>({ io:()=>mocks.socket }));
function fakeSocket() {
  const listeners=new Map<string,((...args:any[])=>void)[]>();
  const socket={ connected:false,active:true,
    on:vi.fn((name:string,fn:(...args:any[])=>void)=>{listeners.set(name,[...(listeners.get(name)??[]),fn]);return socket;}),
    connect:vi.fn(()=>{socket.connected=true;socket.trigger('connect');return socket;}),
    disconnect:vi.fn(()=>{socket.connected=false;return socket;}),
    removeAllListeners:vi.fn(()=>listeners.clear()),
    emit:vi.fn((name:string,_data:any,ack:any)=>{ if(name==='workspace:join') ack({ok:true,data:{userIds:['me','teammate']}}); }),
    trigger:(name:string,...args:any[])=>{for(const fn of listeners.get(name)??[])fn(...args);},
  };return socket;
}
function Probe() {
  const {connected,online,setDragging}=useRealtime();
  return <><span>{connected ? 'Live':'Disconnected'}</span><span>{online.workspace?.length ?? 0} online</span><button onClick={()=>setDragging(true)}>Start drag</button><button onClick={()=>setDragging(false)}>End drag</button></>;
}
let client:QueryClient;
beforeEach(()=>{ mocks.socket=fakeSocket();mocks.refresh.mockReset();mocks.toast.mockClear();client=new QueryClient({defaultOptions:{queries:{retry:false}}}); });
afterEach(()=>{ cleanup(); client.clear(); });
function mount() {return render(<QueryClientProvider client={client}><RealtimeProvider><Probe /></RealtimeProvider></QueryClientProvider>);}
describe('real-time browser lifecycle',()=>{
  it('joins workspaces, displays presence and closes the connection on unmount',async()=>{
    const view=mount();await screen.findByText('2 online');expect(screen.getByText('Live')).toBeInTheDocument();
    expect(mocks.socket.emit).toHaveBeenCalledWith('workspace:join',{workspaceId:'workspace'},expect.any(Function));
    view.unmount();expect(mocks.socket.disconnect).toHaveBeenCalled();
  });
  it('queues task refreshes during a drag, flushes on drop and ignores duplicate events',async()=>{
    mount();await screen.findByText('2 online');const invalidate=vi.spyOn(client,'invalidateQueries');invalidate.mockClear();
    fireEvent.click(screen.getByText('Start drag'));
    const event={id:'same-event',type:'task.moved',workspaceId:'workspace',projectId:'project',taskId:'task',actorId:'other'};
    act(()=>{mocks.socket.trigger('workspace:event',event);mocks.socket.trigger('workspace:event',event);});
    await new Promise(r=>setTimeout(r,130));expect(invalidate).not.toHaveBeenCalled();expect(mocks.toast).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('End drag'));
    expect(invalidate).toHaveBeenCalledWith({queryKey:['projects','project']});
    expect(invalidate).toHaveBeenCalledWith({queryKey:['tasks','task']});
  });
  it('reconciles after reconnect/Redis recovery and shows degraded state',async()=>{
    mount();await screen.findByText('2 online');const invalidate=vi.spyOn(client,'invalidateQueries');invalidate.mockClear();
    act(()=>mocks.socket.trigger('realtime:degraded'));expect(screen.getByText('Disconnected')).toBeInTheDocument();
    act(()=>mocks.socket.trigger('realtime:resync'));expect(screen.getByText('Live')).toBeInTheDocument();expect(invalidate).toHaveBeenCalled();
    invalidate.mockClear();act(()=>mocks.socket.trigger('connect'));expect(invalidate).toHaveBeenCalled();
  });
  it('refreshes credentials after an expiry disconnect',async()=>{
    mocks.refresh.mockResolvedValue({accessToken:'new-token'});mount();await screen.findByText('2 online');
    act(()=>mocks.socket.trigger('disconnect','io server disconnect'));
    await waitFor(()=>expect(mocks.refresh).toHaveBeenCalledTimes(1));
    await waitFor(()=>expect(mocks.socket.connect).toHaveBeenCalledTimes(2));
  });
});
