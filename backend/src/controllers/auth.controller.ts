import { Request, Response } from "express";

import {
  register,
  login
} from "../services/auth.service";

import {
  registerSchema,
  loginSchema
} from "../validators/auth.validator";



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