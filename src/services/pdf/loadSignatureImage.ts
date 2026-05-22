import fs from 'fs';
import path from 'path';
import 'server-only';

const SIGNATURE_FILES = [
  path.join('template', 'assinatura.png'),
  path.join('template', '357b420c-7be1-4487-802f-33e1574bfd7b.png'),
];

export function loadSignatureImageBytes(): Buffer | null {
  for (const relative of SIGNATURE_FILES) {
    const fullPath = path.join(process.cwd(), relative);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath);
    }
  }
  return null;
}
