// Données envoyées à PawaPay pour initier un dépôt Mobile Money

export interface CreateDepositRequest {

  depositId: string;

  amount: string;

  currency: string;

  phoneNumber: string;

  provider: string;

  customerMessage?: string;

  orderId?: string;

}


// Réponse minimale attendue de PawaPay

export interface CreateDepositResponse {

  depositId: string;

  status: string;

}