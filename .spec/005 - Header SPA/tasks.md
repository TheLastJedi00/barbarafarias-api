## 6. Fases (visão geral)

Detalhe de tasks, branches e mensagens de commit em **[fix.md](./fix.md)**.

| Fase | Branch | Entrega |
|------|--------|---------|
| 1 — Fonte de navegação + ícone | `feature/fase1-nav-model` | `HeaderNavService` role-aware + ícone `menu` |
| 2 — Menu overlay (dumb) | `feature/fase2-nav-menu` | `nav-menu` com painel/blur/transições/a11y |
| 3 — Integração SPA + auto-open | `feature/fase3-header-integracao` | header consome o serviço; dashboards abrem modal por query param |
| Release | `release/header-spa` | README + **PR único** contra a `main` |

> `ng build` **verde e sem warnings** ao fim de cada fase. Verificação visual em ~360px e desktop,
> nos dois papéis (login com credenciais de teste), confirmando blur, empilhamento vertical e transições.
