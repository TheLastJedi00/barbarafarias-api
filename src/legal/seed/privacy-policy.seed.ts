import type { LegalSeed } from './legal-seed';

/**
 * Texto da versão 1.0 — Política de Privacidade (spec 029). **Só semente:** o
 * `POST /legal/admin/seed` publica isto uma vez, e daí em diante o banco é a
 * fonte e toda mudança passa pelo Painel Jurídico. Editar aqui depois da
 * semeadura não muda nada no ar.
 *
 * Origem: `.claude/specs/029 - Painel Jurídico/politica-de-privacidade.md`.
 */
export const PRIVACY_POLICY_SEED: LegalSeed = {
  type: 'privacy-policy',
  title: 'Política de Privacidade',
  markdown: `Esta Política explica como a escola **Bárbara Farias** trata os dados pessoais de quem usa a
plataforma barbarafarias.com.br — alunos, professoras, gerência, candidatos a vagas e visitantes —,
nos termos da Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais — **LGPD**), do Marco Civil
da Internet (Lei nº 12.965/2014) e do Código de Defesa do Consumidor (Lei nº 8.078/1990).

Ao criar conta ou continuar usando a plataforma depois de aceitar esta Política, você declara que a
leu e compreendeu. O aceite é registrado com data, hora, versão, endereço IP e navegador utilizado.

Quem se candidata a vagas na área **Trabalhe Conosco** tem, além desta Política, um termo específico
para o processo seletivo, disponível na própria área.

---

## 1. Quem é o controlador dos dados

O controlador dos dados pessoais tratados na plataforma é a escola **Bárbara Farias** ("**nós**").

**Encarregado pelo tratamento de dados (DPO):** atende pelo e-mail
**barbsenglishteacher@gmail.com**. É por este canal que você exerce os seus direitos (item 10) e
tira dúvidas sobre esta Política.

## 2. Quais dados tratamos

Tratamos apenas os dados necessários a cada finalidade (princípio da necessidade, art. 6º, III, da
LGPD).

### 2.1. Alunos

| dado | para quê |
|---|---|
| Nome completo, e-mail, telefone | conta, contato, avisos sobre aulas |
| Senha | acesso; armazenada apenas de forma cifrada pelo provedor de autenticação, sem acesso da nossa equipe |
| CPF | identificação do pagador exigida pelo meio de pagamento e emissão de cobranças |
| Nível de inglês, objetivos, prognóstico da professora, apresentação (bio) e foto de perfil | personalização das aulas e do material |
| Agenda, aulas, presença, reagendamentos, avaliações e comentários sobre aulas | execução do serviço contratado e qualidade do ensino |
| Plano contratado, situação de pagamento, histórico de cobranças e aceite do contrato do plano | cobrança, controle de acesso ao conteúdo pago e prova da contratação |
| Material didático gerado para o aluno | entrega do conteúdo personalizado |

**Dados de cartão não passam pela nossa plataforma:** são digitados diretamente no ambiente do
Mercado Pago, que os processa como controlador independente, sob suas próprias políticas. Guardamos
apenas a identificação da cobrança e a sua situação.

### 2.2. Professoras

Nome, e-mail, telefone, CPF, CNPJ (quando houver), chave PIX, valor-hora, foto, apresentação, agenda,
aulas ministradas e registros de repasse — para execução da relação de prestação de serviços,
pagamento e organização das aulas.

### 2.3. Candidatos a vagas (Trabalhe Conosco)

Os dados e regras estão no **Termo de Privacidade e Tratamento de Dados — Processo Seletivo**, que
complementa esta Política.

### 2.4. Todos os usuários e visitantes

- **Registros de acesso:** endereço IP, data e hora, para segurança e para cumprir o art. 15 do
  Marco Civil da Internet.
- **Registro dos aceites** desta Política e dos Termos de Uso (versão, data, hora, IP e navegador).
- **Cookie de sessão** e preferências locais (item 9).

### 2.5. Dados sensíveis e de crianças e adolescentes

Não pedimos dados sensíveis (art. 5º, II, da LGPD). Recomendamos não incluí-los em campos de texto
livre (objetivos, apresentação, comentários).

**Alunos menores de 18 anos** só podem usar a plataforma com o consentimento específico e em destaque
de pelo menos um dos pais ou do responsável legal, que realiza a contratação e o aceite (art. 14 da
LGPD). Tratamos os dados de crianças e adolescentes no seu melhor interesse e apenas para as
finalidades de ensino descritas aqui.

## 3. Para que usamos os dados e com qual base legal

| finalidade | base legal (LGPD) |
|---|---|
| Criar e manter a conta, autenticar o acesso | execução de contrato (art. 7º, V) |
| Prestar as aulas, agendar, registrar presença, gerar e entregar material personalizado | execução de contrato (art. 7º, V) |
| Cobrar, controlar o acesso pago e guardar a prova da contratação | execução de contrato (art. 7º, V) e exercício regular de direitos (art. 7º, VI) |
| Emitir documentos fiscais e cumprir obrigações contábeis e tributárias | cumprimento de obrigação legal (art. 7º, II) |
| Pagar e organizar o trabalho das professoras | execução de contrato (art. 7º, V) |
| Enviar avisos transacionais (aulas, reagendamentos, cobranças, candidaturas) | execução de contrato (art. 7º, V) |
| Segurança, prevenção a fraudes e abusos (limite de tentativas, registros de acesso) | legítimo interesse (art. 7º, IX) e obrigação legal (art. 7º, II; Marco Civil, art. 15) |
| Melhorar a qualidade das aulas a partir de avaliações | legítimo interesse (art. 7º, IX), com expectativa do aluno e possibilidade de oposição |
| Dados de alunos menores de idade | consentimento específico de pai, mãe ou responsável (art. 14, § 1º) |
| Defesa em processos judiciais, administrativos ou arbitrais | exercício regular de direitos (art. 7º, VI) |

**Não** usamos os seus dados para publicidade de terceiros, **não** os vendemos e **não** enviamos
marketing sem o seu consentimento.

## 4. Inteligência artificial na geração de material

O material didático personalizado é gerado com apoio de um modelo de inteligência artificial
(Google Gemini). Para isso enviamos **apenas** o primeiro nome do aluno, o nível, os objetivos de
aprendizagem e o prognóstico pedagógico da professora — nunca e-mail, telefone, CPF ou dados de
pagamento. O conteúdo gerado é revisado e acompanhado pela professora. Não há decisão sobre o aluno
tomada exclusivamente por meio automatizado (art. 20 da LGPD); se entender que houve, você pode
pedir revisão pelo canal do item 1.

## 5. Com quem compartilhamos

Os dados são acessados pela gerência e, no que é necessário às aulas, pela **professora responsável**
pelo aluno. Professoras não veem CPF nem dados de pagamento de alunos.

Para operar a plataforma contamos com prestadores (operadores) que tratam os dados só sob nossas
instruções:

| prestador | serviço |
|---|---|
| Google LLC (Firebase / Google Cloud) | autenticação, banco de dados, armazenamento de arquivos e hospedagem do site |
| Vercel Inc. | hospedagem do servidor da aplicação |
| Google LLC (Gemini) | geração de material didático (dados mínimos, item 4) |
| Mux, Inc. | transmissão das vídeo aulas, sem coleta de métricas de navegação dos alunos |
| Resend, Inc. | envio de e-mails transacionais |
| Google LLC (Google Meet) | salas das aulas ao vivo, quando utilizadas |

O **Mercado Pago** recebe os dados necessários ao pagamento como **controlador independente**,
conforme a política de privacidade dele.

Também compartilhamos dados com autoridades quando houver obrigação legal, regulatória ou ordem
judicial.

## 6. Transferência internacional

Alguns prestadores armazenam ou processam dados fora do Brasil, inclusive nos Estados Unidos. A
transferência ocorre nas hipóteses do art. 33 da LGPD, com fornecedores que adotam cláusulas
contratuais de proteção de dados e padrões de segurança compatíveis com a lei brasileira.

## 7. Por quanto tempo guardamos

| dado | prazo |
|---|---|
| Conta e dados de perfil | enquanto a conta existir |
| Aulas, material, avaliações | enquanto a conta existir |
| Cobranças, contratos aceitos e documentos fiscais | 5 anos após o fim da relação (prazos do Código Civil, do CDC e da legislação tributária) |
| Registros de acesso | 6 meses (Marco Civil, art. 15) |
| Registro dos aceites desta Política e dos Termos de Uso | enquanto houver relação e pelo prazo de prescrição aplicável, como prova |

Encerrada a finalidade, os dados são eliminados ou anonimizados, salvo as hipóteses de conservação
do art. 16 da LGPD (obrigação legal, exercício regular de direitos). Cópias de segurança dos
prestadores são sobrescritas nos ciclos regulares deles.

## 8. Segurança

Adotamos medidas técnicas e administrativas para proteger os dados contra acessos não autorizados e
situações acidentais ou ilícitas de destruição, perda, alteração ou divulgação, entre elas:
comunicação cifrada (HTTPS); senhas guardadas apenas de forma cifrada pelo provedor de autenticação;
sessão em cookie protegido (\`httpOnly\`); controle de acesso por perfil (aluno, professora, gerência,
candidato); arquivos e vídeos em armazenamento privado, servidos só por links temporários assinados;
limite de tentativas de login e cadastro.

Nenhum sistema é totalmente imune a incidentes. Se ocorrer um incidente de segurança que possa
acarretar risco ou dano relevante, comunicaremos você e a Autoridade Nacional de Proteção de Dados
(ANPD), nos termos do art. 48 da LGPD.

## 9. Cookies e armazenamento local

- **Cookie de sessão** (estritamente necessário, \`httpOnly\`): mantém você conectado. Sem ele não é
  possível usar a área logada.
- **Armazenamento local do navegador:** guarda preferências como o tema claro/escuro e um indicador
  de sessão, sem dado pessoal.

Não usamos cookies de publicidade nem de rastreamento de terceiros. As vídeo aulas são exibidas com a
coleta de métricas do player desativada.

## 10. Seus direitos

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

**Como exercer:** boa parte dos dados você mesmo consulta e corrige na tela **Meu perfil**. Para os
demais pedidos, escreva para **barbsenglishteacher@gmail.com**. Respondemos em até **15 dias**,
contados do pedido (art. 19, II, da LGPD), e podemos pedir informações que confirmem a sua identidade.

A eliminação dos dados encerra a conta e o acesso ao conteúdo; dados que precisamos guardar por lei
(item 7) são mantidos só pelo prazo exigido.

Você também pode apresentar reclamação à **Autoridade Nacional de Proteção de Dados (ANPD)** —
www.gov.br/anpd — e aos órgãos de defesa do consumidor.

## 11. Alterações desta Política

Esta Política pode ser atualizada para refletir mudanças legais ou na plataforma. A versão e a data
de vigência ficam sempre no topo, e as versões anteriores continuam disponíveis para consulta. Em
mudança relevante de finalidade ou de compartilhamento, pediremos um novo aceite no seu próximo
acesso.

## 12. Legislação e foro

Esta Política é regida pela legislação brasileira. Fica eleito o foro do domicílio do titular para
dirimir questões dela decorrentes, nos termos do Código de Defesa do Consumidor, quando aplicável.

## 13. Contato

Dúvidas, pedidos e reclamações sobre esta Política: **barbsenglishteacher@gmail.com**.
`,
};
