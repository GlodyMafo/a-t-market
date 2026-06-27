import { env } from "../config/env";

import {
  CreateDepositRequest
} from "../types/pawapay";


export async function createDeposit(

  data: CreateDepositRequest

) {


  try {


    const response = await fetch(

      `${env.PAWAPAY_BASE_URL}/v2/deposits`,

      {


        method: "POST",


        headers: {


          Authorization:
            `Bearer ${env.PAWAPAY_API_KEY}`,


          "Content-Type":
            "application/json"


        },


        body: JSON.stringify({


          depositId:
            data.depositId,


          amount:
            data.amount,


          currency:
            data.currency,


          payer: {


            type:
              "MMO",


            accountDetails: {


              phoneNumber:
                data.phoneNumber,


              provider:
                data.provider


            }


          },


          customerMessage:
            data.customerMessage ?? "AT MARKET",


          metadata: [

            {

              orderId:
                data.orderId

            }

          ]


        })


      }

    );



    if (!response.ok) {


      const error =
        await response.text();


      throw new Error(error);


    }



    const result =
      await response.json();



    return result;



  } catch(error:any) {


    throw new Error(

      error.message ||
      "Erreur PawaPay"

    );


  }


}