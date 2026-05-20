// Génère CvFr.pdf et Cven.pdf à la racine du portfolio depuis les sources HTML/CSS.
// Usage : npm install  puis  node render.js
const puppeteer = require('puppeteer');
const path = require('path');

const JOBS = [
    { html: 'cv-fr.html', pdf: '../CvFr.pdf' },
    { html: 'cv-en.html', pdf: '../Cven.pdf' },
];

(async () => {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    try {
        for (const job of JOBS) {
            const page = await browser.newPage();
            const fileUrl = 'file://' + path.resolve(__dirname, job.html);
            await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 60000 });
            await page.pdf({
                path: path.resolve(__dirname, job.pdf),
                format: 'A4',
                printBackground: true,
                preferCSSPageSize: true,
            });
            await page.close();
            console.log('OK ->', path.basename(job.pdf));
        }
    } finally {
        await browser.close();
    }
})();
