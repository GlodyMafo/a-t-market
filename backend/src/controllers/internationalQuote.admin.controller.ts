import { Request, Response }
from "express";

import {

  getPendingQuotes,
  approveQuote,
  rejectQuote

}
from "../services/internationalQuote.admin.service";


export async function getPendingQuotesController(
  req: Request,
  res: Response
) {

  const quotes =
    await getPendingQuotes();

  return res.json({

    success: true,

    data: quotes

  });

}

export async function approveQuoteController(
  req: Request,
  res: Response
) {

  try {

    const quote =
      await approveQuote(

        req.params.id,

        req.body.adminNotes

      );

    return res.json({

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

export async function rejectQuoteController(
  req: Request,
  res: Response
) {

  try {

    const quote =
      await rejectQuote(

        req.params.id,

        req.body.adminNotes

      );

    return res.json({

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

