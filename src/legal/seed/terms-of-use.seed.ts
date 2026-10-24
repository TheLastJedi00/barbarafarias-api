import type { LegalSeed } from './legal-seed';

/**
 * Texto da versão 1.0 — Termos de Uso (spec 029). **Só semente:** o
 * `POST /legal/admin/seed` publica isto uma vez, e daí em diante o banco é a
 * fonte e toda mudança passa pelo Painel Jurídico. Editar aqui depois da
 * semeadura não muda nada no ar.
 *
 * Origem: `.claude/specs/029 - Painel Jurídico/termos-de-uso.md`.
 */
export const TERMS_OF_USE_SEED: LegalSeed = {
  type: 'terms-of-use',
  title: 'Termos de Uso',
  markdown: `Estes Termos regulam o uso da plataforma barbarafarias.com.br, mantida pela escola de inglês
**Bárbara Farias** ("**escola**", "**nós**"), por alunos, responsáveis, professoras, gerência,
candidatos a vagas e visitantes ("**você**").

Ao criar conta ou continuar usando a plataforma depois de aceitar estes Termos, você declara que os
leu, compreendeu e concorda com eles. O aceite é registrado com data, hora, versão, endereço IP e
navegador utilizado. Se não concordar, não utilize a área logada.

Estes Termos se somam à **Política de Privacidade**, que explica como tratamos os seus dados, e, para
quem contrata um plano, ao **contrato do plano** aceito no momento da compra. Em caso de conflito
sobre condições comerciais (preço, forma de pagamento, duração, cancelamento), prevalece o contrato
do plano, **ressalvados os direitos que a lei assegura ao consumidor**, como o de arrependimento
(item 3.5), que nenhuma cláusula afasta.

---

## 1. O que a plataforma oferece

- **Para alunos:** painel com aulas e agenda, conteúdo personalizado por nível, vídeo aulas com
  materiais de apoio, artigos, edição do próprio perfil e gestão do plano contratado.
- **Para professoras:** organização de alunos, agenda, aulas, geração e consulta de material e
  acompanhamento de repasses.
- **Para a gerência:** administração da escola, da equipe, do financeiro e do recrutamento.
- **Para candidatos:** cadastro no banco de talentos e candidatura a vagas (área Trabalhe Conosco).
- **Para visitantes:** páginas informativas sobre a escola e os cursos.

Funcionalidades podem ser criadas, alteradas ou retiradas para melhorar o serviço, preservado o que
foi contratado no plano vigente.

## 2. Cadastro e conta

1. As informações do cadastro devem ser verdadeiras, completas e atualizadas. Você responde pelos
   dados que informar.
2. A conta é **pessoal e intransferível**. Guarde a senha em sigilo; o que for feito com a sua conta
   é presumido como feito por você, salvo prova em contrário. Avise-nos imediatamente em caso de uso
   não autorizado.
3. **Menores de 18 anos** só usam a plataforma com a contratação e o aceite feitos por pai, mãe ou
   responsável legal, que responde pelo uso e acompanha a conta do aluno.
4. Alunos são cadastrados pela escola a partir da matrícula; o primeiro acesso é feito pelo convite
   enviado por e-mail. Professoras são cadastradas pela gerência. Candidatos se cadastram pela área
   Trabalhe Conosco.

## 3. Planos, pagamentos e acesso ao conteúdo

1. O acesso ao conteúdo pago depende de plano ativo. Preço, forma de pagamento, duração, renovação e
   cancelamento estão no **contrato do plano** apresentado e aceito antes da compra.
2. Os pagamentos são processados pelo **Mercado Pago**; os dados do cartão são digitados diretamente
   no ambiente dele e não passam pela escola.
3. Com o pagamento pendente, o conteúdo pago fica bloqueado até a regularização; a tela do plano
   continua disponível para isso.
4. **Reembolsos:** pedidos de reembolso são analisados e negociados diretamente com a gestão da
   escola, pelo e-mail do item 12, informando o nome do aluno, o plano e o motivo. A resposta indica
   se há valor a devolver, quanto e como.
5. **Direito de arrependimento:** fica sempre ressalvado o direito de desistir da contratação feita
   pela internet em até **7 dias**, com devolução dos valores pagos (art. 49 do Código de Defesa do
   Consumidor). Esse pedido também é feito pelo e-mail do item 12.

## 4. Aulas

1. Os horários das aulas são combinados com a escola e aparecem na agenda do painel.
2. Faltas, cancelamentos e reposições seguem as regras informadas pela escola e registradas na
   plataforma. Pedidos de reagendamento passam pela aprovação da gerência.
3. As aulas ao vivo acontecem em sala virtual cujo link é liberado na janela da aula. O link é
   pessoal: não o compartilhe.
4. A escola não garante resultado específico de aprendizagem, que depende também da dedicação e da
   frequência do aluno; garante a prestação das aulas e do material conforme o plano.

## 5. Conteúdo e propriedade intelectual

1. Aulas, vídeo aulas, materiais de apoio, material personalizado, artigos, marca, logotipo, layout
   e código da plataforma pertencem à escola ou a quem a licenciou, e são protegidos pela Lei
   nº 9.610/1998 (direitos autorais) e pela Lei nº 9.279/1996 (propriedade industrial).
2. O acesso é concedido para **uso pessoal e não comercial**, durante a vigência do plano. É proibido
   copiar, gravar, baixar por meios não oferecidos pela plataforma, redistribuir, revender, publicar
   ou compartilhar o conteúdo, inclusive com outras pessoas da mesma casa.
3. Materiais oferecidos para download servem ao estudo do próprio aluno.
4. O material personalizado é gerado com apoio de inteligência artificial e acompanhado pela
   professora. Erros pontuais podem ocorrer; avise a sua professora se encontrar algum.

## 6. Conduta

Ao usar a plataforma, você se compromete a não:

- usar a conta de outra pessoa ou permitir que outra pessoa use a sua;
- tentar acessar áreas, dados ou contas que não são suas, ou burlar limites técnicos e de segurança;
- enviar conteúdo ilegal, ofensivo, discriminatório, que viole direitos de terceiros ou que contenha
  código malicioso;
- usar robôs, raspagem automatizada ou qualquer meio que sobrecarregue a plataforma;
- desrespeitar professoras, alunos ou a equipe em aulas, comentários e avaliações.

Avaliações e comentários sobre aulas devem ser verdadeiros e respeitosos; podemos removê-los quando
violarem estes Termos.

## 7. Suspensão e encerramento

1. Podemos suspender ou encerrar a conta que viole estes Termos, a lei ou o contrato do plano, com
   aviso prévio sempre que possível e sem prejuízo das medidas legais cabíveis.
2. Você pode pedir o encerramento da conta a qualquer tempo pelo e-mail do item 12; as condições
   financeiras de um plano em curso seguem o contrato do plano.
3. Encerrada a conta, os dados seguem os prazos da Política de Privacidade.

## 8. Disponibilidade da plataforma

Trabalhamos para manter a plataforma disponível e segura, mas ela pode passar por manutenções,
atualizações ou instabilidades de prestadores (hospedagem, pagamento, vídeo). Manutenções programadas
são feitas, sempre que possível, fora do horário das aulas. Interrupções que impeçam aulas
contratadas são compensadas com reposição.

## 9. Responsabilidade

1. A escola responde pelos serviços que presta nos termos do Código de Defesa do Consumidor.
2. Não respondemos por danos causados por uso indevido da conta pelo próprio usuário, por falhas de
   equipamento ou conexão do usuário, nem por conteúdo de sites de terceiros acessados por links.
3. Nada nestes Termos limita direitos que a lei assegura ao consumidor.

## 10. Professoras e candidatos

- **Professoras:** a relação de trabalho ou de prestação de serviços com a escola é regida pelo
  contrato próprio. Estes Termos regulam apenas o uso da plataforma, inclusive o sigilo sobre os
  dados dos alunos a que tiverem acesso, que só podem ser usados para as aulas.
- **Candidatos:** o uso da área Trabalhe Conosco segue também o termo específico do processo
  seletivo. Cadastro no banco de talentos não gera vínculo nem garantia de contratação.

## 11. Alterações destes Termos

Estes Termos podem ser atualizados. A versão e a data de vigência ficam sempre no topo, e as versões
anteriores continuam disponíveis para consulta. Em mudança relevante, pediremos um novo aceite no seu
próximo acesso; sem o aceite, o uso da área logada fica indisponível.

## 12. Contato

Dúvidas, pedidos (inclusive de reembolso, de arrependimento e de encerramento de conta) e
reclamações:
**barbsenglishteacher@gmail.com**.

## 13. Legislação e foro

Estes Termos são regidos pela legislação brasileira. Fica eleito o foro do domicílio do consumidor
para dirimir questões deles decorrentes.
`,
};
