// Générateur de QR code STATIQUE pour le portfolio.
//
// Pourquoi ce script existe : les QR codes créés sur les sites en ligne sont
// « dynamiques ». Ils n'encodent pas l'URL du portfolio mais un lien de
// redirection appartenant au service (ex. https://qr.codes/xxxxxx). Dès que
// l'abonnement s'arrête, le lien meurt et le QR imprimé sur le CV ne mène
// plus nulle part — voire vers une page publicitaire.
//
// Ici, l'URL est encodée directement dans l'image. Aucun serveur intermédiaire,
// aucun compte, aucune date d'expiration : le QR fonctionnera tant que le
// portfolio existera.
//
// Usage : npm install  puis  npm run qr
//   - écrit assets/qr-portfolio.svg et assets/qr-portfolio.png
//   - remplace le QR à l'intérieur des CV PDF (FR + EN)

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const QRCode = require('qrcode');
const jsQR = require('jsqr');
const { PNG } = require('pngjs');
const { PDFDocument, PDFName, PDFRawStream, PDFNumber } = require('pdf-lib');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const URL = 'https://sajidmarzouqy.github.io/';

// 'M' = 15 % de redondance : le QR reste lisible même froissé, photocopié ou
// scanné de biais, tout en gardant de gros modules faciles à viser.
const ERROR_CORRECTION = 'M';

// Marge blanche obligatoire autour du code (4 modules = norme ISO/IEC 18004).
// Sans elle, beaucoup de lecteurs échouent.
const QUIET_ZONE = 4;

const ROOT = path.resolve(__dirname, '..');
const OUT_SVG = path.join(ROOT, 'assets', 'qr-portfolio.svg');
const OUT_PNG = path.join(ROOT, 'assets', 'qr-portfolio.png');
const PDFS = [
    path.join(ROOT, 'CV_Sajid_Marzouqy_FR.pdf'),
    path.join(ROOT, 'CV_Sajid_Marzouqy_EN.pdf'),
];

// ---------------------------------------------------------------------------
// Rendu du QR en pixels
// ---------------------------------------------------------------------------

// Produit un carré RGB. `pixelsPerModule` est un entier : chaque module tombe
// exactement sur des pixels entiers, donc aucun bord flou à l'impression.
function rasterize(qr, pixelsPerModule) {
    const size = qr.modules.size;
    const data = qr.modules.data;
    const side = (size + QUIET_ZONE * 2) * pixelsPerModule;
    const rgb = Buffer.alloc(side * side * 3, 0xff); // fond blanc

    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            if (!data[row * size + col]) continue; // module clair : on laisse blanc
            const x0 = (col + QUIET_ZONE) * pixelsPerModule;
            const y0 = (row + QUIET_ZONE) * pixelsPerModule;
            for (let y = y0; y < y0 + pixelsPerModule; y++) {
                const start = (y * side + x0) * 3;
                rgb.fill(0x00, start, start + pixelsPerModule * 3); // module sombre
            }
        }
    }
    return { rgb, side };
}

// Relit le QR qu'on vient de dessiner et vérifie qu'il redonne bien l'URL.
// Garde-fou : un QR faux mais joli est indétectable à l'œil nu.
function assertDecodes(rgb, side, expected) {
    const rgba = Buffer.alloc(side * side * 4, 0xff);
    for (let i = 0; i < side * side; i++) {
        rgb.copy(rgba, i * 4, i * 3, i * 3 + 3);
    }
    const decoded = jsQR(new Uint8ClampedArray(rgba), side, side);
    if (!decoded) throw new Error('QR illisible : le décodage de contrôle a échoué.');
    if (decoded.data !== expected) {
        throw new Error(`QR incorrect : il encode "${decoded.data}" au lieu de "${expected}".`);
    }
}

function toPng(rgb, side) {
    const png = new PNG({ width: side, height: side });
    for (let i = 0; i < side * side; i++) {
        rgb.copy(png.data, i * 4, i * 3, i * 3 + 3);
        png.data[i * 4 + 3] = 0xff;
    }
    return PNG.sync.write(png);
}

// ---------------------------------------------------------------------------
// Remplacement du QR dans un PDF déjà mis en page
// ---------------------------------------------------------------------------

// Les CV PDF sont des fichiers finaux : on ne les régénère pas, on échange
// uniquement les pixels de l'image du QR. Position, taille et reste de la mise
// en page restent strictement identiques.
async function patchPdf(file, rgb, side) {
    const doc = await PDFDocument.load(fs.readFileSync(file));

    const images = [];
    for (const page of doc.getPages()) {
        const xobjects = page.node.Resources().lookup(PDFName.of('XObject'));
        if (!xobjects) continue;
        for (const key of xobjects.keys()) {
            const ref = xobjects.get(key);
            const stream = doc.context.lookup(ref);
            if (!(stream instanceof PDFRawStream)) continue;
            if (stream.dict.get(PDFName.of('Subtype'))?.asString?.() !== '/Image') continue;
            const width = stream.dict.get(PDFName.of('Width')).asNumber();
            const height = stream.dict.get(PDFName.of('Height')).asNumber();
            images.push({ ref, stream, width, height });
        }
    }

    // Le QR est la seule image de ces CV. Si ce n'est plus le cas (photo,
    // logo...), mieux vaut s'arrêter que d'écraser la mauvaise image.
    const squares = images.filter((i) => i.width === i.height);
    if (squares.length !== 1) {
        throw new Error(
            `${path.basename(file)} : ${squares.length} image(s) carrée(s) trouvée(s), ` +
            `impossible d'identifier le QR de façon sûre.`
        );
    }

    const target = squares[0];
    const dict = target.stream.dict;
    const deflated = zlib.deflateSync(rgb);

    dict.set(PDFName.of('Width'), PDFNumber.of(side));
    dict.set(PDFName.of('Height'), PDFNumber.of(side));
    dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
    dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'));
    dict.delete(PDFName.of('DecodeParms'));
    dict.delete(PDFName.of('SMask'));
    dict.set(PDFName.of('Length'), PDFNumber.of(deflated.length));

    doc.context.assign(target.ref, PDFRawStream.of(dict, deflated));

    fs.writeFileSync(file, await doc.save());
    return { previous: `${target.width}x${target.height}`, next: `${side}x${side}` };
}

// ---------------------------------------------------------------------------

(async () => {
    const qr = QRCode.create(URL, { errorCorrectionLevel: ERROR_CORRECTION });
    const modules = qr.modules.size;

    // 24 px/module : ~890 px de côté, largement de quoi imprimer net en A4.
    const { rgb, side } = rasterize(qr, 24);
    assertDecodes(rgb, side, URL);

    console.log(`URL encodée : ${URL}`);
    console.log(`Version ${qr.version} · correction ${ERROR_CORRECTION} · ${modules}x${modules} modules · ${side}px`);
    console.log('Décodage de contrôle : OK\n');

    fs.mkdirSync(path.dirname(OUT_SVG), { recursive: true });
    fs.writeFileSync(OUT_SVG, await QRCode.toString(URL, {
        type: 'svg',
        errorCorrectionLevel: ERROR_CORRECTION,
        margin: QUIET_ZONE,
    }));
    fs.writeFileSync(OUT_PNG, toPng(rgb, side));
    console.log('Écrit ->', path.relative(ROOT, OUT_SVG));
    console.log('Écrit ->', path.relative(ROOT, OUT_PNG));

    for (const file of PDFS) {
        if (!fs.existsSync(file)) {
            console.log('Ignoré (absent) ->', path.basename(file));
            continue;
        }
        const { previous, next } = await patchPdf(file, rgb, side);
        console.log(`QR remplacé -> ${path.basename(file)} (${previous} -> ${next})`);
    }
})().catch((err) => {
    console.error('Échec :', err.message);
    process.exit(1);
});
