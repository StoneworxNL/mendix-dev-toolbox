import { h, clear, select, checkbox, input, number, field, options, split, status, live, kv, card, button, fileDrop, download, formatBytes, copyText } from '../ui.js';
import { parseColor, formats, contrast, scale, toHex, CVD, simulateCvd } from '../lib/color.js';

const C = 'Graphics';

const color = {
  id: 'color', name: 'Color picker & contrast', category: C, icon: 'palette',
  description: 'Convert colors between HEX, RGB, HSL, HSV and CMYK, check WCAG contrast and build a tint scale.',
  keywords: 'colour hex rgb hsl hsv cmyk contrast wcag accessibility a11y palette eyedropper',
  render(root) {
    const text = input({ value: '#264AE5', persist: 'color' });
    const picker = h('input', { type: 'color', value: '#264ae5', 'aria-label': 'Pick a color' });
    const bg = input({ value: '#FFFFFF', persist: 'bg' });
    const bgPicker = h('input', { type: 'color', value: '#ffffff', 'aria-label': 'Pick a background' });
    const eyedrop = 'EyeDropper' in window && button('Pick from screen', async () => { try { const r = await new window.EyeDropper().open(); text.value = r.sRGBHex; run(); } catch { /* cancelled */ } }, { iconName: 'eyedropper' });
    picker.addEventListener('input', (e) => { e.stopPropagation(); text.value = picker.value; run(); });
    bgPicker.addEventListener('input', (e) => { e.stopPropagation(); bg.value = bgPicker.value; run(); });
    const swatch = h('div', { class: 'swatch' });
    const values = h('div');
    const contrastBox = h('div');
    const palette = h('div', { class: 'palette' });
    const stat = status();
    clear(root, options(field('Color', h('div', { class: 'row' }, picker, text)), field('Background', h('div', { class: 'row' }, bgPicker, bg)), eyedrop), stat.root, split(h('div', { class: 'stack' }, swatch, values), h('div', { class: 'stack' }, contrastBox, card('Tints & shades', palette))));
    const run = live(root, () => {
      const c = parseColor(text.value);
      const b = parseColor(bg.value);
      picker.value = toHex({ ...c, a: 1 });
      bgPicker.value = toHex({ ...b, a: 1 });
      swatch.style.background = toHex(c);
      clear(swatch, h('span', { style: { color: toHex(b) } }, 'Text on color'), h('span', { style: { color: toHex(c), background: toHex(b) } }, 'Color on background'));
      clear(values, card('Formats', kv(Object.entries(formats(c)))));
      const ratio = contrast(c, b);
      const grade = (min) => (ratio >= min ? h('span', { class: 'pass' }, 'Pass') : h('span', { class: 'fail' }, 'Fail'));
      clear(contrastBox, card(`Contrast ${ratio.toFixed(2)} : 1`, h('table', { class: 'grid' }, h('tbody', {},
        h('tr', {}, h('td', {}, 'AA normal text (4.5)'), h('td', {}, grade(4.5))),
        h('tr', {}, h('td', {}, 'AA large text (3)'), h('td', {}, grade(3))),
        h('tr', {}, h('td', {}, 'AAA normal text (7)'), h('td', {}, grade(7))),
        h('tr', {}, h('td', {}, 'AAA large text (4.5)'), h('td', {}, grade(4.5))),
        h('tr', {}, h('td', {}, 'UI components (3)'), h('td', {}, grade(3)))))));
      clear(palette, scale(c).map((hex, i) => h('button', { type: 'button', class: 'chipcolor', title: `Copy ${hex}`, style: { background: hex, color: i < 4 ? '#000' : '#fff' }, onclick: () => copyText(hex) }, `${(i + 1) * 100}`)));
    }, stat);
    return run;
  },
};

async function loadImage(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { img, url };
}

const colorBlind = {
  id: 'color-blind', name: 'Color blindness simulator', category: C, icon: 'eye',
  description: 'See a screenshot or design as people with protanopia, deuteranopia, tritanopia or achromatopsia would.',
  keywords: 'accessibility a11y cvd daltonism vision',
  render(root) {
    const grid = h('div', { class: 'cvd-grid' });
    const stat = status();
    const show = async ([file]) => {
      clear(grid);
      const { img } = await loadImage(file);
      const max = 900;
      const ratio = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * ratio), hgt = Math.round(img.naturalHeight * ratio);
      const draw = (label, matrix) => {
        const c = h('canvas', { width: w, height: hgt });
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, hgt);
        if (matrix) { const d = ctx.getImageData(0, 0, w, hgt); simulateCvd(d.data, matrix); ctx.putImageData(d, 0, 0); }
        grid.append(h('figure', {}, c, h('figcaption', {}, label, button('Save', () => c.toBlob((b) => download(b, `${label.toLowerCase().replace(/\W+/g, '-')}.png`)), { kind: 'mini-btn' }))));
      };
      draw('Original', null);
      draw('Protanopia (no red)', CVD.protanopia);
      draw('Deuteranopia (no green)', CVD.deuteranopia);
      draw('Tritanopia (no blue)', CVD.tritanopia);
      draw('Achromatopsia (no color)', CVD.achromatopsia);
    };
    clear(root, fileDrop({ accept: 'image/*', label: 'Drop an image or screenshot here', onFiles: (f) => show(f).catch((e) => stat.error(e)) }), stat.root, grid);
  },
};

const imageConverter = {
  id: 'image-converter', name: 'Image converter', category: C, icon: 'image',
  description: 'Convert, resize and compress images to PNG, JPEG or WebP, one or many at a time.',
  keywords: 'png jpeg jpg webp resize compress optimize convert batch icon',
  render(root) {
    const format = select({ 'image/png': 'PNG', 'image/jpeg': 'JPEG', 'image/webp': 'WebP' }, { value: 'image/webp', persist: 'fmt', label: 'Format' });
    const quality = number({ value: 85, min: 1, max: 100, persist: 'q', width: '5em' });
    const maxW = number({ value: '', min: 1, placeholder: 'auto', persist: 'w', width: '7em' });
    const maxH = number({ value: '', min: 1, placeholder: 'auto', persist: 'h', width: '7em' });
    const bgFill = input({ value: '#ffffff', persist: 'bg', type: 'color' });
    const list = h('div', { class: 'image-list' });
    const stat = status();
    let files = [];
    const convertOne = async (file) => {
      const { img, url } = await loadImage(file);
      let w = img.naturalWidth, hgt = img.naturalHeight;
      const mw = Number(maxW.value) || Infinity, mh = Number(maxH.value) || Infinity;
      const r = Math.min(1, mw / w, mh / hgt);
      w = Math.max(1, Math.round(w * r)); hgt = Math.max(1, Math.round(hgt * r));
      const c = h('canvas', { width: w, height: hgt });
      const ctx = c.getContext('2d');
      if (format.value === 'image/jpeg') { ctx.fillStyle = bgFill.value; ctx.fillRect(0, 0, w, hgt); }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, hgt);
      const blob = await new Promise((res) => c.toBlob(res, format.value, Number(quality.value) / 100));
      URL.revokeObjectURL(url);
      return { blob, w, hgt, srcW: img.naturalWidth, srcH: img.naturalHeight };
    };
    const ext = () => ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' })[format.value];
    const rename = (name) => `${name.replace(/\.[^.]+$/, '')}.${ext()}`;
    let generation = 0;
    const run = async () => {
      const mine = ++generation;
      clear(list);
      quality.disabled = format.value === 'image/png';
      if (!files.length) return;
      let before = 0, after = 0;
      for (const f of files) {
        const r = await convertOne(f);
        if (mine !== generation) return;
        before += f.size; after += r.blob.size;
        const thumb = h('img', { src: URL.createObjectURL(r.blob), alt: f.name });
        list.append(h('div', { class: 'image-item' }, thumb, h('div', {}, h('strong', {}, rename(f.name)), h('div', { class: 'hint' }, `${r.srcW}×${r.srcH} → ${r.w}×${r.hgt} · ${formatBytes(f.size)} → ${formatBytes(r.blob.size)} (${Math.round((r.blob.size / f.size) * 100)}%)`)), button('Download', () => download(r.blob, rename(f.name)), { kind: 'ghost', iconName: 'download' })));
        if (r.blob.type !== format.value) stat.error(`This browser cannot write ${format.selectedOptions[0].text}; it fell back to ${r.blob.type}.`);
      }
      stat.info(`${files.length} image${files.length === 1 ? '' : 's'}: ${formatBytes(before)} → ${formatBytes(after)}`);
    };
    const drop = fileDrop({ accept: 'image/*', multiple: true, label: 'Drop one or more images here', onFiles: (f) => { files = f; run().catch((e) => stat.error(e)); } });
    clear(root, drop, options(field('Format', format), field('Quality', quality), field('Max width', maxW), field('Max height', maxH), field('JPEG background', bgFill), button('Download all', async () => { for (const f of files) { const r = await convertOne(f); download(r.blob, rename(f.name)); } }, { kind: 'primary', iconName: 'download' })), stat.root, list);
    root.addEventListener('change', () => run().catch((e) => stat.error(e)));
  },
};

export default [color, colorBlind, imageConverter];
