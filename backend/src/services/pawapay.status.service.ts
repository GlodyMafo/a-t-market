import { env } from "../config/env";


export async function getDepositStatus(
    depositId:string
) {


    const response = await fetch(

        `${env.PAWAPAY_BASE_URL}/v2/deposits/${depositId}`,

        {

            method:"GET",

            headers:{

                Authorization:
                    `Bearer ${env.PAWAPAY_API_KEY}`

            }

        }

    );



    const text =
        await response.text();



    console.log(
        "PAWAPAY STATUS RESPONSE:",
        text
    );



    if(!response.ok){

        throw new Error(
            `PawaPay status error: ${text}`
        );

    }



    return JSON.parse(text);

}