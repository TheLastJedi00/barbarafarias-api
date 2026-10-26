import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';
import { BrandIdentity, DEFAULT_IDENTITY_ID } from './brand-identity.model';
import { BrandIdentityRepository } from './brand-identity.repository';
import {
  DEFAULT_IDENTITY_CONTENT,
  DEFAULT_IDENTITY_NAME,
} from './default-identity';
import type {
  CreateIdentityDto,
  UpdateIdentityDto,
} from './dto/brand-identity.dto';

/**
 * Identidades visuais da Campanha (spec 031 §2). A padrão é criada na
 * primeira leitura, pode ser editada e restaurada, mas não apagada.
 */
@Injectable()
export class BrandIdentityService {
  constructor(private readonly repository: BrandIdentityRepository) {}

  /** Padrão primeiro; as demais em ordem alfabética. */
  async list(): Promise<BrandIdentity[]> {
    await this.ensureDefault();
    const all = await this.repository.list();
    return all.sort((a, b) =>
      a.isDefault !== b.isDefault
        ? a.isDefault
          ? -1
          : 1
        : a.name.localeCompare(b.name, 'pt-BR'),
    );
  }

  async create(
    dto: CreateIdentityDto,
    user: AuthenticatedUser,
  ): Promise<BrandIdentity> {
    const name = dto.name.trim();
    await this.assertUniqueName(name);
    const now = new Date().toISOString();
    return this.repository.create({
      name,
      isDefault: false,
      content: dto.content,
      createdBy: user.sub,
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(
    id: string,
    dto: UpdateIdentityDto,
    user: AuthenticatedUser,
  ): Promise<BrandIdentity> {
    const current = await this.getOrThrow(id);
    const name = dto.name?.trim() ?? current.name;
    if (normalize(name) !== normalize(current.name)) {
      await this.assertUniqueName(name, id);
    }
    const updated: BrandIdentity = {
      ...current,
      name,
      content: dto.content ?? current.content,
      updatedAt: new Date().toISOString(),
      updatedBy: user.sub,
    };
    await this.repository.save(updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const current = await this.getOrThrow(id);
    if (current.isDefault) {
      throw new ConflictException(
        'A identidade padrão não pode ser apagada. Use "Restaurar original".',
      );
    }
    await this.repository.delete(id);
  }

  /** Volta a padrão ao texto do código, mantendo quando ela foi criada. */
  async resetDefault(user: AuthenticatedUser): Promise<BrandIdentity> {
    const current = await this.ensureDefault();
    const reset: BrandIdentity = {
      ...current,
      name: DEFAULT_IDENTITY_NAME,
      content: DEFAULT_IDENTITY_CONTENT,
      updatedAt: new Date().toISOString(),
      updatedBy: user.sub,
    };
    await this.repository.save(reset);
    return reset;
  }

  /** A identidade de uma geração: a escolhida ou, sem id, a padrão. */
  async resolve(id?: string): Promise<BrandIdentity> {
    return id ? this.getOrThrow(id) : this.ensureDefault();
  }

  private ensureDefault(): Promise<BrandIdentity> {
    const now = new Date().toISOString();
    return this.repository.ensureDefault({
      id: DEFAULT_IDENTITY_ID,
      name: DEFAULT_IDENTITY_NAME,
      isDefault: true,
      content: DEFAULT_IDENTITY_CONTENT,
      createdBy: 'system',
      createdAt: now,
      updatedAt: now,
    });
  }

  private async getOrThrow(id: string): Promise<BrandIdentity> {
    const identity = await this.repository.get(id);
    if (!identity) throw new NotFoundException('Identidade não encontrada.');
    return identity;
  }

  private async assertUniqueName(name: string, exceptId?: string) {
    await this.ensureDefault();
    const taken = (await this.repository.list()).some(
      (other) =>
        other.id !== exceptId && normalize(other.name) === normalize(name),
    );
    if (taken) {
      throw new ConflictException('Já existe uma identidade com esse nome.');
    }
  }
}

/** "Verão" e "verao" são o mesmo nome para quem procura na lista. */
function normalize(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}
