# Investigação de Erro Crítico: Senhas Expostas na Coleção `users`

## Causa Raiz
A vulnerabilidade foi introduzida no dia **04 de maio de 2026**, através do commit `b76b032bf92615a6e042ada6a2a0a65bc18a039f` (`refactor do módulo user`). 
No `UserService.createUser()`, o DTO de criação (`CreateUserDto`) sempre possui o atributo `password`. Quando esse DTO é repassado integralmente para instanciar a entidade `User` (seja por `new User(dto)` ou `new User({ ...dto, role })`), a senha "pega carona". 
Como o construtor da classe `User` utiliza `Object.assign(this, data)`, o campo `password` é mesclado diretamente à instância do usuário, embora não faça parte da assinatura estrita de sua tipagem. Como resultado, ao persistir com `this.userRepository.save(user)`, a biblioteca do Firebase/Firestore serializa esse campo e salva a senha em texto limpo dentro do banco de dados (coleção `users`), ignorando práticas de criptografia ou armazenamento seguro no cofre de credenciais.

O erro ocorreu exclusivamente no `UserService`. A criação de gerentes/professoras através do `TeacherService.create` não foi afetada, já que esse serviço realiza o mapeamento explícito e individual dos atributos (descartando propriedades intrusas).

## Histórico nas Specs
O problema **já existia** antes do sistema de specs ser concebido na base do projeto (os arquivos da spec 001 foram consolidados só no fim de julho). Dessa forma, a falha atravessou todo o histórico de desenvolvimento documentado (da spec 001 à atual spec 011), expondo qualquer novo aluno registrado desde maio.

## Abordagem de Resolução e Resgate (Sem afetar a aplicação)

### 1. Prevenção e Bloqueio (Nível de Aplicação)
Em `UserService.createUser`, devemos desestruturar a senha fora do DTO para isolar a gravação:
```typescript
const { password, ...userFields } = dto;
const user = new User({ ...userFields, role });
```
Desta forma, a senha é utilizada para o `AuthService` em seguida descartada. O repositório passará a receber a entidade limpa.

### 2. Saneamento do Banco de Dados 
Para proteger e limpar as senhas já salvas na coleção `users`, recomendamos a criação imediata de um script (ou rota de manutenção exclusiva para admins) que:
1. Faça uma query em todos os registros da coleção `users`.
2. Onde existir uma propriedade `password`, aplique uma mutação utilizando `FieldValue.delete()` unicamente naquele campo.

Isso não causará nenhuma falha na aplicação nem nos logins futuros, já que a verificação verdadeira do login, tokens e senhas sempre foi realizada pelo FirebaseAuth de forma totalmente agnóstica à base do Firestore.
