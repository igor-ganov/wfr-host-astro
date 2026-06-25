import { chromium, devices } from '@playwright/test';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['Pixel 5'] });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await p.goto('https://igor-ganov.github.io/web-file-reader/viewer/readme',{waitUntil:'load'});
// throttle so any pre-dialog window is wide, then reload and snap fast
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:200,downloadThroughput:300*1024/8,uploadThroughput:300*1024/8});
const nav = p.reload({waitUntil:'commit'});
for (let i=0;i<6;i++){ await p.screenshot({path:`/tmp/r${i}.png`}); }
await nav.catch(()=>{});
await p.waitForTimeout(2000);
// report whether any tile pictogram was paintable while dialog closed
const r = await p.evaluate(()=>{
  const page=document.querySelector('.page');
  return { pageVis: page?getComputedStyle(page).visibility:'none', boot: document.documentElement.getAttribute('data-wfr-boot'), dlg: document.querySelector('#viewer-dialog')?.open };
});
console.log('after load:', JSON.stringify(r));
