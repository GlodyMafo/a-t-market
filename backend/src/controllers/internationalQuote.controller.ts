import { Request, Response } from "express";

import { createInternationalQuote, getUserQuotes} from "../services/internationalQuote.service";

export async function createInternationalQuoteController(
  req: Request,
  res: Response
) {

  try {

    const quote =
      await createInternationalQuote(

        req.body.userId,

        req.body.productUrl,

        req.body.productName,

        req.body.productPrice,

        req.body.subCategoryId

      );

    return res.status(201).json({

      success: true,

      data: quote

    });

  } catch (error: any) {

    return res.status(400).json({

      success: false,

      message: error.message

    });

  }

}


export async function getUserQuotesController(
  req: Request,
  res: Response
) {

  const quotes =
    await getUserQuotes(
      req.params.userId
    );

  return res.json({

    success: true,

    data: quotes

  });

}