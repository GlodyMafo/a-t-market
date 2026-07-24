import { prisma } from "../lib/prisma";
import slugify from "slugify";

interface CreateProductData {

  name: string;
  description?: string;
  price: number;
  margin: number;
  images: string[];
  subCategoryId: string;

}

// Create a product

export async function createProduct(data: CreateProductData) {

  const {
    name,
    description,
    price,
    margin,
    images,
    subCategoryId
  } = data;

  const slug = slugify(name, {
    lower: true,
    strict: true
  });


  if (images.length > 3) {
    throw new Error(
      "Maximum 3 images par produit"
    );
  }

  const subCategory =
    await prisma.subCategory.findUnique({

      where: {
        id: subCategoryId
      }

    });

  if (!subCategory) {

    throw new Error(
      "Sous-catégorie introuvable"
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
            margin,
            currency: "USD",
            type: "LOCAL",
            subCategoryId,

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


// Get all active products

export async function getProducts() {

  const products = await prisma.product.findMany({
    where: {
      isActive: true // Ici nous prenons uniquement les produits actifs
    },

    include: {

      images: true,

      inventory: true,

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


  return products;
}

// Get product details by ID

export async function getProductById(id: string) {

  const product = await prisma.product.findUnique({
    where: {
      id
    },

    include: {

      images: true,

      inventory: true,

      subCategory: {

        include: {

          category: true

        }

      }

    }
  });


  if (!product) {
    throw new Error("Produit introuvable");
  }


  return product;
}