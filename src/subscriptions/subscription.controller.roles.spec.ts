import { SubscriptionController } from './subscription.controller';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ROLES } from '../types/role';

/**
 * Quem pode chamar o quê.
 *
 * A tela de contratos (§7.4) é da gerente e mostra, por aceite, o **texto**
 * aceito — e o texto vem da mesma rota que o aluno lê antes de pagar. Essa rota
 * nasceu marcada só como `STUDENT`, e a tela abria o cartão vazio: 403 no
 * fundo, botão dizendo "ocultar o texto aceito", nada para ocultar.
 *
 * Nenhum teste de unidade pegava isso, porque a falha não estava na lógica e
 * sim no par *tela ↔ permissão*. Daí este arquivo: ele lê o metadado que o
 * guard lê, e amarra o acesso à necessidade da tela.
 */
describe('SubscriptionController — papéis', () => {
  const rolesOf = (method: keyof SubscriptionController): unknown =>
    Reflect.getMetadata(ROLES_KEY, SubscriptionController.prototype[method]);

  it('deixa a gerente ler o contrato de um plano, não só o aluno', () => {
    expect(rolesOf('terms')).toEqual(
      expect.arrayContaining([ROLES.STUDENT, ROLES.MANAGER]),
    );
  });

  it('mantém os aceites só com a gerente', () => {
    // O texto do plano é catálogo e pode ser lido por quem contrata; a lista de
    // quem aceitou é de pessoas, e não sai do lado da gerente.
    expect(rolesOf('acceptances')).toEqual([ROLES.MANAGER]);
  });
});
