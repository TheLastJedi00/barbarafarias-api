import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { Contract } from './contract.entity';

/**
 * O contrato em PDF (spec 036 §6), gerado **da cópia gravada no aceite**.
 *
 * `pdf-lib` com as fontes padrão do PDF: não lê arquivo de fonte do disco (o
 * bundle da Vercel não os leva) e cobre o Latin-1 (WinAnsi), que é o que o
 * PT-BR precisa. O que fica fora — emoji, setas — é trocado por `toWinAnsi`
 * antes de desenhar: um caractere sem glifo derrubaria a geração inteira.
 */

export const CONTRACTOR = 'Bárbara Farias English Teacher';

const PAGE = { width: 595.28, height: 841.89 }; // A4
const MARGIN = 56;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;
const FOOTER_SPACE = 40;

const INK = rgb(0.15, 0.11, 0.16);
const MUTED = rgb(0.4, 0.38, 0.42);
const RULE = rgb(0.82, 0.8, 0.84);

/** Os 32 caracteres de 0x80–0x9F que o WinAnsi tem além do Latin-1. */
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''));
const REPLACEMENTS: Record<string, string> = {
  '→': '->',
  '←': '<-',
  '✓': 'v',
  '≥': '>=',
  '≤': '<=',
};

/** Deixa o texto desenhável nas fontes padrão. */
export function toWinAnsi(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (
      char === '\n' ||
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0xa0 && code <= 0xff) ||
      WIN_ANSI_EXTRA.has(char)
    ) {
      out += char;
    } else {
      out += REPLACEMENTS[char] ?? (code < 0x20 ? ' ' : '?');
    }
  }
  return out;
}

/**
 * Quebra por palavra para caber em `maxWidth`, respeitando as quebras de
 * linha do texto. Palavra maior que a linha vai sozinha (e transborda) — não
 * acontece com texto de contrato, e cortar no meio seria pior.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  widthOf: (text: string) => number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && widthOf(candidate) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** "21/11/2026 às 19:47" no horário de Brasília. */
function acceptedAtLabel(iso: string): string {
  const at = new Date(iso);
  const date = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(at);
  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(at);
  return `${date} às ${time}`;
}

/** Desenha texto corrido página abaixo, abrindo página nova quando acaba. */
class Writer {
  page!: PDFPage;
  y = 0;

  constructor(
    private readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
  ) {
    this.newPage();
  }

  newPage(): void {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - MARGIN;
  }

  private ensure(height: number): void {
    if (this.y - height < MARGIN + FOOTER_SPACE) this.newPage();
  }

  text(
    content: string,
    options: {
      size?: number;
      bold?: boolean;
      color?: typeof INK;
      gap?: number;
    } = {},
  ): void {
    const size = options.size ?? 10.5;
    const font = options.bold ? this.bold : this.regular;
    const lineHeight = size * 1.45;
    const lines = wrapText(toWinAnsi(content), CONTENT_WIDTH, (t) =>
      font.widthOfTextAtSize(t, size),
    );
    for (const line of lines) {
      this.ensure(lineHeight);
      this.y -= lineHeight;
      if (line) {
        this.page.drawText(line, {
          x: MARGIN,
          y: this.y,
          size,
          font,
          color: options.color ?? INK,
        });
      }
    }
    this.y -= options.gap ?? 0;
  }

  /** Título de seção que nunca fica sozinho no pé da página. */
  heading(content: string): void {
    this.ensure(48);
    this.y -= 8;
    this.text(content, { size: 12, bold: true, gap: 4 });
  }

  rule(): void {
    this.ensure(14);
    this.y -= 8;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE.width - MARGIN, y: this.y },
      thickness: 0.6,
      color: RULE,
    });
    this.y -= 6;
  }
}

export async function renderContractPdf(
  contract: Contract,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(contract.title);
  doc.setAuthor(CONTRACTOR);
  doc.setSubject(`Contrato ${contract.id}`);
  doc.setCreationDate(new Date(contract.acceptedAt));

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const writer = new Writer(doc, regular, bold);

  writer.text(CONTRACTOR, { size: 9, color: MUTED, gap: 6 });
  writer.text(contract.title, { size: 17, bold: true, gap: 2 });
  writer.text(`Contrato ${contract.id} · versão ${contract.termsVersion}`, {
    size: 9,
    color: MUTED,
  });
  writer.rule();

  writer.heading('Partes');
  writer.text(`Contratada: ${CONTRACTOR}.`);
  writer.text(
    `Contratante: ${contract.studentName} (${contract.studentEmail}).`,
    { gap: 2 },
  );

  writer.heading('O que foi contratado');
  for (const line of contract.deal) {
    writer.text(`${line.label}: ${line.value}`);
  }

  writer.heading('Resumo');
  writer.text(contract.summary);

  writer.heading('Cláusulas');
  for (const clause of contract.clauses) {
    writer.text(clause.title, { bold: true, gap: 1 });
    writer.text(clause.body, { gap: 6 });
  }

  writer.rule();
  writer.text(
    `Aceito eletronicamente por ${contract.studentName} em ${acceptedAtLabel(
      contract.acceptedAt,
    )} (horário de Brasília), na plataforma, antes do pagamento.`,
    { size: 9.5, color: MUTED },
  );

  const pages = doc.getPages();
  pages.forEach((page, index) => {
    const label = toWinAnsi(
      `${contract.id} · página ${index + 1} de ${pages.length}`,
    );
    page.drawText(label, {
      x: MARGIN,
      y: MARGIN / 2,
      size: 8,
      font: regular,
      color: MUTED,
    });
  });

  return doc.save();
}
