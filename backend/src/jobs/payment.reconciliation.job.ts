import cron from "node-cron";

import { reconcilePendingPayments } 
from "../services/payment.reconciliation.service";



export function startPaymentReconciliationJob(){


    cron.schedule(
        
        "*/5 * * * *",

        async()=>{


            console.log(
                "🔄 PAYMENT RECONCILIATION START"
            );


            try{


                await reconcilePendingPayments();



                console.log(
                    "✅ PAYMENT RECONCILIATION DONE"
                );


            }
            catch(error:any){


                console.error(

                    "❌ RECONCILIATION JOB ERROR:",
                    error.message

                );

            }


        }

    );


    console.log(
        "Payment reconciliation scheduler started"
    );


}