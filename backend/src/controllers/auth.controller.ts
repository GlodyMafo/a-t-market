import { Request, Response } from "express";

import {
  register,
  login,
  getCurrentUser
} from "../services/auth.service";

import {
  registerSchema,
  loginSchema
} from "../validators/auth.validator";

import { AuthRequest }
  from "../middlewares/auth.middleware";




export async function registerController(

  req: Request,

  res: Response

) {

  try {

    const validatedData =
      registerSchema.parse(
        req.body
      );

    const result =
      await register(
        validatedData
      );

    return res.status(201).json({

      success: true,

      data: result

    });

  } catch (error: any) {

    return res.status(400).json({

      success: false,

      message:
        error.message

    });

  }

}



export async function loginController(

  req: Request,

  res: Response

) {

  try {

    const validatedData =
      loginSchema.parse(
        req.body
      );

    const result =
      await login(
        validatedData
      );

    return res.status(200).json({

      success: true,

      data: result

    });

  } catch (error: any) {

    return res.status(400).json({

      success: false,

      message:
        error.message

    });

  }

}


export async function meController(

  req: AuthRequest,

  res: Response

) {

  try {

    const user =
      await getCurrentUser(
        req.user!.userId
      );

    return res.json({

      success: true,

      data: user

    });

  } catch (error: any) {

    return res.status(404).json({

      success: false,

      message: error.message

    });

  }

}