export interface CreateDepositRequest {

  depositId: string;

  amount: string;

  currency: string;

  phoneNumber: string;

  provider: string;

  customerMessage?: string;

  orderId?: string;

}