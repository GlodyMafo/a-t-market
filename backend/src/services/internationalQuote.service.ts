import { prisma } from "../lib/prisma";

export async function createInternationalQuote(

    userId: string,

    productUrl: string,

    productName: string,

    productPrice: number,

    subCategoryId: string

) {

    const settings =
        await prisma.globalSettings.findFirst();

    if (!settings) {

        throw new Error(
            "Configuration système introuvable"
        );

    }

    const weightCatalog =
        await prisma.weightCatalog.findUnique({

            where: {
                subCategoryId
            }

        });


    let productWeight = 0;

    let shippingCost = 0;

    let status = "PENDING_REVIEW";


    if (weightCatalog) {

        productWeight =
            Number(
                weightCatalog.estimatedWeightKg
            );

        shippingCost =
            productWeight *
            Number(
                settings.chinaPricePerKg
            );

        status =
            "AUTO_APPROVED";

    }


    const commissionCost =
        productPrice *
        (
            Number(settings.commissionRate)
            / 100
        );

    const customsCost = 0;

    const totalPrice =
        productPrice +
        shippingCost +
        commissionCost +
        customsCost +
        Number(settings.fixedFee);

    return prisma.internationalQuote.create({

        data: {

            userId,

            productUrl,

            productName,

            productPrice,

            productWeight,

            shippingCost,

            customsCost,

            commissionCost,

            totalPrice,

            subCategoryId,

            status,

            adminNotes:
                status === "PENDING_REVIEW"
                    ? "Poids introuvable, validation admin requise"
                    : null,

        }

    });

}


export async function getUserQuotes(
    userId: string
) {

    return prisma.internationalQuote.findMany({

        where: {
            userId
        },

        include: {

            subCategory: {

                include: {

                    category: true

                }

            }

        },

        orderBy: {

            createdAt: "desc"

        }

    });

}