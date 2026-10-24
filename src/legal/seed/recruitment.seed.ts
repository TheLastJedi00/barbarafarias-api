import type { LegalSeed } from './legal-seed';

/**
 * Texto da versão 1.0 — Termo de Privacidade e Tratamento de Dados Pessoais — Processo Seletivo (spec 029). **Só semente:** o
 * `POST /legal/admin/seed` publica isto uma vez, e daí em diante o banco é a
 * fonte e toda mudança passa pelo Painel Jurídico. Editar aqui depois da
 * semeadura não muda nada no ar.
 *
 * Origem: `.claude/specs/028 - Trabalhe Conosco/termo-de-tratamento-de-dados.md`.
 */
export const RECRUITMENT_SEED: LegalSeed = {
  type: 'recruitment',
  title:
    'Termo de Privacidade e Tratamento de Dados Pessoais — Processo Seletivo',
  markdown: `Este Termo explica como os dados pessoais de quem se cadastra na área **Trabalhe Conosco** do site
barbarafarias.com.br são coletados, usados, armazenados, compartilhados e eliminados, nos termos da
Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais — **LGPD**).

Ao criar a conta de candidato e marcar a caixa de aceite, você declara que leu e compreendeu este
Termo. O aceite é registrado com data, hora e a versão do Termo aceita.

---

## 1. Quem é o controlador dos dados

O controlador dos dados pessoais tratados no processo seletivo é a escola **Bárbara Farias**
("**nós**"). O encarregado pelo tratamento de dados (DPO) atende pelo e-mail
**barbsenglishteacher@gmail.com**, canal pelo qual você exerce os seus direitos (item 8) e tira
dúvidas sobre este Termo.

## 2. Quais dados coletamos

Coletamos apenas os dados necessários ao processo seletivo:

| dado | obrigatório | origem |
|---|---|---|
| Nome completo | sim | informado por você |
| E-mail | sim | informado por você |
| Senha de acesso | sim | informada por você; armazenada apenas de forma cifrada pelo provedor de autenticação, sem acesso da nossa equipe |
| Telefone | sim | informado por você |
| Perfil do LinkedIn | não | informado por você |
| Currículo (arquivo PDF) | para se candidatar a uma vaga | enviado por você |
| Vagas a que você se candidatou e a etapa de cada candidatura | — | gerado pelo uso da plataforma |
| Registro do aceite deste Termo (data, hora e versão) | — | gerado pelo uso da plataforma |
| Dados técnicos de acesso (endereço IP, data e hora, cookie de sessão) | — | gerados automaticamente |

**Dados sensíveis.** Não pedimos dados pessoais sensíveis (origem racial ou étnica, convicção
religiosa, opinião política, filiação sindical, dados de saúde, vida sexual, dados genéticos ou
biométricos). **Recomendamos que você não os inclua no currículo.** Se ainda assim incluir, eles
serão tratados apenas para a finalidade deste Termo, com base no seu consentimento específico e
destacado (art. 11, I, da LGPD), que você manifesta ao enviar o arquivo e pode revogar a qualquer
momento.

**Menores de idade.** A área Trabalhe Conosco é destinada a pessoas com **18 anos ou mais**. Não
coletamos intencionalmente dados de crianças e adolescentes; se identificarmos um cadastro nessa
situação, ele será eliminado.

## 3. Para que usamos os dados (finalidades)

1. Criar e manter a sua conta de candidato e autenticar o seu acesso.
2. Avaliar o seu perfil para as vagas a que você se candidatar.
3. Manter o seu perfil no **banco de talentos**, para que possamos considerá-lo em oportunidades
   futuras, inclusive quando não houver vaga aberta.
4. Entrar em contato com você sobre o processo seletivo (agendamento de entrevista, retorno sobre
   a candidatura).
5. Enviar avisos por e-mail sobre mudanças de etapa das suas candidaturas.
6. Garantir a segurança da plataforma, prevenir fraudes e abusos (por exemplo, limitar tentativas
   de cadastro e de login) e cumprir obrigações legais.

**Não** usamos os seus dados para publicidade, **não** os vendemos e **não** tomamos decisões
exclusivamente automatizadas sobre a sua candidatura: toda avaliação é feita por uma pessoa da
nossa equipe.

## 4. Bases legais

| finalidade | base legal (LGPD) |
|---|---|
| Conta, avaliação para vagas específicas e contato sobre a candidatura (itens 3.1, 3.2, 3.4 e 3.5) | execução de procedimentos preliminares relacionados a contrato, a pedido do titular (art. 7º, V) |
| Banco de talentos (item 3.3) | consentimento (art. 7º, I) |
| Dados sensíveis eventualmente incluídos no currículo | consentimento específico e destacado (art. 11, I) |
| Segurança, prevenção a fraudes e registros de acesso (item 3.6) | legítimo interesse (art. 7º, IX) e cumprimento de obrigação legal (art. 7º, II), incluindo a guarda de registros de acesso exigida pelo Marco Civil da Internet (Lei nº 12.965/2014, art. 15) |
| Defesa em processos judiciais, administrativos ou arbitrais | exercício regular de direitos (art. 7º, VI) |

O consentimento pode ser revogado a qualquer momento (item 8). A revogação não afeta a validade do
tratamento realizado antes dela.

## 5. Com quem compartilhamos

Os dados são acessados **apenas pela gerência da escola** responsável pelo recrutamento.
**Professoras e alunos da plataforma não têm acesso** aos dados de candidatos.

Para operar a plataforma, contamos com prestadores de serviço (operadores) que tratam os dados
exclusivamente sob nossas instruções:

| operador | serviço |
|---|---|
| Google LLC (Firebase / Google Cloud) | autenticação de contas, banco de dados e armazenamento do currículo |
| Vercel Inc. | hospedagem da aplicação (servidor) |
| Resend, Inc. | envio de e-mails transacionais |

Os dados também poderão ser compartilhados com autoridades públicas quando houver obrigação legal,
regulatória ou ordem judicial.

## 6. Transferência internacional

Esses operadores podem armazenar ou processar dados em servidores localizados fora do Brasil,
inclusive nos Estados Unidos. A transferência ocorre nas hipóteses do art. 33 da LGPD, com
fornecedores que adotam cláusulas contratuais de proteção de dados e padrões de segurança
compatíveis com a lei brasileira.

## 7. Por quanto tempo guardamos

- **Conta, perfil, currículo e candidaturas:** enquanto a sua conta existir. Você pode excluí-los
  a qualquer momento (item 8). Contas sem acesso por **24 meses** poderão ser eliminadas.
- **Vaga excluída:** as candidaturas a ela são eliminadas; o seu perfil continua no banco de
  talentos.
- **Registros de acesso:** pelo prazo de **6 meses** exigido pelo Marco Civil da Internet.
- **Após a exclusão:** os dados são eliminados de forma definitiva dos nossos sistemas, salvo o que
  precisar ser mantido para cumprimento de obrigação legal ou exercício regular de direitos
  (art. 16 da LGPD), pelo prazo estritamente necessário. Cópias de segurança dos provedores são
  sobrescritas nos ciclos regulares deles.

## 8. Seus direitos

Nos termos do art. 18 da LGPD, você pode, a qualquer momento:

1. confirmar se tratamos os seus dados;
2. acessar os seus dados;
3. corrigir dados incompletos, inexatos ou desatualizados;
4. pedir a anonimização, o bloqueio ou a eliminação de dados desnecessários, excessivos ou tratados
   em desconformidade com a LGPD;
5. pedir a portabilidade dos dados a outro fornecedor;
6. pedir a eliminação dos dados tratados com base no consentimento;
7. saber com quem compartilhamos os seus dados;
8. ser informado sobre a possibilidade de não consentir e as consequências da negativa;
9. revogar o consentimento;
10. opor-se a tratamento realizado com fundamento em outra base legal, em caso de descumprimento da
    LGPD;
11. pedir a revisão de decisões tomadas unicamente com base em tratamento automatizado.

**Como exercer:**

- **Pela própria plataforma:** no painel do candidato você vê e corrige os seus dados, baixa o seu
  currículo, retira candidaturas e usa o botão **"Excluir meus dados"**, que elimina conta, perfil,
  currículo e candidaturas de forma imediata e definitiva.
- **Pelo e-mail barbsenglishteacher@gmail.com** (item 1), para os demais pedidos. Respondemos em até **15 dias**,
  contados do pedido (art. 19, II, da LGPD). Podemos pedir informações que confirmem a sua
  identidade antes de atender.

**Consequência de não fornecer os dados:** sem os dados obrigatórios não é possível criar a conta
de candidato; sem o currículo não é possível se candidatar a uma vaga. Todo perfil cadastrado
integra o banco de talentos, que é a finalidade do cadastro: se você não consentir com ele ou
revogar o consentimento, a conta não poderá ser mantida, e você pode excluí-la a qualquer momento
pelo botão "Excluir meus dados".

Você também pode apresentar reclamação à **Autoridade Nacional de Proteção de Dados (ANPD)** —
www.gov.br/anpd.

## 9. Segurança

Adotamos medidas técnicas e administrativas para proteger os dados contra acessos não autorizados
e situações acidentais ou ilícitas de destruição, perda, alteração ou divulgação, entre elas:
comunicação cifrada (HTTPS); senhas armazenadas apenas de forma cifrada pelo provedor de
autenticação; acesso restrito por perfil, apenas para a gerência; currículos em armazenamento
privado, disponíveis somente por links temporários de curta validade; limitação de tentativas de
cadastro e login.

Nenhum sistema é totalmente imune a incidentes. Se ocorrer um incidente de segurança que possa
acarretar risco ou dano relevante, comunicaremos você e a ANPD, nos termos do art. 48 da LGPD.

## 10. Cookies

A plataforma usa um **cookie estritamente necessário** (\`httpOnly\`) para manter a sua sessão
autenticada. Ele não é usado para publicidade nem para rastreamento, e sem ele não é possível
permanecer conectado. A área Trabalhe Conosco não usa cookies de terceiros para marketing.

## 11. Alterações deste Termo

Este Termo pode ser atualizado para refletir mudanças legais ou na plataforma. A versão e a data de
vigência ficam sempre no topo. Em caso de mudança relevante nas finalidades ou no compartilhamento,
pediremos um novo aceite no seu próximo acesso.

## 12. Legislação e foro

Este Termo é regido pela legislação brasileira. Fica eleito o foro do domicílio do titular para
dirimir questões dele decorrentes, nos termos do Código de Defesa do Consumidor, quando aplicável.

## 13. Contato

Dúvidas, pedidos e reclamações sobre este Termo: **barbsenglishteacher@gmail.com**.
`,
};
