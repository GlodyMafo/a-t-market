import { prisma } from "../lib/prisma";

interface CreateProductData {
  name: string;
  slug: string;
  description?: string;
  price: number;
  images: string[];
}


export async function createProduct(data: CreateProductData) {

  const {
    name,
    slug,
    description,
    price,
    images
  } = data;


  if (images.length > 3) {
    throw new Error(
      "Maximum 3 images par produit"
    );
  }


  const product = await prisma.$transaction(
    async (tx) => {


      const createdProduct =
        await tx.product.create({
          data: {
            name,
            slug,
            description,
            price,
            currency: "USD",
            type: "LOCAL",

            images: {
              create: images.map(
                (image, index) => ({
                  imageUrl: image,
                  position: index + 1
                })
              )
            },


            inventory: {
              create: {
                quantity: 0
              }
            }
          },


          include: {
            images: true,
            inventory: true
          }
        });


      return createdProduct;

    }
  );


  return product;
}