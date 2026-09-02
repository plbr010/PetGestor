# Plano de testes — Agenda (Appointments)

## Pré-requisitos

- Migration `20260806073000_appointments.sql` aplicada
- Tutores, pets, serviços (fixed e by_size), funcionários com jornada e serviços vinculados

## Cenários

1. **Serviço fixed** — criar agendamento; verificar preço/duração do snapshot
2. **Serviço by_size** — exigir porte; snapshot correto por porte
3. **Cálculo de preço** — servidor grava centavos; UI exibe BRL do snapshot
4. **Cálculo de duração** — `scheduled_end = start + duration`
5. **Horário válido** — dentro da jornada
6. **Fora da jornada** — rejeitar (ex.: após fim ou dia sem jornada)
7. **Funcionário errado** — profissional sem vínculo ao serviço → erro amigável
8. **Funcionário inativo** — rejeitar
9. **Serviço inativo** — rejeitar novos agendamentos
10. **Pet arquivado** — rejeitar
11. **Tutor arquivado** — rejeitar
12. **Conflito funcionário** — dois agendamentos sobrepostos → erro
13. **Conflito pet** — mesmo pet em horários sobrepostos → erro
14. **Horários consecutivos** — 10:00–11:00 e 11:00–12:00 permitidos
15. **Editar** — alterar observações
16. **Reagendar** — mudar data/hora; snapshot preservado se serviço/porte iguais
17. **Confirmar** — scheduled → confirmed
18. **Cancelar** — libera slot; mantém registro
19. **No-show** — scheduled/confirmed → no_show
20. **Agenda dia** — listagem correta
21. **Agenda semana** — cards por dia; mobile lista agrupada
22. **Filtro funcionário** — `?employee=uuid`
23. **Filtro status** — `?status=confirmed` etc.
24. **Empresa A invisível B** — RLS
25. **UUID Empresa A em B** — `/dashboard/agenda/[id]` → 404
26. **Preço histórico** — alterar serviço após agendar; snapshot antigo inalterado
27. **Concorrência** — duas abas criando mesmo horário; apenas uma deve persistir (EXCLUDE)

28. **Pacote vendido** — após vender pacote na ficha do pet, o formulário de novo agendamento lista o pacote (tutor + pet + serviço compatível)
29. **Pacote só catálogo** — criar modelo em Serviços → Pacotes sem vender: o agendamento explica que o pacote ainda não foi atribuído ao pet
30. **Consumo único** — criar agendamento com pacote desconta 1 sessão; reagendar não desconta outra; cancelar devolve o saldo
31. **Agendamento sem pacote** — fluxo avulso continua cobrando o preço do serviço

## Concorrência (detalhe)

1. Abrir duas sessões autenticadas na mesma empresa
2. Tentar criar agendamento idêntico (mesmo profissional, pet diferente ou igual, mesmo intervalo) simultaneamente
3. Esperado: uma requisição sucede; a outra retorna mensagem amigável de conflito
4. Proteção final: constraint EXCLUDE no PostgreSQL, não apenas checagem na RPC

## Comandos automatizados

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Testes unitários: schemas, status, utils, timezone (`src/features/appointments/*.test.ts`, `src/lib/timezone.test.ts`).
