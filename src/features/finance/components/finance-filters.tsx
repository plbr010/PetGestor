import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

type FinanceFiltersProps = {
  from: string;
  to: string;
  preset: string;
  type: string;
  status: string;
  payment: string;
  query: string;
};

export function FinanceFilters({
  from,
  to,
  preset,
  type,
  status,
  payment,
  query,
}: FinanceFiltersProps) {
  return (
    <form action="/dashboard/financeiro" method="get" className="grid gap-4 lg:grid-cols-4">
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="preset" value={preset} />

      <div className="space-y-2">
        <Label htmlFor="q">Busca</Label>
        <Input id="q" name="q" defaultValue={query} placeholder="Descrição ou categoria" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="type">Tipo</Label>
        <Select id="type" name="type" defaultValue={type}>
          <option value="all">Todos</option>
          <option value="income">Receita</option>
          <option value="expense">Despesa</option>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="status">Status</Label>
        <Select id="status" name="status" defaultValue={status}>
          <option value="all">Todos</option>
          <option value="pending">Pendente</option>
          <option value="paid">Pago</option>
          <option value="cancelled">Cancelado</option>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="payment">Forma de pagamento</Label>
        <Select id="payment" name="payment" defaultValue={payment}>
          <option value="all">Todas</option>
          <option value="cash">Dinheiro</option>
          <option value="pix">Pix</option>
          <option value="debit_card">Cartão de débito</option>
          <option value="credit_card">Cartão de crédito</option>
          <option value="bank_transfer">Transferência</option>
          <option value="other">Outro</option>
        </Select>
      </div>

      <div className="lg:col-span-4">
        <button type="submit" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">
          Filtrar
        </button>
      </div>
    </form>
  );
}
