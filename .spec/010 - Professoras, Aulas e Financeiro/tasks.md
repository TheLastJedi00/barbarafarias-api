## 9. Fases & Tasks (proposta)

> Cada fase = uma branch `feature/faseN-*` no repo indicado, a partir da `dev` (empilhadas).

| Fase | Repo | Branch | Escopo |
|------|------|--------|--------|
| 1 | be | `feature/fase1-papeis-professoras` | `ROLES.MANAGER`, leitura tolerante, `POST /admin/migrate-roles`, módulo `teachers` (CRUD, desativação, DTOs por papel), filtro `?role=` |
| 2 | be | `feature/fase2-agenda-multi-professora` | `teacherId` no slot + novo docId + migração, vínculo aluno↔professora, `makeupSlot`, `meetUrl` do aluno/turma, `pendingTeacher` |
| 3 | be | `feature/fase3-lessons` | Coleção `lessons`, materialização idempotente, consultas semana/mês/dia |
| 4 | be | `feature/fase4-aula-ao-vivo` | Janela de acesso ao Meet, gatilhos de presença (primário/secundário 72 h), aviso prévio do aluno, reposição automática, avaliação |
| 5 | be | `feature/fase5-reagendamento` | `reschedule_requests` (planned + no_show), regra das 4 h, motivo classificado, sugestão pós-ausência, aprovação/recusa |
| 6 | be | `feature/fase6-notificacoes-resend` | `NotificationsModule` + Resend (remetente no domínio próprio), templates dos eventos, alertas do dashboard, **`.env.example` versionado** (RNF8.1) |
| 7 | be | `feature/fase7-financeiro` | Valor-hora global + override, `rateApplied`, `payable`, fechamento mensal, porta `PayoutProvider` |
| 8 | be | `feature/fase8-feedback-evolucao` | Coleção `student_feedbacks` + endpoints (Q2) |
| 9 | fe | `feature/fase9-gerente-professoras` | Telas de professoras, designação de alunos, salas, ação de migração |
| 10 | fe | `feature/fase10-dashboard-e-financeiro` | "Aulas de hoje", alertas, fila de aprovação com justificativas, painel financeiro |
| 11 | fe | `feature/fase11-professora-agenda` | Agenda semanal + **mensal**, detalhe da aula, presença, reagendamento (planejado e sugerido), avaliações, feedback do aluno |
| 12 | fe | `feature/fase12-aluno-aula` | Card da professora, "Entrar na aula", "não poderei comparecer", avisos de reagendamento, avaliação em estrelas |
| — | be+fe | `release/professoras-aulas-financeiro` | README de cada repo + 1 PR por repo contra a `dev` |

---
