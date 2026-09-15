import { IsUUID } from 'class-validator';

export class CreateCheckoutDto {
  // The public plan the org wants to subscribe to; its Stripe price backs the Checkout session.
  @IsUUID('4') planId!: string;
}
