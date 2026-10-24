import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../auth/auth.service';
import { StorageService } from '../uploads/storage.service';
import { ROLES } from '../types/role';
import { ApplicationRepository } from './application.repository';
import { CandidateRepository } from './candidate.repository';
import { CandidateSignupDto } from './dto/candidate.dto';
import {
  Candidate,
  CandidateView,
  RECRUITMENT_TERMS_VERSION,
  toCandidateView,
} from './candidate.model';

/**
 * Conta de candidato do Trabalhe Conosco (spec 028): cadastro público, dados,
 * currículo e exclusão pelo titular.
 */
@Injectable()
export class CandidateService {
  constructor(
    private readonly candidates: CandidateRepository,
    private readonly authService: AuthService,
    private readonly storage: StorageService,
    private readonly applications: ApplicationRepository,
  ) {}

  /**
   * Primeiro cadastro público do produto. Mesmo desenho do convite: o uid é
   * gerado aqui e vira o id do doc, e a conta no Firebase é desfeita se o doc
   * não gravar — nada de conta órfã que logaria sem perfil.
   *
   * E-mail já usado (aluno, professora ou outro candidato) volta 409 do
   * `createAccount`: uma pessoa, um papel.
   */
  async signup(dto: CandidateSignupDto): Promise<CandidateView> {
    const uid = randomUUID();
    await this.authService.createAccount({
      uid,
      email: dto.email,
      password: dto.password,
      role: ROLES.CANDIDATE,
    });

    const now = new Date().toISOString();
    const candidate: Candidate = {
      id: uid,
      email: dto.email,
      name: dto.name,
      phone: dto.phone,
      ...(dto.linkedinUrl ? { linkedinUrl: dto.linkedinUrl } : {}),
      consentAt: now,
      consentVersion: RECRUITMENT_TERMS_VERSION,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await this.candidates.save(candidate);
    } catch (error) {
      await this.authService.deleteAccount(uid);
      throw error;
    }
    return toCandidateView(candidate);
  }
}
