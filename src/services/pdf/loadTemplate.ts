import fs from 'fs';
import path from 'path';
import 'server-only';
import { PdfTemplateError } from '@/types/pdfExport';

const TEMPLATE_RELATIVE = path.join('template', 'template.pdf');

export function loadTemplateBytes(): Buffer {
  const templatePath = path.join(process.cwd(), TEMPLATE_RELATIVE);
  if (!fs.existsSync(templatePath)) {
    throw new PdfTemplateError(
      `Arquivo de template não encontrado em "${TEMPLATE_RELATIVE}". Adicione template/template.pdf na raiz do projeto antes de gerar PDFs.`
    );
  }
  return fs.readFileSync(templatePath);
}
