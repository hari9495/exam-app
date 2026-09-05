// Minimal stub for Task 2 (service layer). Task 3 adds class-validator decorators.
export class CreateUserGroupDto {
  name!: string;
  description?: string;
  memberUserIds?: string[];
}
