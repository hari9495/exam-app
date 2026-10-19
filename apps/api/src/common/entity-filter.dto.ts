import { IsOptional, IsUUID } from 'class-validator';

/**
 * The company chosen in the top bar (design audit step 2): narrows a list to one legal entity. It never widens what a
 * person sees: RLS and the list's own grant check still decide. Personal ("mine") views ignore it.
 */
export class EntityFilterDto {
  @IsOptional()
  @IsUUID()
  legalEntityId?: string;
}
