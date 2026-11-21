import { PDFDocument } from 'pdf-lib';
import { renderContractPdf, toWinAnsi, wrapText } from './contract-pdf';
import { Contract } from './contract.entity';

/**
 * PDF do contrato (spec 036 §6), gerado da cópia gravada no aceite. As fontes
 * padrão do PDF cobrem o Latin-1: os acentos do PT-BR passam; o resto
 * (emoji, setas) é trocado, nunca derruba a geração.
 */
const contrato = (extra: Partial<Contract> = {}): Contract =>
  new Contract({
    studentId: 'aluno-1',
    studentName: 'Conceição Araújo',
    studentEmail: 'conceicao@x.com',
    kind: 'ENROLLMENT',
    refId: 'mat-1',
    title: 'Matrícula — Grupo semanal · terça 19:00',
    termsVersion: '2026-11-1',
    summary: 'Você reserva a vaga pagando o sinal, que é abatido do plano.',
    clauses: Array.from({ length: 30 }, (_, i) => ({
      title: `${i + 1}. Cláusula com acentuação: ação, opção, café`,
      body: 'Texto longo da cláusula. '.repeat(40),
    })),
    deal: [
      { label: 'Turma', value: 'Grupo semanal · terça 19:00' },
      { label: 'Sinal', value: 'R$ 150,00' },
    ],
    acceptedAt: '2026-11-21T22:47:00.000Z',
    ...extra,
  });

describe('contrato em PDF (spec 036)', () => {
  it('gera um PDF válido, com várias páginas quando o texto é longo', async () => {
    const bytes = await renderContractPdf(contrato());
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(doc.getTitle()).toBe('Matrícula — Grupo semanal · terça 19:00');
    expect(doc.getAuthor()).toBe('Bárbara Farias English Teacher');
  });

  it('caractere fora do Latin-1 não derruba a geração', async () => {
    await expect(
      renderContractPdf(
        contrato({ summary: 'Bem-vinda 🎉 → começo em “dezembro”' }),
      ),
    ).resolves.toBeInstanceOf(Uint8Array);
  });

  it('toWinAnsi mantém os acentos e troca o que a fonte não tem', () => {
    expect(toWinAnsi('ação, café, Conceição — “aspas” · ok')).toBe(
      'ação, café, Conceição — “aspas” · ok',
    );
    expect(toWinAnsi('seta → e emoji 🎉')).toBe('seta -> e emoji ?');
  });

  it('wrapText quebra por palavra sem passar da largura', () => {
    const width = (text: string) => text.length;
    const linhas = wrapText('um dois três quatro cinco seis', 10, width);
    expect(linhas).toEqual(['um dois', 'três', 'quatro', 'cinco seis']);
    expect(linhas.every((linha) => linha.length <= 10)).toBe(true);
  });

  it('wrapText respeita as quebras de linha do texto', () => {
    expect(wrapText('a\n\nb', 10, (t) => t.length)).toEqual(['a', '', 'b']);
  });
});
