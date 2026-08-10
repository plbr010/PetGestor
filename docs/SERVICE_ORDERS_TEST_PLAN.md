# Plano de testes — Ordens de Serviço

## Pré-requisitos

- Migrations de appointments e service_orders aplicadas
- Agendamentos de teste em status elegíveis

## Cenários

1. **Appointment scheduled → check-in** — cria ordem waiting; appointment vira confirmed
2. **Check-in duplicado** — botão não cria segunda ordem; redireciona para existente
3. **waiting → in_progress** — started_at preenchido; appointment in_progress
4. **in_progress → ready** — ready_at preenchido; appointment completed
5. **ready → completed** — completed_at preenchido; entrega finalizada
6. **Timestamps** — check_in ≤ started ≤ ready ≤ completed
7. **Notes** — intake, internal, completion salvos e validados
8. **Cancelar waiting** — waiting → cancelled
9. **Cancelar in_progress deve falhar**
10. **Cancelled appointment não gera ordem**
11. **No_show não gera ordem**
12. **Completed appointment não gera ordem**
13. **Empresa A invisível B** — RLS
14. **UUID A em B → 404** — `/dashboard/atendimentos/[id]`
15. **Histórico** — filtro status=completed
16. **Mobile** — listas verticais legíveis
17. **Appointment sincronizado** — status coerente após cada operação
18. **Snapshot preservado** — preço exibido vem do appointment, não do serviço atual

## Check-in com atraso

- Agendamento do mesmo dia com horário passado → check-in permitido

## Comandos automatizados

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
