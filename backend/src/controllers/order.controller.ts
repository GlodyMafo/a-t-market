import { Request, Response } from "express";

import {
  createOrderFromCart,
  getOrdersByUser,
   getOrderById
} from "../services/order.service";


// Create order

export async function createOrderController(
  req: Request,
  res: Response
) {

  try {

    const {
      userId
    } = req.body;


    const order =
      await createOrderFromCart(
        userId
      );


    return res.status(201).json({

      success:true,

      data:order

    });


  } catch(error:any){


    return res.status(400).json({

      success:false,

      message:error.message

    });


  }

}



// Get user orders

export async function getOrdersByUserController(

  req: Request,

  res: Response

) {


  try {


    const {
      userId
    } = req.params;



    const orders =
      await getOrdersByUser(
        userId
      );



    return res.json({

      success:true,

      data:orders

    });



  } catch(error:any){



    return res.status(400).json({

      success:false,

      message:error.message

    });


  }


}

export async function getOrderByIdController(

  req: Request,

  res: Response

) {

  try {

    const {
      id
    } = req.params;


    const order =
      await getOrderById(id);



    return res.json({

      success:true,

      data:order

    });


  } catch(error:any) {


    return res.status(404).json({

      success:false,

      message:error.message

    });

  }

}