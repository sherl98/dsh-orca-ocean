import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname);
const data = JSON.parse(fs.readFileSync(path.join(root, 'mask.json'), 'utf8'));
const template = fs.readFileSync(path.join(root, 'client.template.js'), 'utf8');
const out = template.replace('__MASK__', JSON.stringify(data));
fs.writeFileSync(path.join(root, 'client.js'), out);
console.log('client.js written:', out.length, 'bytes');
