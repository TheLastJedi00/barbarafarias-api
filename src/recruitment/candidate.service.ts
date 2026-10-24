import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../auth/auth.service';
import { StorageService } from '../uploads/storage.service';
import { ROLES } from '../types/role';
import { ApplicationRepository } from './application.repository';
import { CandidateRepository } from './candidate.repository';
import {
  CandidateSignupDto,
  ConsentDto,
  ResumeUploadDto,
  UpdateCandidateDto,
} from './dto/candidate.dto';
import {
  Candidate,
  CandidateView,
  RECRUITMENT_TERMS_VERSION,
  RESUME_MAX_BYTES,
  RESUME_MIME_TYPE,
  toCandidateView,
} from './candidate.model';

/** Validade do link de download do currículo (spec 028 §4). */
export const RESUME_DOWNLOAD_TTL_MS = 15 * 60 * 1000;

const RESUME_RULE_MESSAGE = 'Envie o currículo em PDF, com até 5 MB.';

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

  async getMe(id: string): Promise<CandidateView> {
    return toCandidateView(await this.getOrThrow(id));
  }

  /** E-mail fica de fora: trocar o login é outro fluxo, que não existe aqui. */
  async updateMe(id: string, dto: UpdateCandidateDto): Promise<CandidateView> {
    const current = await this.getOrThrow(id);
    const candidate: Candidate = {
      ...current,
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
      updatedAt: new Date().toISOString(),
    };
    if (dto.linkedinUrl !== undefined) {
      if (dto.linkedinUrl) candidate.linkedinUrl = dto.linkedinUrl;
      else delete candidate.linkedinUrl;
    }
    await this.candidates.save(candidate);
    return toCandidateView(candidate);
  }

  /** Aceite da versão vigente do termo, quando ela muda (termo §11). */
  async acceptTerms(id: string, dto: ConsentDto): Promise<CandidateView> {
    // O DTO já exige `true`; conferir de novo deixa a regra no lugar dela.
    if (!dto.acceptTerms) {
      throw new BadRequestException(
        'É preciso aceitar o Termo de Tratamento de Dados',
      );
    }
    const now = new Date().toISOString();
    const candidate: Candidate = {
      ...(await this.getOrThrow(id)),
      consentAt: now,
      consentVersion: RECRUITMENT_TERMS_VERSION,
      updatedAt: now,
    };
    await this.candidates.save(candidate);
    return toCandidateView(candidate);
  }

  /**
   * Sessão de upload direto ao Storage (mesmo caminho das vídeo aulas, spec
   * 027). O caminho é único por envio: o currículo vigente só é trocado no
   * `complete`, então um envio abandonado não apaga o anterior.
   */
  async requestResumeUpload(
    id: string,
    dto: ResumeUploadDto,
    origin?: string,
  ): Promise<{ uploadUrl: string }> {
    if (dto.mimeType !== RESUME_MIME_TYPE || dto.size > RESUME_MAX_BYTES) {
      throw new BadRequestException(RESUME_RULE_MESSAGE);
    }
    const current = await this.getOrThrow(id);
    const storagePath = `candidates/${id}/resume-${randomUUID()}.pdf`;
    const uploadUrl = await this.storage.createUploadSession(
      storagePath,
      RESUME_MIME_TYPE,
      origin,
    );

    await this.candidates.save({
      ...current,
      pendingResume: {
        storagePath,
        fileName: dto.fileName,
        mimeType: RESUME_MIME_TYPE,
        size: dto.size,
      },
      updatedAt: new Date().toISOString(),
    });
    return { uploadUrl };
  }

  /**
   * Confere o que **chegou** ao bucket — não o que o navegador disse que ia
   * mandar — e só então troca o currículo. Fora da regra, o objeto é apagado
   * e o currículo anterior continua valendo.
   */
  async completeResumeUpload(id: string): Promise<CandidateView> {
    const current = await this.getOrThrow(id);
    const pending = current.pendingResume;
    if (!pending) {
      throw new ConflictException(
        'Nenhum envio de currículo em andamento. Selecione o arquivo de novo.',
      );
    }

    const info = await this.storage.getObjectInfo(pending.storagePath);
    if (!info) {
      throw new ConflictException(
        'O arquivo ainda não chegou ao armazenamento. Envie o currículo de novo.',
      );
    }

    const rest: Candidate = { ...current };
    delete rest.pendingResume;
    const now = new Date().toISOString();
    if (info.size > RESUME_MAX_BYTES || info.contentType !== RESUME_MIME_TYPE) {
      await this.storage.remove(pending.storagePath);
      await this.candidates.save({ ...rest, updatedAt: now });
      throw new BadRequestException(RESUME_RULE_MESSAGE);
    }

    const candidate: Candidate = {
      ...rest,
      resume: { ...pending, size: info.size, uploadedAt: now },
      updatedAt: now,
    };
    await this.candidates.save(candidate);
    if (current.resume && current.resume.storagePath !== pending.storagePath) {
      await this.storage.remove(current.resume.storagePath);
    }
    return toCandidateView(candidate);
  }

  /** Link que expira em 15 min, com o nome original do arquivo. */
  async resumeDownloadUrl(id: string): Promise<{ url: string }> {
    const { resume } = await this.getOrThrow(id);
    if (!resume) throw new NotFoundException('Nenhum currículo enviado');
    const url = await this.storage.signedReadUrl(
      resume.storagePath,
      RESUME_DOWNLOAD_TTL_MS,
      resume.fileName,
    );
    return { url };
  }

  async getOrThrow(id: string): Promise<Candidate> {
    const candidate = await this.candidates.findById(id);
    if (!candidate) throw new NotFoundException('Candidato não encontrado');
    return candidate;
  }
}
