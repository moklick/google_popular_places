const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const D3Dsv = require('d3-dsv');

const inputPath = path.resolve(__dirname, '..', 'input.csv');
const outputPath = path.resolve(__dirname, '..', 'data');
const GOOGLE_URL_QUERY = 'https://www.google.com/search?q=';
const headless = false;

const inputData = D3Dsv.csvParse(fs.readFileSync(inputPath).toString());

async function main() {
  puppeteer
    .launch({ headless, args: ['--lang=de-DE,de'], defaultViewport: null })
    .then(async browser => {
      const page = await browser.newPage();

      for (let data of inputData) {
        await run(data.name, page);
      }

      await browser.close();
    });
}

main();

async function run(queryString, page) {
  const queryFormat = searchStr => searchStr.replace(/\s+/g, '+');
  const docSaveQueryFormat = searchStr => searchStr.replace(/\s+/g, '-');

  const full_query = GOOGLE_URL_QUERY + queryFormat(queryString);
  const d = { query: queryString };

  console.log(full_query);

  await page.goto(full_query);
  const $button = await page.$('div.ab_button[role^=button] span');
  const $locationName = await page.$('div[data-attrid^=title] span');

  if ($button === null || $locationName === null) {
    return null;
  }

  const location_name = await page.$eval(
    'div[data-attrid^=title] span',
    el => el.textContent
  );
  d['location_name'] = location_name;

  const results = [];
  for (let idx = 1; idx <= 7; idx++) {
    await page.click('div.ab_button[role^=button] span');
    await page.waitForSelector('ul li[role^=menuitem]');
    await page.click(`ul li[role^=menuitem]:nth-child(${idx})`);

    await page.waitFor(1000);
    let key = await page.$eval(
      'div.ab_button[role^=button] span',
      el => el.textContent
    );
    const data = await page.$$eval('div[aria-hidden^=false] div.lubh-bar', el =>
      el.map(x => ({
        time: x.getAttribute('aria-label').replace(/:(.*)/g, ''),
        busyDetailed: x
          .getAttribute('aria-label')
          .replace(/^.*?:/g, '')
          .trim(),
        percent: +x
          .getAttribute('style')
          .replace('height:', '')
          .replace(/px;?/, '')
          .trim()
      }))
    );
    results.push({ day: key, data });
  }
  d['histogram'] = results.map(d => ({
    ...d,
    data: d.data
      .map(a => ({ ...a, time: parseTime(a.time) }))
      .sort((a, b) => {
        if (a.time < b.time) {
          return -1;
        } else if (a.time > b.time) {
          return 1;
        }

        return 0;
      })
  }));
  const doc_name = docSaveQueryFormat(queryString);
  fs.writeFileSync(
    path.resolve(outputPath, `${doc_name}.json`),
    JSON.stringify(d, null, 2),
    'utf-8'
  );
}

function parseTime(timeString) {
  if (timeString.includes('am')) {
    return +timeString.replace('am', '').trim();
  }

  return +timeString.replace('pm', '').trim() + 12;
}
