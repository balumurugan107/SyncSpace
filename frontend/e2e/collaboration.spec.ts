import { randomUUID } from 'node:crypto';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

// Set these from `docker compose port --index N api 4000` to prove cross-process fan-out.
const replicaA=process.env.E2E_API_A;
const replicaB=process.env.E2E_API_B;
async function pinSocket(context:BrowserContext, target:string) {
  await context.addInitScript((url)=>{
    const NativeWebSocket=window.WebSocket;
    window.WebSocket=class extends NativeWebSocket {
      constructor(address:string|URL,protocols?:string|string[]) {
        const socketURL=new URL(address.toString(),location.href);
        if(socketURL.pathname.startsWith('/api/socket.io')) {
          const api=new URL(url);socketURL.host=api.host;socketURL.protocol=api.protocol==='https:'?'wss:':'ws:';
        }
        super(socketURL,protocols);
        const state=window as unknown as {phase4Sockets?:WebSocket[]};
        (state.phase4Sockets ??= []).push(this);
      }
    };
  },target);
}
function servedBy(page:Page) {
  const replicas=new Set<string>();
  page.on('websocket',(ws)=>ws.on('framereceived',({payload})=>{
    const packet=payload.toString();
    if(packet.startsWith('42["realtime:ready"')) replicas.add(JSON.parse(packet.slice(2))[1].instanceId);
  }));return replicas;
}

test('two users collaborate across replicas, reconnect, and use chat on mobile',async({browser,baseURL},testInfo)=>{
  test.skip(!replicaA||!replicaB,'Set E2E_API_A and E2E_API_B to two distinct running API URLs.');
  const owner=await browser.newContext(),member=await browser.newContext();
  await pinSocket(owner,replicaA!);await pinSocket(member,replicaB!);
  const ownerPage=await owner.newPage(), memberPage=await member.newPage();
  const a=servedBy(ownerPage),b=servedBy(memberPage);
  const errors:string[]=[];ownerPage.on('pageerror',(e)=>errors.push(e.message));memberPage.on('pageerror',(e)=>errors.push(e.message));
  let workspaceId:string|undefined,auth:Record<string,string>|undefined;
  try {
    const password=`Test-${randomUUID()}-a1`,stamp=Date.now();
    const register=async(context:BrowserContext,name:string)=>{
      const response=await context.request.post(`${baseURL}/api/auth/register`,{data:{email:`phase4-${name}-${stamp}@example.test`,displayName:`Phase4 ${name}`,password}});
      expect(response.ok()).toBeTruthy();return response.json();
    };
    const userA=await register(owner,'Ada'),userB=await register(member,'Bob');auth={Authorization:`Bearer ${userA.accessToken}`};
    const created=await owner.request.post(`${baseURL}/api/workspaces`,{headers:auth,data:{name:`Phase 4 verification ${stamp}`}});expect(created.status()).toBe(201);workspaceId=(await created.json()).workspace.id;
    expect((await owner.request.post(`${baseURL}/api/workspaces/${workspaceId}/members`,{headers:auth,data:{email:userB.user.email}})).status()).toBe(201);
    const result=await owner.request.post(`${baseURL}/api/workspaces/${workspaceId}/projects`,{headers:auth,data:{name:'Live project',key:'LIVE'}});expect(result.status()).toBe(201);const project=(await result.json()).project;
    await ownerPage.goto(`${baseURL}/projects/${project.id}`);await memberPage.goto(`${baseURL}/projects/${project.id}`);
    await expect(ownerPage.getByText('2 online · Live',{exact:true})).toBeVisible();await expect(memberPage.getByText('2 online · Live',{exact:true})).toBeVisible();
    expect([...a]).toHaveLength(1);expect([...b]).toHaveLength(1);expect([...a][0]).not.toBe([...b][0]);

    await ownerPage.getByRole('button',{name:'New task',exact:true}).click();
    await ownerPage.getByLabel('Title',{exact:true}).fill('Move this card live');
    await ownerPage.getByRole('button',{name:'Create task',exact:true}).click();
    const cardName=/LIVE-1: Move this card live/;
    await expect(memberPage.getByRole('button',{name:cardName})).toBeVisible();
    const card=ownerPage.getByRole('button',{name:cardName});
    // Pointer drag across columns exercises the actual dnd-kit UI, not a direct move API.
    const from=await card.boundingBox(),target=await ownerPage.getByRole('region',{name:'In progress',exact:true}).boundingBox();
    expect(from&&target).toBeTruthy();
    await ownerPage.mouse.move(from!.x+from!.width/2,from!.y+from!.height/2);await ownerPage.mouse.down();
    await ownerPage.mouse.move(from!.x+from!.width/2+12,from!.y+from!.height/2,{steps:3});
    await ownerPage.mouse.move(target!.x+target!.width/2,target!.y+150,{steps:20});await ownerPage.mouse.up();
    await expect(memberPage.getByRole('region',{name:'In progress',exact:true}).getByRole('button',{name:cardName})).toBeVisible();

    // This extra tab uses the normal same-origin web proxy (no direct API pinning).
    const normal=await browser.newContext();
    // A separate login family prevents this independent context from rotating Bob's existing cookie.
    expect((await normal.request.post(`${baseURL}/api/auth/login`,{data:{email:userB.user.email,password}})).ok()).toBeTruthy();
    const proxy=await normal.newPage();
    const proxyReplicas=servedBy(proxy);await proxy.goto(`${baseURL}/projects/${project.id}`);
    await expect(proxy.getByText('2 online · Live',{exact:true})).toBeVisible();await expect.poll(()=>proxyReplicas.size).toBe(1);await normal.close();

    await member.setOffline(true);
    await memberPage.evaluate(()=>{ for(const socket of (window as unknown as {phase4Sockets:WebSocket[]}).phase4Sockets) socket.close(); });
    await expect(memberPage.getByText(/Reconnecting/)).toBeVisible();
    const tasks=await owner.request.get(`${baseURL}/api/projects/${project.id}/tasks`,{headers:auth});const task=(await tasks.json()).tasks[0];
    expect((await owner.request.patch(`${baseURL}/api/tasks/${task.id}`,{headers:auth,data:{title:'Recovered after reconnect',version:task.version}})).status()).toBe(200);
    await member.setOffline(false);
    await expect(memberPage.getByRole('button',{name:/LIVE-1: Recovered after reconnect/})).toBeVisible();

    await ownerPage.goto(`${baseURL}/chat?workspace=${workspaceId}`);await memberPage.goto(`${baseURL}/chat?workspace=${workspaceId}`);
    await ownerPage.getByRole('textbox',{name:'Message',exact:true}).fill('Hello across replicas');await ownerPage.getByRole('button',{name:'Send message',exact:true}).click();
    await expect(memberPage.getByText('Hello across replicas',{exact:true})).toBeVisible();
    await memberPage.getByRole('textbox',{name:'Message',exact:true}).fill('Reply from the other server');await memberPage.getByRole('button',{name:'Send message',exact:true}).click();
    await expect(ownerPage.getByText('Reply from the other server',{exact:true})).toBeVisible();
    await ownerPage.screenshot({path:testInfo.outputPath('chat-desktop.png'),fullPage:true});
    await memberPage.setViewportSize({width:390,height:844});
    await expect(memberPage.getByRole('button',{name:'Send message',exact:true})).toBeVisible();
    expect(await memberPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await memberPage.screenshot({path:testInfo.outputPath('chat-mobile.png'),fullPage:true});
    await ownerPage.goto(`${baseURL}/architecture`);await expect(ownerPage.getByText('Socket.IO',{exact:true}).first()).toBeVisible();
    expect(errors).toEqual([]);
    console.log(`Verified: ${[...a].join(', ')} <-> ${[...b].join(', ')}; live create/drag, proxy upgrade, offline recovery, bidirectional chat and mobile layout.`);
  } finally {
    if(workspaceId&&auth) await owner.request.delete(`${baseURL}/api/workspaces/${workspaceId}`,{headers:auth});
    await owner.close();await member.close();
  }
});
