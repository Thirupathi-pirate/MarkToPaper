import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.error('BROWSER ERROR:', err.toString()));
  
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  const html = await page.content();
  console.log('HTML CONTENT:', html.substring(0, 500));
  
  // also print body content text
  const body = await page.$eval('body', el => el.innerText);
  console.log('BODY CONTENT:', body.substring(0, 500));
  
  await browser.close();
})();
