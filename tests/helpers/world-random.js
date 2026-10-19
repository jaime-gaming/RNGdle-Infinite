// Test-only words still pass through the real fair / unseen module worker.
// Arrays describe Valley results; objects can script each of the three zones.
export async function mockWorldNumbers(page, numbers = [1]) {
  const pools = Array.isArray(numbers)
    ? { valley: numbers, graveyard: [1], "haunted-house": [1] }
    : numbers;
  await page.route("**/rngween-world.worker*.js*", async (route) => {
    const response = await page.request.get(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: `
      const wanted=${JSON.stringify(pools)};const turns={};let used=[],zone='valley';
      self.addEventListener('message',e=>{used=e.data.drawn;zone=e.data.zone??'valley';});
      Object.defineProperty(crypto,'getRandomValues',{value(a){
        const pool=wanted[zone]??[1];
        if(zone==='valley'){
          const target=pool.find(n=>!used.includes(n))??Array.from({length:9999},(_,i)=>i+1).find(n=>!used.includes(n));
          a[0]=target-1-used.filter(n=>n<target).length;
        }else{const key=zone;const turn=turns[key]??0;turns[key]=turn+1;a[0]=pool[turn%pool.length]-1;}
        return a;
      }});\n${await response.text()}`,
    });
  });
}
