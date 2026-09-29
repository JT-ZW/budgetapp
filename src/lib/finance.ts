import type { Currency, LedgerTransaction } from './types/finance';

const AMOUNT_PATTERN = /^(?:0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

/** Parse a user-entered amount into integer minor units without floating-point math. */
export function toMinorUnits(value: string): bigint {
	const normalized = value.trim();
	const match = AMOUNT_PATTERN.exec(normalized);
	if (!match) throw new Error('Enter a positive amount with no more than two decimal places.');

	const [wholePart, fractionPart = ''] = normalized.split('.');
	const minor = BigInt(wholePart) * 100n + BigInt(fractionPart.padEnd(2, '0') || '0');
	if (minor <= 0n) throw new Error('Amount must be greater than zero.');
	return minor;
}

/** Format integer minor units while keeping USD and ZiG totals visually distinct. */
export function formatMoney(minorUnits: bigint, currency: Currency): string {
	const negative = minorUnits < 0n;
	const absolute = negative ? -minorUnits : minorUnits;
	const major = absolute / 100n;
	const fraction = (absolute % 100n).toString().padStart(2, '0');
	const locale = currency === 'USD' ? 'en-US' : 'en-ZW';
	const groupedMajor = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(major);
	const sign = negative ? '-' : '';

	return currency === 'USD'
		? `${sign}$${groupedMajor}.${fraction}`
		: `${sign}ZiG ${groupedMajor}.${fraction}`;
}

/** Compute one account's balance from its opening balance and ledger rows. */
export function calculateAccountBalance(
	accountId: string,
	openingBalance: string,
	transactions: LedgerTransaction[]
): bigint {
	let balance = decimalToMinorUnits(openingBalance);

	for (const transaction of transactions) {
		if (transaction.kind === 'transfer') {
			if (transaction.account_id === accountId) {
				balance -= decimalToMinorUnits(transaction.amount);
				balance -= decimalToMinorUnits(transaction.fee_amount);
			}
			if (transaction.destination_account_id === accountId && transaction.destination_amount) {
				balance += decimalToMinorUnits(transaction.destination_amount);
			}
			continue;
		}

		if (transaction.account_id !== accountId) continue;
		const amount = decimalToMinorUnits(transaction.amount);
		balance += transaction.kind === 'income' ? amount : -amount;
	}

	return balance;
}

export function decimalToMinorUnits(value: string): bigint {
	const normalized = value.trim();
	const match = /^(-?)(?:0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(normalized);
	if (!match) throw new Error(`Invalid stored amount: ${value}`);
	const [wholePart, fractionPart = ''] = normalized.replace(/^-/, '').split('.');
	const absolute = BigInt(wholePart) * 100n + BigInt(fractionPart.padEnd(2, '0') || '0');
	return match[1] === '-' ? -absolute : absolute;
}
