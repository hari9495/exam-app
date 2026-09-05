// Minimal stub — Task 4 adds class-validator decorators.
export class CreateCustomFieldDto {
  entityType!: 'candidate' | 'job';
  label!: string;
  fieldType!: 'text' | 'number' | 'date' | 'select';
  options?: string[];
  required?: boolean;
  showOnApply?: boolean;
  position?: number;
}
