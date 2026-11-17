// Local browser smoke check: real OSRM routes + local API; no saved credentials.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const WebSocket = require('../web/node_modules/ws');
const wait = (ms) => new Promise(resolve => setTimeout(resolve,ms));
async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(),'braess-studio-qa-'));
  const output = path.resolve('artifacts/studio'); fs.mkdirSync(output,{recursive:true});
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-port=9237',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let socket;
  try {
    let tabs;
    for(let i=0;i<40;i++) { try {tabs=await(await fetch('http://127.0.0.1:9237/json/list')).json();break;} catch {await wait(250);} }
    if (!tabs) throw new Error('Chrome did not start');
    socket = new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
    await new Promise(resolve=>socket.once('open',resolve));
    let id=0; const pending=new Map(); const failures=[]; let simulationRequest;
    socket.on('message',raw=>{const data=JSON.parse(raw);if(data.id){const request=pending.get(data.id);pending.delete(data.id);data.error?request.reject(data.error):request.resolve(data.result);}else if(data.method==='Runtime.exceptionThrown'){failures.push(data.params.exceptionDetails.text);}else if(data.method==='Network.responseReceived' && data.params.response.url.endsWith('/api/simulate')){simulationRequest=data.params.requestId;}});
    const send=(method,params={})=>new Promise((resolve,reject)=>{const next=++id;pending.set(next,{resolve,reject});socket.send(JSON.stringify({id:next,method,params}));});
    const evaluate=async(expression)=>{const value=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(value.exceptionDetails)throw new Error(JSON.stringify(value.exceptionDetails));return value.result.value;};
    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1080,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:'http://127.0.0.1:5191/analysis'}); await wait(5000);
    const snap=async(name)=>{const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(output,name),Buffer.from(shot.data,'base64'));};
    await snap('desktop-before.png');
    await evaluate(`document.querySelector('.run-simulation').click()`);
    let finished=false;
    for(let i=0;i<100;i++) {await wait(500);finished=await evaluate(`!document.querySelector('.run-simulation').disabled`);if(finished)break;}
    await wait(800); await snap('desktop-after.png');
    const mapRect=await evaluate(`(()=>{const r=document.querySelector('.simulation-map-frame').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1};})()`);
    const mapShot=await send('Page.captureScreenshot',{format:'png',clip:mapRect});fs.writeFileSync(path.join(output,'map-detail.png'),Buffer.from(mapShot.data,'base64'));
    const report={ desktop:await evaluate(`({overflow:document.documentElement.scrollWidth-innerWidth,error:document.querySelector('.studio-map-error')?.innerText,result:document.querySelector('.finding-verdict')?.innerText,rows:document.querySelectorAll('.studio-comparison>button').length,chart:!!document.querySelector('.studio-sensitivity polyline'),canvas:!!document.querySelector('.leaflet-overlay-pane canvas'),animationEnabled:!!document.querySelector('[aria-label="Pause flow animation"]')})`), failures, sizes:[] };
    if (simulationRequest) {
      const response=JSON.parse((await send('Network.getResponseBody',{requestId:simulationRequest})).body);
      const road=response.scenarios?.find(x=>x.type==='newRoad');
      report.network={forwardPoints:road?.affectedGeometry?.length,reversePoints:road?.reverseAffectedGeometry?.length,signalPoints:response.scenarios?.find(x=>x.type==='signal')?.affectedGeometry?.length,emergencyPoints:response.scenarios?.find(x=>x.type==='emergencyPriority')?.affectedGeometry?.length,baselineMapEdges:response.diagnostics?.mapEdges?.length,sensitivityPoints:response.diagnostics?.sensitivity?.length};
    }
    await evaluate(`document.querySelector('.before-after button').click()`);await wait(200);report.before=await evaluate(`document.querySelector('.before-after .active').innerText`);
    await evaluate(`document.querySelectorAll('.before-after button')[1].click()`);
    await evaluate(`document.querySelector('[aria-label="Pause flow animation"]')?.click()`);
    for(const width of [360,390,768,1024,1440,1920]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});await wait(400);
      report.sizes.push(await evaluate(`({width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth})`));
      if(width===390)await snap('mobile.png');
    }
    for(const language of ['AZ','EN','TR']){await evaluate(`Array.from(document.querySelectorAll('.language-control button')).find(b=>b.textContent==='${language}').click()`);await wait(200);report[language]=await evaluate(`({lang:document.documentElement.lang,title:document.querySelector('.studio-heading h1').innerText})`);}
    console.log(JSON.stringify(report,null,2));
    if(report.desktop.error || report.desktop.rows<2 || failures.length || report.sizes.some(x=>x.overflow>1))process.exitCode=1;
  } finally {socket?.close();chrome.kill();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
