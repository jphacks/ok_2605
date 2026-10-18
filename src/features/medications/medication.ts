// Shared by form hints, validation and SQLite write guards. Change here to revise the minimum.
export const MIN_PENALTY_AMOUNT = 100;

export type Medication = {
  id: number;
  name: string;
  doseTime: string;
  penaltyAmount: number;
  createdAt: string;
};

export type MedicationInput = {
  boxId?: string;
  name: string;
  doseTime: string;
  penaltyAmount: string;
};

export type MedicationFieldErrors = Partial<Record<keyof MedicationInput, string>>;

export type ValidatedMedicationInput = {
  name: string;
  doseTime: string;
  penaltyAmount: number;
};

export type MedicationValidationResult =
  | { success: true; value: ValidatedMedicationInput }
  | { success: false; errors: MedicationFieldErrors };

export function validateMedicationInput(input: MedicationInput): MedicationValidationResult {
  const errors: MedicationFieldErrors = {};
  const name = input.name.trim();
  const time = input.doseTime.normalize('NFKC').trim();
  const amount = input.penaltyAmount.normalize('NFKC').trim();
  const timeParts = /^(\d{1,2}):([0-5]\d)$/.exec(time);
  const penaltyAmount = Number(amount);

  if (!name) {
    errors.name = '薬名を入力してください。';
  } else if (Array.from(name).length > 100) {
    errors.name = '薬名は100文字以内で入力してください。';
  } else if (name.includes('\0')) {
    errors.name = '薬名に使用できない文字が含まれています。';
  }

  if (!timeParts || Number(timeParts[1]) > 23) {
    errors.doseTime = '服用時間を0:00〜23:59で入力してください。';
  }

  if (!/^\d+$/.test(amount) || !Number.isSafeInteger(penaltyAmount) || penaltyAmount < MIN_PENALTY_AMOUNT) {
    errors.penaltyAmount = `ペナルティ金額を${MIN_PENALTY_AMOUNT}円以上の整数で入力してください。`;
  }

  if (Object.keys(errors).length > 0 || !timeParts) {
    return { success: false, errors };
  }

  return {
    success: true,
    value: {
      name,
      doseTime: `${timeParts[1].padStart(2, '0')}:${timeParts[2]}`,
      penaltyAmount,
    },
  };
}

export class MedicationValidationError extends Error {
  readonly errors: MedicationFieldErrors;

  constructor(errors: MedicationFieldErrors) {
    super('薬の登録内容を確認してください。');
    this.name = 'MedicationValidationError';
    this.errors = errors;
  }
}
