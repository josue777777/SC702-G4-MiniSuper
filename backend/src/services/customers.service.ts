import type { CustomersRepository } from '../repositories/customers.repository.js';
import type { CreditTotals, CustomerDto } from '../types/sales.js';
import { formatCents, toCents } from '../utils/money.js';
import type { CreateCustomerInput } from '../validators/customers.validator.js';

/**
 * Saldo de fiado = ventas CREDIT acumuladas − abonos (docs/ARCHITECTURE.md).
 * Se calcula en céntimos exactos cada vez; nunca se guarda un saldo que pueda
 * desincronizarse del historial.
 */
export function creditBalance(totals: CreditTotals): string {
  return formatCents(toCents(totals.credited) - toCents(totals.paid));
}

/** Reglas del cliente básico para fiar (HU-18). El módulo completo es de HU-19/HU-30. */
export class CustomersService {
  constructor(private readonly repository: CustomersRepository) {}

  async listActiveCustomers(): Promise<CustomerDto[]> {
    const rows = await this.repository.listActive();

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      balance: creditBalance(row),
    }));
  }

  /** Crea un cliente activo, sin deuda. */
  async createCustomer(input: CreateCustomerInput): Promise<CustomerDto> {
    const created = await this.repository.create(input);

    return { id: created.id, name: created.name, phone: created.phone, balance: '0.00' };
  }
}
