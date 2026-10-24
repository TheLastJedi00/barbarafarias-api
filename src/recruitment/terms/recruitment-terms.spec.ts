import { NotFoundException } from '@nestjs/common';
import { RECRUITMENT_TERMS_VERSION } from '../candidate.model';
import { RecruitmentTermsController } from './recruitment-terms.controller';
import {
  RECRUITMENT_TERMS,
  currentTerms,
  termsByVersion,
} from './recruitment-terms';

describe('Termo de tratamento de dados do recrutamento (spec 028)', () => {
  it('a versão vigente é a que o aceite grava', () => {
    expect(currentTerms().version).toBe(RECRUITMENT_TERMS_VERSION);
  });

  it('toda versão publicada tem título, vigência e texto', () => {
    for (const terms of RECRUITMENT_TERMS) {
      expect(terms.title).toBeTruthy();
      expect(terms.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(terms.markdown.length).toBeGreaterThan(1000);
    }
  });

  it('versões não se repetem — o aceite aponta para uma só', () => {
    const versions = RECRUITMENT_TERMS.map((t) => t.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('o texto traz o canal do encarregado e os direitos da LGPD', () => {
    const { markdown } = currentTerms();
    expect(markdown).toContain('barbsenglishteacher@gmail.com');
    expect(markdown).toContain('art. 18');
  });

  it('busca por versão e recusa versão desconhecida', () => {
    expect(termsByVersion('1.0')?.version).toBe('1.0');
    expect(termsByVersion('9.9')).toBeNull();
  });

  describe('controller', () => {
    const controller = new RecruitmentTermsController();

    it('GET /recruitment/terms devolve a vigente', () => {
      expect(controller.current().version).toBe(RECRUITMENT_TERMS_VERSION);
    });

    it('GET /recruitment/terms/:version devolve a pedida ou 404', () => {
      expect(controller.byVersion('1.0').version).toBe('1.0');
      expect(() => controller.byVersion('9.9')).toThrow(NotFoundException);
    });
  });
});
