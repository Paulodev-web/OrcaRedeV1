import fs from 'fs';
import path from 'path';
import 'server-only';

const SIGNATURE_PATH = path.join(process.cwd(), 'template', 'assinatura.png');
const SIGNATURE_FALLBACK_PATH = path.join(
  process.cwd(),
  'template',
  '357b420c-7be1-4487-802f-33e1574bfd7b.png'
);

export function loadSignatureImageBytes(): Buffer | null {
  if (fs.existsSync(SIGNATURE_PATH)) {
    return fs.readFileSync(SIGNATURE_PATH);
  }
  if (fs.existsSync(SIGNATURE_FALLBACK_PATH)) {
    return fs.readFileSync(SIGNATURE_FALLBACK_PATH);
  }

  return null;
}
