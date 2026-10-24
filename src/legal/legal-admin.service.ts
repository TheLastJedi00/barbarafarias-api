import { ConflictException, Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { UserRepository } from '../users/user.repository';
import { CandidateRepository } from '../recruitment/candidate.repository';
import { ROLES, type Role } from '../types/role';
import { LegalRepository } from './legal.repository';
import { assertType } from './legal.service';
import { compareVersions, nextVersion } from './legal-version';
import { PublishDto, SaveDraftDto } from './dto/legal.dto';
import {
  LEGAL_DOCUMENT_TITLES,
  LEGAL_DOCUMENT_TYPES,
  LegalDocumentType,
  LegalVersion,
  requiredTypesFor,
} from './legal.model';

/** O que o editor abre: o rascunho salvo ou um novo a partir da vigente. */
export interface DraftView {
  type: LegalDocumentType;
  title: string;
  markdown: string;
  basedOnVersion: string | null;
  /** `false` = ainda não foi salvo (é a vigente, ou um documento em branco). */
  saved: boolean;
  updatedAt: string | null;
}

/** Linha do painel: um documento com a situação dele. */
export interface DocumentOverview {
  type: LegalDocumentType;
  title: string;
  publishedVersion: string | null;
  requiredVersion: string | null;
  effectiveDate: string | null;
  hasDraft: boolean;
  draftUpdatedAt: string | null;
  pendingCount: number;
}

export interface AcceptanceRow {
  userId: string;
  name: string;
  role: Role;
  version: string;
  acceptedAt: string;
}

export interface PendingRow {
  userId: string;
  name: string;
  role: Role;
}

export interface AcceptancesView {
  type: LegalDocumentType;
  requiredVersion: string | null;
  accepted: AcceptanceRow[];
  pending: PendingRow[];
}

interface Person {
  id: string;
  name: string;
  role: Role;
}

/**
 * Painel Jurídico da gerente (spec 029 §2): rascunho, publicação e quem
 * aceitou. Versão publicada nunca é alterada — publicar sempre cria a seguinte.
 */
@Injectable()
export class LegalAdminService {
  constructor(
    private readonly repository: LegalRepository,
    private readonly users: UserRepository,
    private readonly candidates: CandidateRepository,
  ) {}

  async overview(): Promise<DocumentOverview[]> {
    return Promise.all(
      LEGAL_DOCUMENT_TYPES.map(async (type) => {
        const [header, draft, acceptances] = await Promise.all([
          this.repository.getDocument(type),
          this.repository.getDraft(type),
          this.getAcceptances(type),
        ]);
        const current = header?.publishedVersion
          ? await this.repository.getVersion(type, header.publishedVersion)
          : null;
        return {
          type,
          title: header?.title ?? LEGAL_DOCUMENT_TITLES[type],
          publishedVersion: header?.publishedVersion ?? null,
          requiredVersion: header?.requiredVersion ?? null,
          effectiveDate: current?.effectiveDate ?? null,
          hasDraft: Boolean(draft),
          draftUpdatedAt: draft?.updatedAt ?? null,
          pendingCount: acceptances.pending.length,
        };
      }),
    );
  }

  async getDraft(rawType: string): Promise<DraftView> {
    const type = assertType(rawType);
    const draft = await this.repository.getDraft(type);
    if (draft) {
      return {
        type,
        title: draft.title,
        markdown: draft.markdown,
        basedOnVersion: draft.basedOnVersion,
        saved: true,
        updatedAt: draft.updatedAt,
      };
    }

    const current = await this.currentVersion(type);
    return {
      type,
      title: current?.title ?? LEGAL_DOCUMENT_TITLES[type],
      markdown: current?.markdown ?? '',
      basedOnVersion: current?.version ?? null,
      saved: false,
      updatedAt: null,
    };
  }

  async saveDraft(
    rawType: string,
    dto: SaveDraftDto,
    user: AuthenticatedUser,
  ): Promise<DraftView> {
    const type = assertType(rawType);
    const existing = await this.repository.getDraft(type);
    const basedOnVersion =
      existing?.basedOnVersion ??
      (await this.repository.getDocument(type))?.publishedVersion ??
      null;

    const updatedAt = new Date().toISOString();
    const draft = {
      type,
      title: dto.title.trim(),
      markdown: dto.markdown,
      basedOnVersion,
      updatedAt,
      updatedBy: user.sub,
    };
    await this.repository.saveDraft(draft);
    return { ...draft, saved: true };
  }

  async discardDraft(rawType: string): Promise<void> {
    await this.repository.deleteDraft(assertType(rawType));
  }

  /**
   * Publica o rascunho como a versão seguinte (context §1). A primeira versão
   * sempre exige aceite: ninguém aceitou nada ainda.
   */
  async publish(
    rawType: string,
    dto: PublishDto,
    user: AuthenticatedUser,
  ): Promise<LegalVersion> {
    const type = assertType(rawType);
    const draft = await this.repository.getDraft(type);
    if (!draft) {
      throw new ConflictException(
        'Não há rascunho para publicar. Edite o documento e salve antes.',
      );
    }
    if (!draft.markdown.trim()) {
      throw new ConflictException('O texto do documento está vazio.');
    }

    const write = await this.repository.publish(type, (current) => {
      const isFirst = !current?.publishedVersion;
      const requiresReacceptance = isFirst || dto.requiresReacceptance;
      const version = nextVersion(
        current?.publishedVersion ?? null,
        requiresReacceptance,
      );
      const now = new Date().toISOString();
      return {
        version: {
          type,
          version,
          title: draft.title,
          markdown: draft.markdown,
          effectiveDate: dto.effectiveDate,
          requiresReacceptance,
          ...(dto.changeNote?.trim()
            ? { changeNote: dto.changeNote.trim() }
            : {}),
          publishedAt: now,
          publishedBy: user.sub,
        },
        header: {
          type,
          title: draft.title,
          publishedVersion: version,
          requiredVersion: requiresReacceptance
            ? version
            : (current?.requiredVersion ?? version),
          updatedAt: now,
        },
      };
    });
    return write.version;
  }

  /**
   * Quem aceitou a versão exigida e quem falta (context §2). Quem deve aceitar
   * sai do papel: alunos, professoras e gerentes em `users`, candidatos em
   * `candidates`.
   */
  async getAcceptances(rawType: string): Promise<AcceptancesView> {
    const type = assertType(rawType);
    const header = await this.repository.getDocument(type);
    const requiredVersion = header?.requiredVersion ?? null;
    if (!requiredVersion) {
      return { type, requiredVersion: null, accepted: [], pending: [] };
    }

    const [people, acceptances] = await Promise.all([
      this.peopleWhoMustAccept(type),
      this.repository.findAcceptancesByType(type),
    ]);

    // Por pessoa, o aceite mais recente que cobre a versão exigida.
    const latest = new Map<string, (typeof acceptances)[number]>();
    for (const a of acceptances) {
      if (compareVersions(a.version, requiredVersion) < 0) continue;
      const seen = latest.get(a.userId);
      if (!seen || compareVersions(a.version, seen.version) > 0) {
        latest.set(a.userId, a);
      }
    }

    const accepted: AcceptanceRow[] = [];
    const pending: PendingRow[] = [];
    for (const person of people) {
      const a = latest.get(person.id);
      if (a) {
        accepted.push({
          userId: person.id,
          name: person.name,
          role: person.role,
          version: a.version,
          acceptedAt: a.acceptedAt,
        });
      } else {
        pending.push({
          userId: person.id,
          name: person.name,
          role: person.role,
        });
      }
    }
    accepted.sort((x, y) => y.acceptedAt.localeCompare(x.acceptedAt));
    pending.sort((x, y) => x.name.localeCompare(y.name, 'pt-BR'));
    return { type, requiredVersion, accepted, pending };
  }

  private async currentVersion(
    type: LegalDocumentType,
  ): Promise<LegalVersion | null> {
    const header = await this.repository.getDocument(type);
    return header?.publishedVersion
      ? this.repository.getVersion(type, header.publishedVersion)
      : null;
  }

  private async peopleWhoMustAccept(
    type: LegalDocumentType,
  ): Promise<Person[]> {
    const schoolRoles = [ROLES.STUDENT, ROLES.TEACHER, ROLES.MANAGER].filter(
      (role) => requiredTypesFor(role).includes(type),
    );
    const [schoolLists, candidates] = await Promise.all([
      Promise.all(schoolRoles.map((role) => this.users.findAll(role))),
      requiredTypesFor(ROLES.CANDIDATE).includes(type)
        ? this.candidates.findAll()
        : Promise.resolve([]),
    ]);

    const school: Person[] = schoolLists.flatMap((list, index) =>
      list
        .filter((user) => Boolean(user.id))
        .map((user) => ({
          id: user.id!,
          name: user.fullName || user.email || user.id!,
          role: schoolRoles[index],
        })),
    );
    return [
      ...school,
      ...candidates.map((c) => ({
        id: c.id,
        name: c.name,
        role: ROLES.CANDIDATE,
      })),
    ];
  }
}
